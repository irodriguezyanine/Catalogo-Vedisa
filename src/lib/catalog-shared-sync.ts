import { createClient } from "@supabase/supabase-js";
import { revertInventarioTrasQuitarDeRemate, revertInventarioTrasQuitarDeVentaDirecta } from "@/lib/catalog-inventory-remate-sync";
import {
  collectDirectSaleVehicleKeys,
  DEFAULT_VENTA_DIRECTA_EVENT_ID,
  DEFAULT_VENTA_DIRECTA_EVENT_NAME,
  ESTADO_RETIRO_VENTA_DIRECTA,
  resolveCommercialEventType,
  resolveSharedRemateEstado,
} from "@/lib/catalog-shared-constants";
import {
  resolveCanonicalRemateIdForSync,
  type SharedRemateLookupRow,
} from "@/lib/catalog-shared-remate-id";
import type { EditorConfig, EditorVehicleDetails, ManualPublication } from "@/types/editor";

type SyncResult = {
  rematesUpserted: number;
  remateItemsUpserted: number;
  remateItemsMigrated: number;
  remateExclusionsCleared: number;
  inventoryCreated: number;
  inventoryUpdated: number;
  skipped: string[];
  remateIdMappings?: Record<string, string>;
};

type SyncOptions = {
  deletedRemateIds?: string[];
};

