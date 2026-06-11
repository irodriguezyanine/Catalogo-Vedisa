import { createClient } from "@supabase/supabase-js";
import {
  catalogRowToItem,
  fetchAutoredRecordByPatent,
  fetchGlo3dRecordByPatent,
  fetchInventarioRowByPatent,
  type Glo3dInventoryEntry,
} from "@/lib/catalog";
import type { CatalogItem } from "@/types/catalog";
import type { EditorVehicleDetails } from "@/types/editor";

export type ImportPatentSource = "inventario" | "glo3d" | "glo3d+autored" | "autored";

export type ImportPatentResult = {
  item: CatalogItem;
  vehicleDetails: EditorVehicleDetails;
  source: ImportPatentSource;
  created: boolean;
  patente: string;
  hasGlo3dViewer: boolean;
};

const INVENTARIO_TABLE = process.env.CATALOG_SUPABASE_TABLE ?? "inventario";
const ESTADO_RETIRO_DEFAULT = "en_tasacion";

function normalizePatent(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "").replace(/-/g, "");
}

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function pickString(row: Record<string, unknown>, aliases: string[]): string | undefined {
  for (const alias of aliases) {
    const value = row[alias];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  const lower = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) lower.set(key.toLowerCase(), value);
  for (const alias of aliases) {
    const value = lower.get(alias.toLowerCase());
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

function flattenObject(obj: unknown, prefix = ""): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (obj == null || typeof obj !== "object" || Array.isArray(obj)) return out;
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const flatKey = prefix ? `${prefix}.${key}` : key;
    if (value != null && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(out, flattenObject(value, flatKey));
    } else if (value != null && value !== "") {
      out[flatKey] = value;
    }
  }
  return out;
}

function buildMergedRecord(record: Record<string, unknown>): Record<string, unknown> {
  return { ...record, ...flattenObject(record) };
}

function mergePreferPrimary(
  primary: Record<string, unknown>,
  fallback: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...primary };
  for (const [key, value] of Object.entries(fallback)) {
    const current = merged[key];
    const currentEmpty =
      current === null ||
      current === undefined ||
      (typeof current === "string" && !current.trim());
    if (currentEmpty && value !== null && value !== undefined && value !== "") {
      merged[key] = value;
    }
  }
  return merged;
}

function extractGlo3dImages(glo3d: Glo3dInventoryEntry): string[] {
  const candidates = [
    pickString(glo3d.raw, ["thumb", "thumbnail_url", "image", "image_url", "foto", "thumbnail"]),
    pickString(glo3d.technicalFields, ["thumb", "thumbnail_url", "image", "image_url", "foto"]),
  ].filter(Boolean) as string[];
  return [...new Set(candidates.filter((url) => url.startsWith("http")))];
}

