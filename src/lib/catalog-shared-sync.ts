import { createClient } from "@supabase/supabase-js";
import type { EditorConfig, EditorVehicleDetails, ManualPublication } from "@/types/editor";

type SyncResult = {
  rematesUpserted: number;
  remateItemsUpserted: number;
  inventoryCreated: number;
  inventoryUpdated: number;
  skipped: string[];
};

type RemateSyncRow = {
  id: string;
  fecha_hora_remate: string;
  descripcion: string;
  estado: "abierto";
};

type RemateItemSyncRow = {
  remate_id: string;
  patente: string;
  marca: string | null;
  modelo: string | null;
  ano: string | null;
  version: string | null;
  kilometraje: string | null;
  valor_minimo: number | null;
  valor_esperado: number | null;
  tipo_documento: "factura_exenta";
  extra_fields: Record<string, unknown>;
};

type InventarioLookup = {
  id: string;
  patente: string | null;
  estado_retiro: string | null;
};

const INVENTARIO_TABLE = process.env.CATALOG_SYNC_INVENTARIO_TABLE ?? "inventario";
const REMATES_TABLE = process.env.CATALOG_SYNC_REMATES_TABLE ?? "remates";
const REMATES_ITEMS_TABLE = process.env.CATALOG_SYNC_REMATES_ITEMS_TABLE ?? "remates_items";

const ESTADO_RETIRO_REMATE = "en_bodega_a_remate";
const ESTADO_RETIRO_VENTA_DIRECTA = "en_bodega_a_venta_directa";
const ESTADO_RETIRO_DEFAULT = "en_tasacion";

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normalizePatent(value?: string | null): string {
  return String(value ?? "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "");
}

function isUuid(value?: string | null): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value ?? ""),
  );
}