type RemateSyncRow = {
  id: string;
  fecha_hora_inicio: string;
  fecha_hora_cierre: string;
  fecha_hora_remate: string;
  descripcion: string;
  estado: "abierto" | "cerrado";
  tipo: "remate" | "venta_directa";
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
  precio_minimo_remate: number | null;
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
const ESTADO_RETIRO_DEFAULT = "en_tasacion";

function isMissingRematesTipoColumn(error: unknown): boolean {
  const code = String((error as { code?: unknown })?.code ?? "").toUpperCase();
  const message = String((error as { message?: unknown })?.message ?? "").toLowerCase();
  const details = String((error as { details?: unknown })?.details ?? "").toLowerCase();
  const text = `${message} ${details}`;
  return (
    code === "PGRST204" ||
    (text.includes("schema cache") && text.includes("tipo")) ||
    (text.includes("column") && text.includes("tipo"))
  );
}

function isMissingRematesEventWindowColumns(error: unknown): boolean {
  const message = String((error as { message?: unknown })?.message ?? "").toLowerCase();
  const details = String((error as { details?: unknown })?.details ?? "").toLowerCase();
  const text = `${message} ${details}`;
  return (
    (text.includes("fecha_hora_inicio") && text.includes("column")) ||
    (text.includes("fecha_hora_cierre") && text.includes("column")) ||
    (text.includes("schema cache") && (text.includes("fecha_hora_inicio") || text.includes("fecha_hora_cierre")))
  );
}

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

function parseIsoOrNull(value?: string | null): string | null {
  if (!value?.trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function buildSyncTargets(config: EditorConfig) {
  const remateAssignments = config.vehicleUpcomingAuctionIds ?? {};
  const directSaleKeys = collectDirectSaleVehicleKeys(config);
  const remateKeys = new Set<string>(Object.keys(remateAssignments));

  return {
    remateAssignments,
    remateKeys,
    directSaleKeys,
  };
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
  const split = parsedTitle.split(/\s+/).filter(Boolean);
  const titleLooksLikePlaceholder =
    /^unidad\s+[a-z0-9]{5,10}$/i.test(parsedTitle) ||
    parsedTitle.toLowerCase().startsWith("unidad ");
  const marcaFromTitle =
    !titleLooksLikePlaceholder && split.length > 0 ? split[0] : undefined;
  const modeloFromTitle =
    !titleLooksLikePlaceholder && split.length > 1 ? split.slice(1).join(" ").trim() : undefined;
  const marca = manual?.brand ?? details?.brand ?? marcaFromTitle ?? "Sin Marca";
  const modelo =
    manual?.model ??
    details?.model ??
    modeloFromTitle ??
    details?.version ??
    "Sin Modelo";
  const valorMinimo =
    parseClpAmount(details?.precioMinimoRemate) ??
    parseClpAmount(manual?.precioMinimoRemate) ??
    parseClpAmount(config.vehiclePrices?.[vehicleKey]) ??
    parseClpAmount(details?.originalPrice) ??
    parseClpAmount(manual?.originalPrice);
  const valorEsperado =
    parseClpAmount(details?.promoPrice) ??
    parseClpAmount(manual?.promoPrice) ??
    valorMinimo;
  const precioMinimoRemate =
    parseClpAmount(details?.precioMinimoRemate) ??
    parseClpAmount(manual?.precioMinimoRemate) ??
    parseClpAmount(config.vehiclePrices?.[vehicleKey]) ??
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
    precio_minimo_remate: precioMinimoRemate,
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
  eventType: "remate" | "venta_directa",
  catalogAuctionId?: string,
): RemateItemSyncRow {
  const manualId = vehicleKey.startsWith("manual-") ? vehicleKey.slice("manual-".length) : "";
  const manual = manualId ? manualById(config).get(manualId) : undefined;
  const details = resolveVehicleDetails(config, vehicleKey);
  const minimo =
    parseClpAmount(details?.precioMinimoRemate) ??
    parseClpAmount(manual?.precioMinimoRemate) ??
    parseClpAmount(config.vehiclePrices?.[vehicleKey]);

  return {
    remate_id: remateId,
    patente,
    marca: manual?.brand ?? details?.brand ?? null,
    modelo: manual?.model ?? details?.model ?? null,
    ano: manual?.year ?? details?.year ?? null,
    version: details?.version ?? null,
    kilometraje: details?.kilometraje ?? null,
    valor_minimo: minimo,
    precio_minimo_remate: minimo,
    valor_esperado: minimo,
    tipo_documento: "factura_exenta",
    extra_fields: {
      source_system: "catalogo",
      event_type: eventType,
      event_origin: eventType === "venta_directa" ? "catalogo_venta_directa" : "catalogo_remate",
      source_vehicle_key: vehicleKey,
      synced_at: new Date().toISOString(),
      ...(catalogAuctionId && catalogAuctionId !== remateId
        ? { catalog_auction_id: catalogAuctionId, tasaciones_remate_id: remateId }
        : {}),
    },
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

async function fetchRematesForSyncLookup(
  supabase: NonNullable<ReturnType<typeof getServerSupabase>>,
): Promise<SharedRemateLookupRow[]> {
  const { data, error } = await supabase
    .from(REMATES_TABLE)
    .select("id, numero_remate, numero_correlativo, descripcion")
    .limit(2000);
  if (error) {
    console.warn("No se pudieron leer remates para mapeo de sync:", error.message);
    return [];
  }
  return (data ?? []) as SharedRemateLookupRow[];
}

async function migrateRemateItemsToCanonicalRemates(
  supabase: NonNullable<ReturnType<typeof getServerSupabase>>,
  remateIdAlias: Map<string, string>,
): Promise<number> {
  let migrated = 0;

  for (const [catalogId, canonicalId] of remateIdAlias) {
    if (catalogId === canonicalId) continue;

    const { data: items, error } = await supabase
      .from(REMATES_ITEMS_TABLE)
      .select(
        "id, patente, marca, modelo, ano, version, kilometraje, valor_minimo, precio_minimo_remate, valor_esperado, tipo_documento, extra_fields",
      )
      .eq("remate_id", catalogId);
    if (error || !items?.length) continue;

    for (const row of items as Array<RemateItemSyncRow & { id: string }>) {
      const extraFields = {
        ...((row.extra_fields ?? {}) as Record<string, unknown>),
        catalog_auction_id: catalogId,
        tasaciones_remate_id: canonicalId,
        migrated_from_remate_id: catalogId,
        migrated_at: new Date().toISOString(),
      };
      const payload: RemateItemSyncRow = {
        remate_id: canonicalId,
        patente: row.patente,
        marca: row.marca,
        modelo: row.modelo,
        ano: row.ano,
        version: row.version,
        kilometraje: row.kilometraje,
        valor_minimo: row.valor_minimo,
        precio_minimo_remate: row.precio_minimo_remate,
        valor_esperado: row.valor_esperado,
        tipo_documento: row.tipo_documento,
        extra_fields: extraFields,
      };
      const { error: upsertError } = await supabase
        .from(REMATES_ITEMS_TABLE)
        .upsert(payload, { onConflict: "remate_id,patente,tipo_documento" });
      if (upsertError) continue;

      const { error: deleteError } = await supabase.from(REMATES_ITEMS_TABLE).delete().eq("id", row.id);
      if (!deleteError) migrated += 1;
    }
  }

  return migrated;
}

/** Supabase borra inserts en remates_items si la patente está en remates_items_exclusiones. */
async function clearRemateItemExclusionsForAssignments(
  supabase: NonNullable<ReturnType<typeof getServerSupabase>>,
  remateItemRows: RemateItemSyncRow[],
): Promise<number> {
  let cleared = 0;

  for (const row of remateItemRows) {
    const patenteNorm = normalizePatent(row.patente);
    if (!patenteNorm) continue;

    const { data, error } = await supabase
      .from("remates_items_exclusiones")
      .delete()
      .eq("remate_id", row.remate_id)
      .eq("patente_norm", patenteNorm)
      .select("patente_norm");

    if (error) {
      console.warn(`No se pudo limpiar exclusión ${patenteNorm}@${row.remate_id}:`, error.message);
      continue;
    }
    cleared += (data ?? []).length;
  }

  return cleared;
}

export async function syncEditorConfigToSharedTables(config: EditorConfig): Promise<SyncResult> {
  return syncEditorConfigToSharedTablesWithOptions(config, {});
}

export async function syncEditorConfigToSharedTablesWithOptions(
  config: EditorConfig,
  options: SyncOptions,
): Promise<SyncResult> {
  const supabase = getServerSupabase();
  if (!supabase) {
    return {
      rematesUpserted: 0,
      remateItemsUpserted: 0,
      remateItemsMigrated: 0,
      remateExclusionsCleared: 0,
      inventoryCreated: 0,
      inventoryUpdated: 0,
      skipped: ["Falta SUPABASE_SERVICE_ROLE_KEY o URL de Supabase para sincronizar."],
    };
  }

  const result: SyncResult = {
    rematesUpserted: 0,
    remateItemsUpserted: 0,
    remateItemsMigrated: 0,
    remateExclusionsCleared: 0,
    inventoryCreated: 0,
    inventoryUpdated: 0,
    skipped: [],
  };

  const deletedIds = [...new Set((options.deletedRemateIds ?? []).filter((id) => isUuid(id)))];
  if (deletedIds.length > 0) {
    const { error: delItemsError } = await supabase
      .from(REMATES_ITEMS_TABLE)
      .delete()
      .in("remate_id", deletedIds);
    if (delItemsError) {
      result.skipped.push(`No se pudieron eliminar items de remates borrados: ${delItemsError.message}`);
    }

    const { error: delRematesError } = await supabase
      .from(REMATES_TABLE)
      .delete()
      .in("id", deletedIds);
    if (delRematesError) {
      result.skipped.push(`No se pudieron eliminar remates borrados: ${delRematesError.message}`);
    }
  }

  const { remateAssignments, remateKeys, directSaleKeys } = buildSyncTargets(config);
  const sharedRemates = await fetchRematesForSyncLookup(supabase);
  const remateIdAlias = new Map<string, string>();
  for (const auction of config.upcomingAuctions ?? []) {
    if (!isUuid(auction.id)) continue;
    const canonical = resolveCanonicalRemateIdForSync(auction.id, auction.name, sharedRemates);
    remateIdAlias.set(auction.id, canonical);
  }
  if (remateIdAlias.size > 0) {
    result.remateIdMappings = Object.fromEntries(remateIdAlias);
    result.remateItemsMigrated = await migrateRemateItemsToCanonicalRemates(supabase, remateIdAlias);
  }

  const eventByVehicle = new Map<string, string>();
  const catalogAuctionByVehicle = new Map<string, string>();
  for (const [vehicleKey, remateId] of Object.entries(remateAssignments)) {
    if (!isUuid(remateId)) continue;
    const canonical = remateIdAlias.get(remateId) ?? remateId;
    eventByVehicle.set(vehicleKey, canonical);
    if (canonical !== remateId) catalogAuctionByVehicle.set(vehicleKey, remateId);
  }
  for (const vehicleKey of directSaleKeys) {
    if (!eventByVehicle.has(vehicleKey)) {
      eventByVehicle.set(vehicleKey, DEFAULT_VENTA_DIRECTA_EVENT_ID);
    }
  }
  const rematesVentaDirecta = new Set<string>();
  for (const auction of config.upcomingAuctions ?? []) {
    if (resolveCommercialEventType(auction) === "venta_directa" && isUuid(auction.id)) {
      rematesVentaDirecta.add(remateIdAlias.get(auction.id) ?? auction.id);
    }
  }
  for (const [vehicleKey, remateId] of eventByVehicle.entries()) {
    if (directSaleKeys.has(vehicleKey)) rematesVentaDirecta.add(remateId);
  }

  const remateRows: RemateSyncRow[] = [];
  const hiddenCategoryIds = config.hiddenCategoryIds ?? [];
  const upsertedRemateIds = new Set<string>();
  for (const auction of config.upcomingAuctions ?? []) {
    if (!isUuid(auction.id)) {
      result.skipped.push(`Remate omitido (ID legacy no UUID): ${auction.name}`);
      continue;
    }
    const canonicalId = remateIdAlias.get(auction.id) ?? auction.id;
    if (upsertedRemateIds.has(canonicalId)) continue;
    upsertedRemateIds.add(canonicalId);
    const fechaHoraCierre =
      parseIsoOrNull(auction.endAt) ?? parseDateToRemateTimestamp(auction.date, auction.name);
    if (!fechaHoraCierre) {
      result.skipped.push(`Remate omitido (fecha inválida): ${auction.name}`);
      continue;
    }
    const fechaHoraInicio =
      parseIsoOrNull(auction.startAt) ??
      new Date(new Date(fechaHoraCierre).getTime() - 24 * 60 * 60 * 1000).toISOString();
    const nombre = auction.name.trim();
    const tipoEvento = resolveCommercialEventType(auction);
    const esVentaDirecta =
      rematesVentaDirecta.has(canonicalId) ||
      rematesVentaDirecta.has(auction.id) ||
      tipoEvento === "venta_directa";
    remateRows.push({
      id: canonicalId,
      fecha_hora_inicio: fechaHoraInicio,
      fecha_hora_cierre: fechaHoraCierre,
      fecha_hora_remate: fechaHoraCierre,
      descripcion: nombre,
      estado: resolveSharedRemateEstado(auction.id, hiddenCategoryIds),
      tipo: esVentaDirecta ? "venta_directa" : "remate",
    });
  }

  if (directSaleKeys.size > 0 && !remateRows.some((r) => r.id === DEFAULT_VENTA_DIRECTA_EVENT_ID)) {
    const now = new Date();
    const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    remateRows.push({
      id: DEFAULT_VENTA_DIRECTA_EVENT_ID,
      fecha_hora_inicio: now.toISOString(),
      fecha_hora_cierre: end.toISOString(),
      fecha_hora_remate: end.toISOString(),
      descripcion: DEFAULT_VENTA_DIRECTA_EVENT_NAME,
      estado: resolveSharedRemateEstado(DEFAULT_VENTA_DIRECTA_EVENT_ID, hiddenCategoryIds),
      tipo: "venta_directa",
    });
  }

  if (remateRows.length > 0) {
    let { error } = await supabase.from(REMATES_TABLE).upsert(remateRows, { onConflict: "id" });
    if (error && isMissingRematesTipoColumn(error)) {
      const remateRowsSinTipo = remateRows.map(({ tipo: _tipo, ...row }) => row);
      ({ error } = await supabase.from(REMATES_TABLE).upsert(remateRowsSinTipo, { onConflict: "id" }));
    }
    if (error && isMissingRematesEventWindowColumns(error)) {
      const remateRowsCompat = remateRows.map(
        ({ fecha_hora_inicio: _ini, fecha_hora_cierre: _cier, tipo: _tipo, ...row }) => row,
      );
      ({ error } = await supabase.from(REMATES_TABLE).upsert(remateRowsCompat, { onConflict: "id" }));
    }
    if (error) throw new Error(`No se pudieron sincronizar remates: ${error.message}`);
    result.rematesUpserted = remateRows.length;
  }

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
  const desiredRemateItemKeys = new Set<string>();
  for (const [vehicleKey, remateId] of eventByVehicle.entries()) {
    const patentResolved = resolveVehiclePatent(config, vehicleKey);
    if (!patentResolved) {
      result.skipped.push(`Asignación omitida sin patente: ${vehicleKey}`);
      continue;
    }
    const patenteUpper = patentResolved.patente.trim().toUpperCase();
    desiredRemateItemKeys.add(`${remateId}|${patenteUpper}|factura_exenta`);
    const eventType: "remate" | "venta_directa" = rematesVentaDirecta.has(remateId)
      ? "venta_directa"
      : "remate";
    remateItemRows.push(
      buildRemateItemPayload(
        config,
        vehicleKey,
        remateId,
        patentResolved.patente,
        eventType,
        catalogAuctionByVehicle.get(vehicleKey),
      ),
    );
  }

  if (remateItemRows.length > 0) {
    result.remateExclusionsCleared = await clearRemateItemExclusionsForAssignments(
      supabase,
      remateItemRows,
    );

    const { error } = await supabase
      .from(REMATES_ITEMS_TABLE)
      .upsert(remateItemRows, { onConflict: "remate_id,patente,tipo_documento" });
    if (error) throw new Error(`No se pudieron sincronizar items de remate: ${error.message}`);

    // Limpia vínculos obsoletos de origen catálogo que ya no están en la configuración actual.
    const remateIds = [...new Set(remateItemRows.map((row) => row.remate_id))];
    const { data: existingRows, error: existingError } = await supabase
      .from(REMATES_ITEMS_TABLE)
      .select("id, remate_id, patente, tipo_documento, extra_fields")
      .in("remate_id", remateIds);
    if (!existingError && existingRows) {
      const toDeleteIds: string[] = [];
      for (const row of existingRows as Array<{
        id: string;
        remate_id: string;
        patente: string | null;
        tipo_documento: string;
        extra_fields?: Record<string, unknown> | null;
      }>) {
        const key = `${row.remate_id}|${String(row.patente ?? "").trim().toUpperCase()}|${row.tipo_documento}`;
        if (!desiredRemateItemKeys.has(key)) {
          toDeleteIds.push(row.id);
        }
      }
      if (toDeleteIds.length > 0) {
        const patentesRevertir = new Set<string>();
        for (const row of existingRows as Array<{ id: string; patente: string | null }>) {
          if (!toDeleteIds.includes(row.id)) continue;
          const patente = normalizePatent(String(row.patente ?? ""));
          if (patente) patentesRevertir.add(patente);
        }
        const { error: delError } = await supabase
          .from(REMATES_ITEMS_TABLE)
          .delete()
          .in("id", toDeleteIds);
        if (delError) {
          result.skipped.push(`No se pudieron limpiar items obsoletos: ${delError.message}`);
        } else {
          for (const patente of patentesRevertir) {
            await revertInventarioTrasQuitarDeRemate(patente);
            await revertInventarioTrasQuitarDeVentaDirecta(patente);
          }
        }
      }
    }
    result.remateItemsUpserted = remateItemRows.length;
  }

  return result;
}

export type RemovedVehicleAssignment = {
  remateId: string;
  vehicleKey: string;
};

/** Asignaciones que el editor quitó respecto a la config anterior. */
export function findRemovedVehicleAssignments(
  previous: EditorConfig,
  next: EditorConfig,
): RemovedVehicleAssignment[] {
  const prev = previous.vehicleUpcomingAuctionIds ?? {};
  const nxt = next.vehicleUpcomingAuctionIds ?? {};
  const removals: RemovedVehicleAssignment[] = [];

  for (const [vehicleKey, prevRemateId] of Object.entries(prev)) {
    if (!prevRemateId) continue;
    if (nxt[vehicleKey] === prevRemateId) continue;
    removals.push({ remateId: prevRemateId, vehicleKey });
  }

  return removals;
}

/** Borra en remates_items las unidades que el catálogo dejó de asignar a un evento. */
export async function deleteRemateItemsForRemovedAssignments(
  removals: RemovedVehicleAssignment[],
  config: EditorConfig,
): Promise<{ deleted: number; skipped: string[] }> {
  const supabase = getServerSupabase();
  const skipped: string[] = [];
  if (!supabase || removals.length === 0) {
    return { deleted: 0, skipped };
  }

  const sharedRemates = await fetchRematesForSyncLookup(supabase);
  const remateIdsToTry = (remateId: string): string[] => {
    const auction = config.upcomingAuctions?.find((entry) => entry.id === remateId);
    const canonical = auction
      ? resolveCanonicalRemateIdForSync(remateId, auction.name, sharedRemates)
      : remateId;
    return [...new Set([remateId, canonical].filter(Boolean))];
  };

  let deleted = 0;
  for (const { remateId, vehicleKey } of removals) {
    const patentResolved = resolveVehiclePatent(config, vehicleKey);
    const patente = patentResolved?.patente;
    if (!patente) {
      skipped.push(`Sin patente para quitar del remate: ${vehicleKey}`);
      continue;
    }
    const patenteNorm = normalizePatent(patente);

    let deleteTargetRemateId = remateId;
    let idsToDelete: string[] = [];
    for (const candidateRemateId of remateIdsToTry(remateId)) {
      const { data: existingRows, error: readError } = await supabase
        .from(REMATES_ITEMS_TABLE)
        .select("id, patente")
        .eq("remate_id", candidateRemateId);
      if (readError) {
        skipped.push(`No se pudieron leer ítems de ${candidateRemateId}: ${readError.message}`);
        continue;
      }

      idsToDelete = (existingRows ?? [])
        .filter((row) => normalizePatent(String(row.patente ?? "")) === patenteNorm)
        .map((row) => String(row.id));
      if (idsToDelete.length) {
        deleteTargetRemateId = candidateRemateId;
        break;
      }
    }

    if (!idsToDelete.length) continue;

    const { error: delError } = await supabase.from(REMATES_ITEMS_TABLE).delete().in("id", idsToDelete);
    if (delError) {
      skipped.push(`No se pudo eliminar ${patenteNorm} de ${deleteTargetRemateId}: ${delError.message}`);
      continue;
    }
    deleted += idsToDelete.length;
    await supabase.from("remates_items_exclusiones").upsert(
      { remate_id: deleteTargetRemateId, patente_norm: patenteNorm },
      { onConflict: "remate_id,patente_norm" },
    );
    await revertInventarioTrasQuitarDeRemate(patente);
    await revertInventarioTrasQuitarDeVentaDirecta(patente);
  }

  return { deleted, skipped };
}