function buildVehicleDetailsFromSources(
  patente: string,
  row: Record<string, unknown>,
  glo3d?: Glo3dInventoryEntry | null,
  autored?: Record<string, unknown> | null,
): EditorVehicleDetails {
  const glo3dFields = glo3d?.technicalFields ?? {};
  const autoredMerged = autored ? buildMergedRecord(autored) : {};
  const marca =
    pickString(row, ["marca", "brand"]) ??
    pickString(glo3dFields, ["marca", "brand", "make"]) ??
    pickString(autoredMerged, ["marca", "brand", "make"]);
  const modelo =
    pickString(row, ["modelo", "model"]) ??
    pickString(glo3dFields, ["modelo", "model", "model2"]) ??
    pickString(autoredMerged, ["modelo", "model"]);
  const ano =
    pickString(row, ["ano", "año", "year"]) ??
    pickString(glo3dFields, ["ano", "anio", "year"]) ??
    pickString(autoredMerged, ["ano", "año", "year"]);
  const version =
    pickString(row, ["version", "trim"]) ??
    pickString(glo3dFields, ["version", "trim", "ver"]) ??
    pickString(autoredMerged, ["version", "trim", "ver"]);
  const title =
    [marca, modelo, ano].filter(Boolean).join(" ").trim() || `Unidad ${patente}`;

  return {
    title,
    patente,
    brand: marca,
    model: modelo,
    year: ano,
    version,
    view3dUrl:
      glo3d?.view3dUrl ??
      pickString(row, ["glo3d_url", "url_3d", "visor_3d_url"]) ??
      undefined,
    kilometraje:
      pickString(row, ["kilometraje", "km"]) ??
      pickString(glo3dFields, ["kilometraje", "km"]) ??
      pickString(autoredMerged, ["kilometraje", "km", "odometro", "odometer"]),
    color:
      pickString(row, ["color"]) ??
      pickString(glo3dFields, ["color", "color_exterior"]) ??
      pickString(autoredMerged, ["color", "color_exterior"]),
    combustible:
      pickString(row, ["combustible", "tipo_combustible"]) ??
      pickString(glo3dFields, ["combustible", "tipo_combustible"]) ??
      pickString(autoredMerged, ["combustible", "tipo_combustible", "fuel"]),
    transmision:
      pickString(row, ["transmision", "caja", "tipo_caja"]) ??
      pickString(glo3dFields, ["transmision", "caja", "transmission"]) ??
      pickString(autoredMerged, ["transmision", "caja", "transmission"]),
    traccion:
      pickString(row, ["traccion", "tipo_traccion"]) ??
      pickString(glo3dFields, ["traccion", "tipo_traccion", "drive_type"]) ??
      pickString(autoredMerged, ["traccion", "tipo_traccion", "drivetrain"]),
    aro:
      pickString(row, ["aro", "rin"]) ??
      pickString(glo3dFields, ["aro", "rin"]) ??
      pickString(autoredMerged, ["aro", "rin", "wheel_size"]),
    cilindrada:
      pickString(row, ["cilindrada", "cc", "motor_cc"]) ??
      pickString(glo3dFields, ["cilindrada", "cc", "engine_cc"]) ??
      pickString(autoredMerged, ["cilindrada", "cc", "engine_cc"]),
    vin:
      pickString(row, ["vin", "numero_chasis", "nro_chasis", "n_de_vin"]) ??
      pickString(glo3dFields, ["n_de_vin", "vin", "numero_chasis"]) ??
      pickString(autoredMerged, ["vin", "numero_chasis", "nro_chasis", "chasis"]),
    description:
      pickString(row, ["descripcion", "description"]) ??
      pickString(glo3dFields, ["descripcion", "description"]) ??
      pickString(autoredMerged, ["descripcion", "description"]),
    tipoVehiculo:
      pickString(row, ["tipo_vehiculo", "tipo_de_vehiculo"]) ??
      pickString(glo3dFields, ["tipo_vehiculo", "tipo_de_vehiculo", "vehicle_type"]),
    ubicacionFisica: pickString(glo3dFields, ["ubicacion_fisica", "ubi", "ubicacion"]),
    transportista: pickString(glo3dFields, ["transportista", "tra"]),
    taller: pickString(glo3dFields, ["taller", "tal"]),
    category:
      pickString(row, ["categoria", "tipo_vehiculo"]) ??
      pickString(glo3dFields, ["tipo_de_vehiculo", "tipo_vehiculo"]) ??
      "vehiculo_liviano",
  };
}

function buildInventarioPayloadFromSources(
  patente: string,
  glo3d?: Glo3dInventoryEntry | null,
  autored?: Record<string, unknown> | null,
): Record<string, unknown> {
  const glo3dFields = glo3d?.technicalFields ?? {};
  const autoredMerged = autored ? buildMergedRecord(autored) : {};
  const merged = mergePreferPrimary(glo3dFields, autoredMerged);
  const marca = pickString(merged, ["marca", "brand", "make"]) ?? "Sin Marca";
  const modelo = pickString(merged, ["modelo", "model", "model2"]) ?? "Sin Modelo";
  const ano = pickString(merged, ["ano", "anio", "year"]);
  const version = pickString(merged, ["version", "trim", "ver"]);
  const kilometraje = pickString(merged, ["kilometraje", "km", "odometro", "odometer"]);
  const descripcion = pickString(merged, ["descripcion", "description"]);
  const imagenes = glo3d ? extractGlo3dImages(glo3d) : [];

  return {
    patente,
    categoria: (pickString(merged, ["categoria", "tipo_vehiculo", "tipo_de_vehiculo"]) ?? "vehiculo_liviano").toLowerCase(),
    marca,
    modelo,
    ano,
    version,
    kilometraje,
    descripcion,
    imagenes: imagenes.length > 0 ? imagenes : null,
    glo3d_url: glo3d?.view3dUrl ?? null,
    url_3d: glo3d?.view3dUrl ?? null,
    visor_3d_url: glo3d?.view3dUrl ?? null,
    origen: glo3d ? (autored ? "glo3d+autored" : "glo3d") : "autored",
    estado_retiro: ESTADO_RETIRO_DEFAULT,
    glo3d_campos: glo3d?.raw ?? null,
    autored_campos: autored ?? null,
  };
}

