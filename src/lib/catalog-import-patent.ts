import { createClient } from "@supabase/supabase-js";
import {
  buildGlo3dEntryFromInventarioRow,
  catalogRowToItem,
  fetchAutoredRecordByPatent,
  fetchGlo3dRecordByPatent,
  fetchInventarioRowByPatent,
  fetchTasacionesRecordByPatent,
  Glo3dRateLimitError,
  resolveCanonicalPatentFromGlo3dEntry,
  type Glo3dInventoryEntry,
} from "@/lib/catalog";
import { sleepMs } from "@/lib/glo3d-api";
import type { CatalogItem } from "@/types/catalog";
import type { EditorVehicleDetails } from "@/types/editor";

export type ImportPatentSource = "inventario" | "glo3d" | "glo3d+autored" | "autored";

export type ImportPatentOptions = {
  estadoRetiro?: string;
  forceRefresh?: boolean;
};

export type ImportPatentResult = {
  item: CatalogItem;
  vehicleDetails: EditorVehicleDetails;
  source: ImportPatentSource;
  created: boolean;
  patente: string;
  requestedPatente?: string;
  correctedPatente?: boolean;
  hasGlo3dViewer: boolean;
  skippedGlo3dFetch?: boolean;
  skippedAutoredFetch?: boolean;
};

export type ImportPatentsBatchResult = {
  results: ImportPatentResult[];
  errors: Array<{ patente: string; error: string }>;
  rateLimited: boolean;
};

const INVENTARIO_TABLE = process.env.CATALOG_SUPABASE_TABLE ?? "inventario";
const ESTADO_RETIRO_DEFAULT = "en_tasacion";
const ESTADO_RETIRO_VENTA_DIRECTA = "en_bodega_a_venta_directa";
const ESTADO_RETIRO_REMATE = "en_bodega_a_remate";

const IMPORT_FORCE_REFRESH_KEYS = new Set([
  "glo3d_url",
  "url_3d",
  "visor_3d_url",
  "glo3d_campos",
  "autored_campos",
  "imagenes",
  "origen",
  "estado_retiro",
]);

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

function isPlaceholderVehicleLabel(value: unknown): boolean {
  if (typeof value !== "string" || !value.trim()) return true;
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return (
    normalized === "sin marca" ||
    normalized === "sin modelo" ||
    normalized === "no informado" ||
    normalized === "sin informacion" ||
    normalized === "sin informacion disponible"
  );
}

function isMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return Boolean(value.trim()) && !isPlaceholderVehicleLabel(value);
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function pickString(row: Record<string, unknown>, aliases: string[]): string | undefined {
  for (const alias of aliases) {
    const value = row[alias];
    if (typeof value === "string" && value.trim() && !isPlaceholderVehicleLabel(value)) {
      return value.trim();
    }
    if (typeof value === "number") return String(value);
  }
  const lower = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) lower.set(key.toLowerCase(), value);
  for (const alias of aliases) {
    const value = lower.get(alias.toLowerCase());
    if (typeof value === "string" && value.trim() && !isPlaceholderVehicleLabel(value)) {
      return value.trim();
    }
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

function mergePreferMeaningful(
  primary: Record<string, unknown>,
  fallback: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...fallback };
  for (const [key, value] of Object.entries(primary)) {
    const current = merged[key];
    const currentEmpty =
      current === null ||
      current === undefined ||
      (typeof current === "string" && (!current.trim() || isPlaceholderVehicleLabel(current))) ||
      (Array.isArray(current) && current.length === 0);

    if (currentEmpty && isMeaningfulValue(value)) {
      merged[key] = value;
      continue;
    }

    if (IMPORT_FORCE_REFRESH_KEYS.has(key) && isMeaningfulValue(value)) {
      merged[key] = value;
    }
  }
  return merged;
}

