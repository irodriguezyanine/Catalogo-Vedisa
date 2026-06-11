import { createClient } from "@supabase/supabase-js";
import {
  catalogRowToItem,
  fetchAutoredRecordByPatent,
  fetchInventarioRowByPatent,
} from "@/lib/catalog";
import type { CatalogItem } from "@/types/catalog";
import type { EditorVehicleDetails } from "@/types/editor";

export type ImportPatentResult = {
  item: CatalogItem;
  vehicleDetails: EditorVehicleDetails;
  source: "inventario" | "autored";
  created: boolean;
  patente: string;
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

function buildMergedAutored(autored: Record<string, unknown>): Record<string, unknown> {
  return { ...autored, ...flattenObject(autored) };
}

function buildVehicleDetailsFromSources(
  patente: string,
  row: Record<string, unknown>,
  autored?: Record<string, unknown> | null,
): EditorVehicleDetails {
  const merged = autored ? buildMergedAutored(autored) : {};
  const marca =
    pickString(row, ["marca", "brand"]) ?? pickString(merged, ["marca", "brand", "make"]);
  const modelo =
    pickString(row, ["modelo", "model"]) ?? pickString(merged, ["modelo", "model"]);
  const ano = pickString(row, ["ano", "año", "year"]) ?? pickString(merged, ["ano", "año", "year"]);
  const version =
    pickString(row, ["version", "trim"]) ?? pickString(merged, ["version", "trim", "ver"]);
  const title =
    [marca, modelo, ano].filter(Boolean).join(" ").trim() || `Unidad ${patente}`;

  return {
    title,
    patente,
    brand: marca,
    model: modelo,
    year: ano,
    version,
    kilometraje:
      pickString(row, ["kilometraje", "km"]) ??
      pickString(merged, ["kilometraje", "km", "odometro", "odometer"]),
    color: pickString(row, ["color"]) ?? pickString(merged, ["color", "color_exterior"]),
    combustible:
      pickString(row, ["combustible", "tipo_combustible"]) ??
      pickString(merged, ["combustible", "tipo_combustible", "fuel"]),
    transmision:
      pickString(row, ["transmision", "caja", "tipo_caja"]) ??
      pickString(merged, ["transmision", "caja", "transmission"]),
    traccion:
      pickString(row, ["traccion", "tipo_traccion"]) ??
      pickString(merged, ["traccion", "tipo_traccion", "drivetrain"]),
    aro: pickString(row, ["aro", "rin"]) ?? pickString(merged, ["aro", "rin", "wheel_size"]),
    cilindrada:
      pickString(row, ["cilindrada", "cc", "motor_cc"]) ??
      pickString(merged, ["cilindrada", "cc", "engine_cc"]),
    vin:
      pickString(row, ["vin", "numero_chasis", "nro_chasis"]) ??
      pickString(merged, ["vin", "numero_chasis", "nro_chasis", "chasis"]),
    description:
      pickString(row, ["descripcion", "description"]) ??
      pickString(merged, ["descripcion", "description"]),
    category: pickString(row, ["categoria", "tipo_vehiculo"]) ?? "vehiculo_liviano",
  };
}

function buildInventarioInsertPayload(
  patente: string,
  autored: Record<string, unknown>,
): Record<string, unknown> {
  const merged = buildMergedAutored(autored);
  const marca = pickString(merged, ["marca", "brand", "make"]) ?? "Sin Marca";
  const modelo = pickString(merged, ["modelo", "model"]) ?? "Sin Modelo";
  const ano = pickString(merged, ["ano", "año", "year"]);
  const version = pickString(merged, ["version", "trim", "ver"]);
  const kilometraje = pickString(merged, ["kilometraje", "km", "odometro", "odometer"]);
  const descripcion = pickString(merged, ["descripcion", "description"]);

  return {
    patente,
    categoria: (pickString(merged, ["categoria", "tipo_vehiculo"]) ?? "vehiculo_liviano").toLowerCase(),
    marca,
    modelo,
    ano,
    version,
    kilometraje,
    descripcion,
    origen: "autored",
    estado_retiro: ESTADO_RETIRO_DEFAULT,
    autored_campos: autored,
  };
}

export async function importVehicleByPatent(rawPatent: string): Promise<ImportPatentResult> {
  const patente = normalizePatent(rawPatent);
  if (!/^[A-Z0-9]{5,10}$/.test(patente)) {
    throw new Error("Patente inválida. Usa un formato como TJSX73.");
  }

  const existingRow = await fetchInventarioRowByPatent(patente);
  if (existingRow) {
    const autored = await fetchAutoredRecordByPatent(patente);
    const mergedRow = autored
      ? {
          ...existingRow,
          ...buildInventarioInsertPayload(patente, autored),
          patente,
          autored_campos: autored,
        }
      : existingRow;
    const item = catalogRowToItem({ ...mergedRow, patente });
    if (!item) throw new Error(`No se pudo normalizar el inventario para ${patente}.`);
    return {
      item,
      vehicleDetails: buildVehicleDetailsFromSources(patente, mergedRow, autored),
      source: "inventario",
      created: false,
      patente,
    };
  }

  const autored = await fetchAutoredRecordByPatent(patente);
  if (!autored) {
    throw new Error(
      `No se encontró ${patente} en inventario compartido ni en Autored. Verifica la patente o CATALOG_SOURCE_AUTORED_API_URL.`,
    );
  }

  const supabase = getServerSupabase();
  if (!supabase) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY para crear inventario compartido desde Autored.",
    );
  }

  const insertPayload = buildInventarioInsertPayload(patente, autored);
  const { data, error } = await supabase
    .from(INVENTARIO_TABLE)
    .insert(insertPayload)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? `No se pudo crear inventario para ${patente}.`);
  }

  const row = { ...(data as Record<string, unknown>), patente };
  const item = catalogRowToItem(row);
  if (!item) throw new Error(`No se pudo normalizar la unidad importada ${patente}.`);

  return {
    item,
    vehicleDetails: buildVehicleDetailsFromSources(patente, row, autored),
    source: "autored",
    created: true,
    patente,
  };
}