function buildCatalogRow(
  patente: string,
  base: Record<string, unknown>,
  glo3d?: Glo3dInventoryEntry | null,
): Record<string, unknown> {
  const imagenes = extractGlo3dImages(glo3d ?? { raw: base, technicalFields: {} });
  return {
    ...base,
    patente,
    glo3d: glo3d?.raw ?? base.glo3d ?? null,
    glo3d_url: glo3d?.view3dUrl ?? base.glo3d_url ?? base.url_3d ?? null,
    url_3d: glo3d?.view3dUrl ?? base.url_3d ?? base.glo3d_url ?? null,
    imagenes:
      (Array.isArray(base.imagenes) && base.imagenes.length > 0 ? base.imagenes : null) ??
      (imagenes.length > 0 ? imagenes : null),
  };
}

function resolveImportSource(
  glo3d: Glo3dInventoryEntry | null,
  autored: Record<string, unknown> | null,
  fromExistingInventory: boolean,
): ImportPatentSource {
  if (fromExistingInventory) return "inventario";
  if (glo3d && autored) return "glo3d+autored";
  if (glo3d) return "glo3d";
  return "autored";
}

export async function importVehicleByPatent(rawPatent: string): Promise<ImportPatentResult> {
  const patente = normalizePatent(rawPatent);
  if (!/^[A-Z0-9]{5,10}$/.test(patente)) {
    throw new Error("Patente inválida. Usa un formato como TJSX73.");
  }

  const glo3d = await fetchGlo3dRecordByPatent(patente);
  const autored = await fetchAutoredRecordByPatent(patente);
  const existingRow = await fetchInventarioRowByPatent(patente);

  if (existingRow) {
    const payload = buildInventarioPayloadFromSources(patente, glo3d, autored);
    const mergedRow = buildCatalogRow(patente, mergePreferPrimary(existingRow, payload), glo3d);
    const item = catalogRowToItem(mergedRow);
    if (!item) throw new Error(`No se pudo normalizar el inventario para ${patente}.`);

    if (glo3d || autored) {
      const supabase = getServerSupabase();
      if (supabase) {
        await supabase
          .from(INVENTARIO_TABLE)
          .update(payload)
          .eq("patente", patente);
      }
    }

    return {
      item,
      vehicleDetails: buildVehicleDetailsFromSources(patente, mergedRow, glo3d, autored),
      source: resolveImportSource(glo3d, autored, true),
      created: false,
      patente,
      hasGlo3dViewer: Boolean(glo3d?.view3dUrl ?? mergedRow.glo3d_url ?? mergedRow.url_3d),
    };
  }

  if (!glo3d) {
    const hasGlo3dCredentials = Boolean(
      process.env.GLO3D_API_USERNAME ?? process.env.VITE_GLO3D_API_USERNAME,
    );
    if (!hasGlo3dCredentials) {
      throw new Error(
        `No se pudo consultar Glo3D para ${patente}. Configura GLO3D_API_USERNAME y GLO3D_API_PASSWORD en Vercel.`,
      );
    }
    throw new Error(
      `No se encontró ${patente} en Glo3D. Verifica que el visor esté publicado y pulsa "Actualizar inventario y sync".`,
    );
  }

  const supabase = getServerSupabase();
  if (!supabase) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY para crear inventario compartido desde Glo3D.",
    );
  }

  const insertPayload = buildInventarioPayloadFromSources(patente, glo3d, autored);
  const { data, error } = await supabase
    .from(INVENTARIO_TABLE)
    .insert(insertPayload)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? `No se pudo crear inventario para ${patente}.`);
  }

  const row = buildCatalogRow(patente, { ...(data as Record<string, unknown>) }, glo3d);
  const item = catalogRowToItem(row);
  if (!item) throw new Error(`No se pudo normalizar la unidad importada ${patente}.`);

  return {
    item,
    vehicleDetails: buildVehicleDetailsFromSources(patente, row, glo3d, autored),
    source: resolveImportSource(glo3d, autored, false),
    created: true,
    patente,
    hasGlo3dViewer: Boolean(glo3d.view3dUrl),
  };
}