function normalizeImageList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => {
        if (typeof entry === "string" && entry.trim().startsWith("http")) return [entry.trim()];
        if (typeof entry === "object" && entry !== null) {
          const url = pickString(entry as Record<string, unknown>, ["url", "src", "href", "image", "imagen"]);
          return url ? [url] : [];
        }
        return [];
      })
      .filter(Boolean);
  }
  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return [];
    if (raw.startsWith("http")) return [raw];
    return raw
      .split(/[\n,;|]+/)
      .map((part) => part.trim())
      .filter((part) => part.startsWith("http"));
  }
  return [];
}

function extractGlo3dImages(glo3d: Glo3dInventoryEntry): string[] {
  const urls: string[] = [];
  const push = (value?: string) => {
    if (value?.startsWith("http")) urls.push(value);
  };

  push(pickString(glo3d.raw, ["thumb", "thumbnail_url", "image", "image_url", "foto", "thumbnail"]));
  push(
    pickString(glo3d.technicalFields, ["thumb", "thumbnail_url", "image", "image_url", "foto", "thumbnail"]),
  );

  const gallery = glo3d.raw.gallery;
  if (gallery && typeof gallery === "object" && !Array.isArray(gallery)) {
    for (const section of Object.values(gallery as Record<string, unknown>)) {
      if (!section || typeof section !== "object" || Array.isArray(section)) continue;
      const imageUrl = (section as Record<string, unknown>).image_url;
      for (const url of normalizeImageList(imageUrl)) push(url);
    }
  }

  return [...new Set(urls)];
}

function extractAutoredImages(autored?: Record<string, unknown> | null): string[] {
  if (!autored) return [];
  const merged = buildMergedRecord(autored);
  const candidates = [
    ...normalizeImageList(merged.imagenes),
    ...normalizeImageList(merged.fotos),
    ...normalizeImageList(merged.fotos_urls),
    ...normalizeImageList(merged.images),
    ...normalizeImageList(merged.photos),
    ...normalizeImageList(merged.galeria),
    ...normalizeImageList(merged.galeria_fotos),
    pickString(merged, ["thumbnail", "imagen_principal", "foto_portada", "foto_principal"]),
  ].filter(Boolean) as string[];
  return [...new Set(candidates.filter((url) => url.startsWith("http")))];
}

function normalizeAutoredImportRecord(
  raw?: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!raw) return null;
  const merged = buildMergedRecord(raw);
  const marca = pickString(merged, [
    "marca",
    "brand",
    "make",
    "vehicle_brand",
    "vehiculo_marca",
    "fabricante",
    "nombre_marca",
  ]);
  const modelo = pickString(merged, [
    "modelo",
    "model",
    "model2",
    "vehicle_model",
    "vehiculo_modelo",
    "nombre_modelo",
  ]);
  const ano = pickString(merged, ["ano", "anio", "year", "año", "agno"]);
  const version = pickString(merged, ["version", "trim", "ver", "version_vehiculo"]);
  const vin = pickString(merged, ["vin", "n_de_vin", "numero_vin", "chasis_vin"]);
  const numeroMotor = pickString(merged, [
    "numero_motor",
    "n_de_motor",
    "nro_motor",
    "motor",
    "engine_number",
    "ndm",
  ]);
  const numeroSerie = pickString(merged, ["numero_serie", "n_de_serie", "nro_serie", "serie", "nds"]);
  const numeroChasis = pickString(merged, [
    "numero_chasis",
    "n_de_chasis",
    "nro_chasis",
    "chasis",
    "chassis_number",
  ]);
  const tipoVehiculo = pickString(merged, [
    "tipo_vehiculo",
    "tipo_de_vehiculo",
    "vehicle_type",
    "tipo",
    "clase_vehiculo",
  ]);
  const transmision = pickString(merged, [
    "transmision",
    "transmisión",
    "caja",
    "tipo_caja",
    "transmission",
    "tipo_transmision",
  ]);
  const color = pickString(merged, ["color", "color_exterior", "color_vehiculo", "exterior_color"]);
  const cilindrada = pickString(merged, ["cilindrada", "cc", "motor_cc", "engine_cc", "capacidad_motor"]);

  const normalized: Record<string, unknown> = { ...merged, ...raw };
  if (marca) {
    normalized.marca = marca;
    normalized.brand = marca;
  }
  if (modelo) {
    normalized.modelo = modelo;
    normalized.model = modelo;
  }
  if (ano) {
    normalized.ano = ano;
    normalized.anio = ano;
    normalized.year = ano;
  }
  if (version) normalized.version = version;
  if (vin) normalized.vin = vin;
  if (numeroMotor) {
    normalized.numero_motor = numeroMotor;
    normalized.n_de_motor = numeroMotor;
  }
  if (numeroSerie) {
    normalized.numero_serie = numeroSerie;
    normalized.n_de_serie = numeroSerie;
  }
  if (numeroChasis) {
    normalized.numero_chasis = numeroChasis;
    normalized.n_de_chasis = numeroChasis;
  }
  if (tipoVehiculo) {
    normalized.tipo_vehiculo = tipoVehiculo;
    normalized.tipo_de_vehiculo = tipoVehiculo;
  }
  if (transmision) {
    normalized.transmision = transmision;
    normalized.caja = transmision;
  }
  if (color) normalized.color = color;
  if (cilindrada) {
    normalized.cilindrada = cilindrada;
    normalized.cc = cilindrada;
  }
  return normalized;
}