function parseClpAmount(value?: string | null): number | null {
  if (!value?.trim()) return null;
  const digits = value.replace(/[^\d-]/g, "");
  if (!digits) return null;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

function parseDateToRemateTimestamp(dateInput: string, remateName?: string): string | null {
  const date = dateInput.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const timeMatch = remateName?.match(/(\d{1,2}):(\d{2})/);
  const hours = timeMatch ? Math.min(23, Math.max(0, Number(timeMatch[1]))) : 15;
  const minutes = timeMatch ? Math.min(59, Math.max(0, Number(timeMatch[2]))) : 0;
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  return `${date}T${hh}:${mm}:00.000Z`;
}

function manualById(config: EditorConfig): Map<string, ManualPublication> {
  return new Map((config.manualPublications ?? []).map((entry) => [entry.id, entry]));
}

function resolveVehicleDetails(config: EditorConfig, vehicleKey: string): EditorVehicleDetails | null {
  return config.vehicleDetails?.[vehicleKey] ?? null;
}

function resolveVehiclePatent(
  config: EditorConfig,
  vehicleKey: string,
): { patente: string; isSynthetic: boolean } | null {
  if (vehicleKey.startsWith("manual-")) {
    const manualId = vehicleKey.slice("manual-".length);
    const manual = manualById(config).get(manualId);
    const normalized = normalizePatent(manual?.patente);
    if (normalized) return { patente: normalized, isSynthetic: false };
    return { patente: `CAT${manualId.replace(/-/g, "").slice(0, 8).toUpperCase()}`, isSynthetic: true };
  }

  const fromDetails = normalizePatent(resolveVehicleDetails(config, vehicleKey)?.patente);
  if (fromDetails) return { patente: fromDetails, isSynthetic: false };

  const fromKey = normalizePatent(vehicleKey);
  if (/^[A-Z0-9]{5,10}$/.test(fromKey) && !isUuid(fromKey)) {
    return { patente: fromKey, isSynthetic: false };
  }

  return null;
}

function buildInventarioPayload(
  config: EditorConfig,
  vehicleKey: string,
  patente: string,
  estadoRetiro: string,
): Record<string, unknown> {
  const manualId = vehicleKey.startsWith("manual-") ? vehicleKey.slice("manual-".length) : "";
  const manual = manualId ? manualById(config).get(manualId) : undefined;
  const details = resolveVehicleDetails(config, vehicleKey);
  const title = manual?.title ?? details?.title ?? `Unidad ${patente}`;
  const parsedTitle = title.trim();
  const split = parsedTitle.split(/\s+/);
  const marca = manual?.brand ?? details?.brand ?? split[0] ?? "Sin Marca";
  const modelo =
    manual?.model ??
    details?.model ??
    split.slice(1).join(" ").trim() ??
    details?.version ??
    "Sin Modelo";
  const valorMinimo =
    parseClpAmount(config.vehiclePrices?.[vehicleKey]) ??
    parseClpAmount(details?.originalPrice) ??
    parseClpAmount(manual?.originalPrice);
  const valorEsperado =
    parseClpAmount(details?.promoPrice) ??
    parseClpAmount(manual?.promoPrice) ??
    valorMinimo;
  const descripcion = manual?.description ?? details?.description ?? details?.extendedDescription ?? null;

  return {
    patente,
    categoria: (manual?.category ?? details?.category ?? "vehiculo_liviano").toLowerCase(),
    marca: marca || "Sin Marca",
    modelo: modelo || "Sin Modelo",
    ano: manual?.year ?? details?.year ?? null,
    version: details?.version ?? manual?.subtitle ?? null,
    kilometraje: details?.kilometraje ?? null,
    descripcion,
    valor_minimo: valorMinimo,
    valor_esperado: valorEsperado,
    imagenes: manual?.images?.length ? manual.images : null,
    origen: manual ? "manual" : "manual",
    estado_retiro: estadoRetiro || ESTADO_RETIRO_DEFAULT,
  };
}

function buildRemateItemPayload(
  config: EditorConfig,
  vehicleKey: string,
  remateId: string,
  patente: string,
): RemateItemSyncRow {
  const manualId = vehicleKey.startsWith("manual-") ? vehicleKey.slice("manual-".length) : "";
  const manual = manualId ? manualById(config).get(manualId) : undefined;
  const details = resolveVehicleDetails(config, vehicleKey);
  const minimo = parseClpAmount(config.vehiclePrices?.[vehicleKey]);

  return {
    remate_id: remateId,
    patente,
    marca: manual?.brand ?? details?.brand ?? null,
    modelo: manual?.model ?? details?.model ?? null,
    ano: manual?.year ?? details?.year ?? null,
    version: details?.version ?? null,
    kilometraje: details?.kilometraje ?? null,
    valor_minimo: minimo,
    valor_esperado: minimo,
    tipo_documento: "factura_exenta",
    extra_fields: {
      source_system: "catalogo",
      source_vehicle_key: vehicleKey,
      synced_at: new Date().toISOString(),
    },
  };
}

function buildSyncTargets(config: EditorConfig) {
  const remateAssignments = config.vehicleUpcomingAuctionIds ?? {};
  const directSaleKeys = new Set(config.sectionVehicleIds?.["ventas-directas"] ?? []);
  const remateKeys = new Set<string>(Object.keys(remateAssignments));

  return {
    remateAssignments,
    remateKeys,
    directSaleKeys,
  };
}

async function findInventarioByPatent(
  supabase: ReturnType<typeof getServerSupabase> extends infer T ? Exclude<T, null> : never,
  patente: string,
): Promise<InventarioLookup | null> {
  const { data } = await supabase
    .from(INVENTARIO_TABLE)
    .select("id, patente, estado_retiro")
    .eq("patente", patente)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return data as InventarioLookup;
}

export async function syncEditorConfigToSharedTables(config: EditorConfig): Promise<SyncResult> {
  const supabase = getServerSupabase();
  if (!supabase) {
    return {
      rematesUpserted: 0,
      remateItemsUpserted: 0,
      inventoryCreated: 0,
      inventoryUpdated: 0,
      skipped: ["Falta SUPABASE_SERVICE_ROLE_KEY o URL de Supabase para sincronizar."],
    };
  }

  const result: SyncResult = {
    rematesUpserted: 0,
    remateItemsUpserted: 0,
    inventoryCreated: 0,
    inventoryUpdated: 0,
    skipped: [],
  };

  const remateRows: RemateSyncRow[] = [];
  for (const auction of config.upcomingAuctions ?? []) {
    if (!isUuid(auction.id)) {
      result.skipped.push(`Remate omitido (ID legacy no UUID): ${auction.name}`);
      continue;
    }
    const fechaHora = parseDateToRemateTimestamp(auction.date, auction.name);
    if (!fechaHora) {
      result.skipped.push(`Remate omitido (fecha inválida): ${auction.name}`);
      continue;
    }
    remateRows.push({
      id: auction.id,
      fecha_hora_remate: fechaHora,
      descripcion: auction.name.trim(),
      estado: "abierto",
    });
  }

  if (remateRows.length > 0) {
    const { error } = await supabase.from(REMATES_TABLE).upsert(remateRows, { onConflict: "id" });
    if (error) throw new Error(`No se pudieron sincronizar remates: ${error.message}`);
    result.rematesUpserted = remateRows.length;
  }

  const { remateAssignments, remateKeys, directSaleKeys } = buildSyncTargets(config);
  const inventoryStateByKey = new Map<string, string>();
  for (const key of remateKeys) inventoryStateByKey.set(key, ESTADO_RETIRO_REMATE);
  for (const key of directSaleKeys) {
    if (!inventoryStateByKey.has(key)) inventoryStateByKey.set(key, ESTADO_RETIRO_VENTA_DIRECTA);
  }

  for (const [vehicleKey, estadoRetiro] of inventoryStateByKey.entries()) {
    const patentResolved = resolveVehiclePatent(config, vehicleKey);
    if (!patentResolved) {
      result.skipped.push(`Unidad omitida sin patente resoluble: ${vehicleKey}`);
      continue;
    }

    const inventarioPayload = buildInventarioPayload(config, vehicleKey, patentResolved.patente, estadoRetiro);
    const existing = await findInventarioByPatent(supabase, patentResolved.patente);

    if (existing?.id) {
      const { error } = await supabase
        .from(INVENTARIO_TABLE)
        .update({
          ...inventarioPayload,
          estado_retiro: estadoRetiro,
        })
        .eq("id", existing.id);
      if (error) {
        result.skipped.push(`No se pudo actualizar inventario ${patentResolved.patente}: ${error.message}`);
        continue;
      }
      result.inventoryUpdated += 1;
    } else {
      const { error } = await supabase.from(INVENTARIO_TABLE).insert({
        ...inventarioPayload,
        estado_retiro: estadoRetiro,
      });
      if (error) {
        result.skipped.push(`No se pudo crear inventario ${patentResolved.patente}: ${error.message}`);
        continue;
      }
      result.inventoryCreated += 1;
    }
  }

  const remateItemRows: RemateItemSyncRow[] = [];
  for (const [vehicleKey, remateId] of Object.entries(remateAssignments)) {
    if (!isUuid(remateId)) {
      result.skipped.push(`Asignación omitida (remate legacy no UUID): ${vehicleKey}`);
      continue;
    }
    const patentResolved = resolveVehiclePatent(config, vehicleKey);
    if (!patentResolved) {
      result.skipped.push(`Asignación omitida sin patente: ${vehicleKey}`);
      continue;
    }
    remateItemRows.push(buildRemateItemPayload(config, vehicleKey, remateId, patentResolved.patente));
  }

  if (remateItemRows.length > 0) {
    const { error } = await supabase
      .from(REMATES_ITEMS_TABLE)
      .upsert(remateItemRows, { onConflict: "remate_id,patente,tipo_documento" });
    if (error) throw new Error(`No se pudieron sincronizar items de remate: ${error.message}`);
    result.remateItemsUpserted = remateItemRows.length;
  }

  return result;
}