function resolveEstadoRetiro(options?: ImportPatentOptions): string {
  const value = options?.estadoRetiro?.trim();
  if (!value) return ESTADO_RETIRO_DEFAULT;
  return value;
}

export function resolveEstadoRetiroForAssignmentTarget(
  target:
    | { type: "section"; sectionId: string }
    | { type: "auction"; auctionId: string; eventType?: "remate" | "venta_directa" },
): string {
  if (target.type === "section") {
    if (target.sectionId === "ventas-directas") return ESTADO_RETIRO_VENTA_DIRECTA;
    if (target.sectionId === "proximos-remates") return ESTADO_RETIRO_REMATE;
    return ESTADO_RETIRO_DEFAULT;
  }
  return target.eventType === "venta_directa" ? ESTADO_RETIRO_VENTA_DIRECTA : ESTADO_RETIRO_REMATE;
}

function buildVehicleDetailsFromSources(
  patente: string,
  row: Record<string, unknown>,
  glo3d?: Glo3dInventoryEntry | null,
  autored?: Record<string, unknown> | null,
  images: string[] = [],
): EditorVehicleDetails {
  const glo3dFields = glo3d?.technicalFields ?? {};
  const autoredMerged = autored ? buildMergedRecord(normalizeAutoredImportRecord(autored) ?? autored) : {};
  const rowMerged = buildMergedRecord(row);
  const merged = mergePreferMeaningful(autoredMerged, mergePreferMeaningful(glo3dFields, rowMerged));

  const marca = pickString(merged, ["marca", "brand", "make", "vehicle_brand", "vehiculo_marca"]);
  const modelo = pickString(merged, ["modelo", "model", "model2", "vehicle_model", "vehiculo_modelo"]);
  const ano = pickString(merged, ["ano", "anio", "year", "año"]);
  const version = pickString(merged, ["version", "trim", "ver"]);
  const title =
    [marca, modelo, ano].filter(Boolean).join(" ").trim() || `Unidad ${patente}`;
  const thumbnail = images[0] ?? pickString(row, ["thumbnail", "imagen_principal", "foto_portada"]);

  return {
    title,
    patente,
    brand: marca,
    model: modelo,
    year: ano,
    version,
    thumbnail,
    imagesCsv: images.length > 0 ? images.join(", ") : undefined,
    view3dUrl:
      glo3d?.view3dUrl ??
      pickString(row, ["glo3d_url", "url_3d", "visor_3d_url"]) ??
      undefined,
    patenteVerifier:
      pickString(row, ["patente_verifier", "patente_dv", "ppu_dv", "dv"]) ??
      pickString(glo3dFields, ["patente_verifier", "patente_dv", "ppu_dv", "dv"]),
    vin: pickString(merged, ["vin", "n_de_vin", "numero_vin", "numero_chasis", "nro_chasis"]),
    nChasis: pickString(merged, ["n_de_chasis", "numero_chasis", "nro_chasis", "chasis"]),
    nMotor: pickString(merged, ["n_de_motor", "numero_motor", "nro_motor", "ndm", "motor"]),
    nSerie: pickString(merged, ["n_de_serie", "numero_serie", "nro_serie", "nds", "serie"]),
    nSiniestro:
      pickString(row, ["n_de_siniestro", "numero_siniestro", "n_s", "ns"]) ??
      pickString(glo3dFields, ["n_de_siniestro", "numero_siniestro", "n_s", "ns", "n°s"]),
    kilometraje: pickString(merged, ["kilometraje", "km", "mileage", "odometro", "odometer"]),
    color: pickString(merged, ["color", "color_exterior", "color_vehiculo"]),
    combustible: pickString(merged, ["combustible", "tipo_combustible", "fuel", "fuel_type", "engine_fuel_type"]),
    transmision: pickString(merged, ["transmision", "caja", "tipo_caja", "transmission", "tipo_transmision"]),
    traccion:
      pickString(row, ["traccion", "tipo_traccion"]) ??
      pickString(glo3dFields, ["traccion", "tipo_traccion", "drive_type"]) ??
      pickString(autoredMerged, ["traccion", "tipo_traccion", "drivetrain"]),
    aro:
      pickString(row, ["aro", "rin"]) ??
      pickString(glo3dFields, ["aro", "rin"]) ??
      pickString(autoredMerged, ["aro", "rin", "wheel_size"]),
    cilindrada: pickString(merged, ["cilindrada", "cc", "motor_cc", "engine_cc", "capacidad_motor"]),
    llaves:
      pickString(row, ["llaves", "keys", "lla"]) ??
      pickString(glo3dFields, ["llaves", "keys", "lla"]),
    aireAcondicionado:
      pickString(row, ["aire_acondicionado", "ac"]) ??
      pickString(glo3dFields, ["aire_acondicionado", "ac"]),
    unicoPropietario:
      pickString(row, ["unico_propietario"]) ??
      pickString(glo3dFields, ["unico_propietario"]),
    condicionado:
      pickString(row, ["condicionado", "acondicionado"]) ??
      pickString(glo3dFields, ["condicionado", "acondicionado"]),
    multas:
      pickString(row, ["multas", "mul"]) ?? pickString(glo3dFields, ["multas", "mul"]),
    tag: pickString(row, ["tag"]) ?? pickString(glo3dFields, ["tag"]),
    vencRevisionTecnica:
      pickString(row, ["vencimiento_revision_tecnica", "vrt"]) ??
      pickString(glo3dFields, ["vencimiento_revision_tecnica", "vrt"]),
    vencPermisoCirculacion:
      pickString(row, ["vencimiento_permiso_circulacion", "vpc"]) ??
      pickString(glo3dFields, ["vencimiento_permiso_circulacion", "vpc"]),
    vencSeguroObligatorio:
      pickString(row, ["vencimiento_seguro_obligatorio", "vso"]) ??
      pickString(glo3dFields, ["vencimiento_seguro_obligatorio", "vso"]),
    pruebaMotor:
      pickString(row, ["prueba_motor", "pdm"]) ??
      pickString(glo3dFields, ["prueba_motor", "prueba_motor_arranca", "pdm"]),
    pruebaDesplazamiento:
      pickString(row, ["prueba_desplazamiento", "pdd"]) ??
      pickString(glo3dFields, ["prueba_desplazamiento", "pdd"]),
    estadoAirbags:
      pickString(row, ["estado_airbags", "eda"]) ??
      pickString(glo3dFields, ["estado_airbags", "airbags_estado", "eda"]),
    nombrePropietarioAnterior:
      pickString(row, ["nombre_propietario_anterior", "npa"]) ??
      pickString(glo3dFields, ["nombre_propietario_anterior", "npa"]),
    rutPropietarioAnterior:
      pickString(row, ["rut_propietario_anterior", "rpa"]) ??
      pickString(glo3dFields, ["rut_propietario_anterior", "rpa"]),
    rutVerificador:
      pickString(row, ["rut_verificador"]) ??
      pickString(glo3dFields, ["rut_verificador"]),
    description:
      pickString(row, ["descripcion", "description"]) ??
      pickString(glo3dFields, ["descripcion", "description"]) ??
      pickString(autoredMerged, ["descripcion", "description"]),
    tipo:
      pickString(row, ["tipo", "type"]) ?? pickString(glo3dFields, ["tipo", "type", "tipo_unidad"]),
    tipoVehiculo: pickString(merged, [
      "tipo_vehiculo",
      "tipo_de_vehiculo",
      "vehicle_type",
      "tipo",
      "clase_vehiculo",
    ]),
    ubicacionFisica:
      pickString(row, ["ubicacion_fisica", "ubi", "ubicacion"]) ??
      pickString(glo3dFields, ["ubicacion_fisica", "ubi", "ubicacion"]),
    transportista:
      pickString(row, ["transportista", "tra"]) ??
      pickString(glo3dFields, ["transportista", "tra"]),
    taller:
      pickString(row, ["taller", "tal"]) ?? pickString(glo3dFields, ["taller", "tal"]),
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
  options?: ImportPatentOptions,
): Record<string, unknown> {
  const glo3dFields = glo3d?.technicalFields ?? {};
  const autoredNormalized = normalizeAutoredImportRecord(autored);
  const autoredMerged = autoredNormalized ? buildMergedRecord(autoredNormalized) : {};
  const identity = mergePreferMeaningful(autoredMerged, glo3dFields);
  const technical = mergePreferMeaningful(glo3dFields, autoredMerged);
  const merged = { ...technical, ...identity };

  const marca = pickString(merged, ["marca", "brand", "make", "vehicle_brand", "vehiculo_marca"]) ?? "Sin Marca";
  const modelo = pickString(merged, ["modelo", "model", "model2", "vehicle_model", "vehiculo_modelo"]) ?? "Sin Modelo";
  const ano = pickString(merged, ["ano", "anio", "year", "año"]);
  const version = pickString(merged, ["version", "trim", "ver"]);
  const kilometraje = pickString(merged, ["kilometraje", "km", "odometro", "odometer", "mileage"]);
  const descripcion = pickString(merged, ["descripcion", "description"]);
  const vin = pickString(merged, ["vin", "n_de_vin", "numero_vin"]);
  const numeroMotor = pickString(merged, ["n_de_motor", "numero_motor", "nro_motor", "ndm"]);
  const numeroSerie = pickString(merged, ["n_de_serie", "numero_serie", "nro_serie", "nds"]);
  const numeroChasis = pickString(merged, ["n_de_chasis", "numero_chasis", "nro_chasis", "chasis"]);
  const color = pickString(merged, ["color", "color_exterior"]);
  const transmision = pickString(merged, ["transmision", "caja", "tipo_caja", "transmission"]);
  const cilindrada = pickString(merged, ["cilindrada", "cc", "motor_cc"]);
  const tipoVehiculo = pickString(merged, ["tipo_vehiculo", "tipo_de_vehiculo", "vehicle_type", "tipo"]);
  const glo3dImages = glo3d ? extractGlo3dImages(glo3d) : [];
  const autoredImages = extractAutoredImages(autored);
  const imagenes = [...new Set([...glo3dImages, ...autoredImages])];
  const nombreVehiculo = [marca, modelo, ano].filter((part) => !isPlaceholderVehicleLabel(part)).join(" ").trim();

  return {
    patente,
    categoria: (pickString(merged, ["categoria", "tipo_vehiculo", "tipo_de_vehiculo"]) ?? "vehiculo_liviano").toLowerCase(),
    marca,
    modelo,
    ano,
    version,
    kilometraje,
    descripcion,
    nombre_vehiculo: nombreVehiculo || null,
    titulo: nombreVehiculo || null,
    vin: vin ?? null,
    numero_motor: numeroMotor ?? null,
    n_de_motor: numeroMotor ?? null,
    numero_serie: numeroSerie ?? null,
    n_de_serie: numeroSerie ?? null,
    numero_chasis: numeroChasis ?? null,
    n_de_chasis: numeroChasis ?? null,
    color: color ?? null,
    transmision: transmision ?? null,
    caja: transmision ?? null,
    cilindrada: cilindrada ?? null,
    tipo_vehiculo: tipoVehiculo ?? null,
    imagenes: imagenes.length > 0 ? imagenes : null,
    glo3d_url: glo3d?.view3dUrl ?? null,
    url_3d: glo3d?.view3dUrl ?? null,
    visor_3d_url: glo3d?.view3dUrl ?? null,
    origen: glo3d ? (autored ? "glo3d+autored" : "glo3d") : autored ? "autored" : "glo3d",
    estado_retiro: resolveEstadoRetiro(options),
    glo3d_campos: glo3d?.raw ?? null,
    autored_campos: autored ?? null,
  };
}

function buildCatalogRow(
  patente: string,
  base: Record<string, unknown>,
  glo3d?: Glo3dInventoryEntry | null,
  autored?: Record<string, unknown> | null,
): Record<string, unknown> {
  const glo3dImages = extractGlo3dImages(glo3d ?? { raw: base, technicalFields: {} });
  const autoredImages = extractAutoredImages(autored);
  const imagenes = [...new Set([...glo3dImages, ...autoredImages, ...normalizeImageList(base.imagenes)])];
  return {
    ...base,
    patente,
    glo3d: glo3d?.raw ?? base.glo3d ?? null,
    glo3d_url: glo3d?.view3dUrl ?? base.glo3d_url ?? base.url_3d ?? null,
    url_3d: glo3d?.view3dUrl ?? base.url_3d ?? base.glo3d_url ?? null,
    imagenes: imagenes.length > 0 ? imagenes : null,
    autored: autored ?? base.autored ?? null,
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

function inventarioRowHasCompleteGlo3d(row: Record<string, unknown>): boolean {
  const hasViewer = Boolean(pickString(row, ["glo3d_url", "url_3d", "visor_3d_url"]));
  const hasRaw = row.glo3d_campos != null || row.glo3d != null;
  return hasViewer && hasRaw;
}

function inventarioRowHasCompleteAutored(row: Record<string, unknown>): boolean {
  const marca = pickString(row, ["marca", "brand"]);
  const modelo = pickString(row, ["modelo", "model"]);
  if (!marca || !modelo) {
    const stored = row.autored_campos ?? row.autored;
    if (stored && typeof stored === "object" && !Array.isArray(stored)) {
      const normalized = normalizeAutoredImportRecord(stored as Record<string, unknown>);
      return Boolean(
        pickString(normalized ?? {}, ["marca", "brand"]) &&
          pickString(normalized ?? {}, ["modelo", "model"]),
      );
    }
    return false;
  }
  return true;
}

async function persistInventarioRow(
  patente: string,
  payload: Record<string, unknown>,
  existingRow: Record<string, unknown> | null,
  options?: ImportPatentOptions,
): Promise<{ row: Record<string, unknown>; created: boolean }> {
  const supabase = getServerSupabase();
  const finalPayload = existingRow
    ? options?.forceRefresh
      ? { ...existingRow, ...payload }
      : mergePreferMeaningful(payload, existingRow)
    : payload;

  if (!supabase) {
    return { row: finalPayload, created: false };
  }

  if (existingRow) {
    const { data, error } = await supabase
      .from(INVENTARIO_TABLE)
      .update(finalPayload)
      .eq("patente", patente)
      .select("*")
      .single();
    if (error) {
      console.warn(`[import-patent] Inventario Supabase no actualizado para ${patente}:`, error.message);
      return { row: finalPayload, created: false };
    }
    return { row: (data as Record<string, unknown>) ?? finalPayload, created: false };
  }

  const { data, error } = await supabase
    .from(INVENTARIO_TABLE)
    .insert(finalPayload)
    .select("*")
    .single();
  if (error) {
    console.warn(`[import-patent] Inventario Supabase no creado para ${patente}:`, error.message);
    return { row: finalPayload, created: false };
  }
  return { row: (data as Record<string, unknown>) ?? finalPayload, created: true };
}

export async function importVehicleByPatent(
  rawPatent: string,
  options?: ImportPatentOptions,
): Promise<ImportPatentResult> {
  const requestedPatente = normalizePatent(rawPatent);
  if (!/^[A-Z0-9]{5,10}$/.test(requestedPatente)) {
    throw new Error("Patente inválida. Usa un formato como TJSX73.");
  }

  const existingRowEarly = await fetchInventarioRowByPatent(requestedPatente);
  let skippedGlo3dFetch = false;
  let skippedAutoredFetch = false;

  let glo3d: Glo3dInventoryEntry | null = null;
  if (
    !options?.forceRefresh &&
    existingRowEarly &&
    inventarioRowHasCompleteGlo3d(existingRowEarly)
  ) {
    glo3d = buildGlo3dEntryFromInventarioRow(existingRowEarly);
    skippedGlo3dFetch = Boolean(glo3d);
  }
  if (options?.forceRefresh || !glo3d) {
    if (options?.forceRefresh) skippedGlo3dFetch = false;
    try {
      const fetched = await fetchGlo3dRecordByPatent(requestedPatente);
      glo3d = fetched ?? glo3d;
    } catch (error) {
      if (error instanceof Glo3dRateLimitError && glo3d) {
        // Mantiene datos Glo3D locales si la API está saturada.
      } else if (error instanceof Glo3dRateLimitError) {
        throw error;
      } else {
        throw error;
      }
    }
  }

  const canonicalPatente = glo3d
    ? resolveCanonicalPatentFromGlo3dEntry(glo3d, requestedPatente)
    : requestedPatente;
  const patente = canonicalPatente;
  const correctedPatente = patente !== requestedPatente;

  const existingRow =
    (await fetchInventarioRowByPatent(patente)) ??
    existingRowEarly ??
    (correctedPatente ? await fetchInventarioRowByPatent(requestedPatente) : null);

  let autored: Record<string, unknown> | null = null;
  if (!options?.forceRefresh && existingRow && inventarioRowHasCompleteAutored(existingRow)) {
    const stored = existingRow.autored_campos ?? existingRow.autored;
    if (stored && typeof stored === "object" && !Array.isArray(stored)) {
      autored = normalizeAutoredImportRecord(stored as Record<string, unknown>);
      skippedAutoredFetch = Boolean(autored);
    }
  }
  if (!autored || options?.forceRefresh) {
    skippedAutoredFetch = false;
    autored =
      (await fetchAutoredRecordByPatent(patente, { forceRefresh: options?.forceRefresh })) ??
      (await fetchTasacionesRecordByPatent(patente));
    autored = normalizeAutoredImportRecord(autored);
  }

  const payload = buildInventarioPayloadFromSources(patente, glo3d, autored, options);
  const shouldPersist = Boolean(glo3d || autored || options?.forceRefresh);

  if (existingRow) {
    const persisted = shouldPersist
      ? await persistInventarioRow(patente, payload, existingRow, options)
      : { row: mergePreferMeaningful(payload, existingRow), created: false };
    const mergedRow = buildCatalogRow(patente, persisted.row, glo3d, autored);
    const images = [
      ...extractGlo3dImages(glo3d ?? { raw: mergedRow, technicalFields: {} }),
      ...extractAutoredImages(autored),
      ...normalizeImageList(mergedRow.imagenes),
    ];
    const item = catalogRowToItem(mergedRow);
    if (!item) throw new Error(`No se pudo normalizar el inventario para ${patente}.`);

    return {
      item,
      vehicleDetails: buildVehicleDetailsFromSources(patente, mergedRow, glo3d, autored, images),
      source: resolveImportSource(glo3d, autored, true),
      created: persisted.created,
      patente,
      requestedPatente,
      correctedPatente,
      hasGlo3dViewer: Boolean(glo3d?.view3dUrl ?? mergedRow.glo3d_url ?? mergedRow.url_3d),
      skippedGlo3dFetch,
      skippedAutoredFetch,
    };
  }

  if (!glo3d) {
    const hasGlo3dCredentials = Boolean(
      process.env.GLO3D_API_USERNAME ??
        process.env.VITE_GLO3D_API_USERNAME ??
        process.env.NEXT_PUBLIC_GLO3D_API_USERNAME,
    );
    if (!hasGlo3dCredentials) {
      throw new Error(
        `No se pudo consultar Glo3D para ${patente}. Configura GLO3D_API_USERNAME y GLO3D_API_PASSWORD en Vercel.`,
      );
    }
    throw new Error(
      `No se encontró ${requestedPatente} en Glo3D (o la API está saturada). Verifica la patente exacta (ej. TJSX32, no TSJX32), espera unos segundos y pulsa "Actualizar inventario y sync".`,
    );
  }

  const persisted = await persistInventarioRow(patente, payload, null, options);
  const row = buildCatalogRow(patente, persisted.row, glo3d, autored);
  const images = [
    ...extractGlo3dImages(glo3d),
    ...extractAutoredImages(autored),
    ...normalizeImageList(row.imagenes),
  ];
  const item = catalogRowToItem(row);
  if (!item) throw new Error(`No se pudo normalizar la unidad importada ${patente}.`);

  return {
    item,
    vehicleDetails: buildVehicleDetailsFromSources(patente, row, glo3d, autored, images),
    source: resolveImportSource(glo3d, autored, false),
    created: persisted.created,
    patente,
    requestedPatente,
    correctedPatente,
    hasGlo3dViewer: Boolean(glo3d.view3dUrl),
    skippedGlo3dFetch,
    skippedAutoredFetch,
  };
}

const BATCH_IMPORT_DELAY_MS = Number(process.env.GLO3D_BATCH_DELAY_MS ?? "900");

export async function importVehiclesByPatentsBatch(
  rawPatents: string[],
  options?: ImportPatentOptions,
): Promise<ImportPatentsBatchResult> {
  const unique = Array.from(
    new Set(rawPatents.map((value) => normalizePatent(value)).filter((value) => /^[A-Z0-9]{5,10}$/.test(value))),
  );
  const results: ImportPatentResult[] = [];
  const errors: Array<{ patente: string; error: string }> = [];
  let rateLimited = false;

  for (let index = 0; index < unique.length; index += 1) {
    const patente = unique[index];
    if (index > 0) await sleepMs(BATCH_IMPORT_DELAY_MS);
    try {
      results.push(await importVehicleByPatent(patente, options));
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo importar la patente.";
      errors.push({ patente, error: message });
      if (error instanceof Glo3dRateLimitError) {
        rateLimited = true;
        break;
      }
    }
  }

  return { results, errors, rateLimited };
}
