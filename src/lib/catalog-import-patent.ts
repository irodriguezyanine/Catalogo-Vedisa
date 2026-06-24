import { createClient } from "@supabase/supabase-js";
import {
  buildGlo3dEntryFromInventarioRow,
  catalogRowToItem,
  fetchAutoredRecordByPatent,
  fetchGlo3dRecordByPatent,
  fetchInventarioRowByPatent,
  fetchTasacionesInventarioMap,
  fetchTasacionesRecordByPatent,
  invalidateAutoredPatentCache,
  invalidateGlo3dPatentCache,
  getGlo3dCircuitRetryAfterMs,
  Glo3dRateLimitError,
  resolveCanonicalPatentFromGlo3dEntry,
  type Glo3dInventoryEntry,
} from "@/lib/catalog";
import {
  assessTasacionesRecordCompleteness,
  buildAutoredFromTasacionesRow,
  buildGlo3dFromTasacionesRow,
  getCachedTasacionesInventarioMap,
  inventarioRowIsTasacionesComplete,
  resolveTasacionesRowFromMap,
  setCachedTasacionesInventarioMap,
} from "@/lib/catalog-tasaciones-import";
import { sleepMs } from "@/lib/glo3d-api";
import { fetchAutoredPublicationAveragePrice, isAutoredApiConfigured } from "@/lib/autored-api";
import { buildDefaultVentaDirectaExtendedDescription } from "@/lib/venta-directa-description";
import {
  autoredRecordHasIdentity,
  looksLikeChileanPatent,
  sanitizeMarcaValue,
  sanitizeModeloValue,
} from "@/lib/vehicle-identity";
import {
  applyGlo3dImagesToInventarioRow,
  extractGlo3dInventoryImages,
  glo3dSourcesHaveUsableImages,
} from "@/lib/glo3d-images";
import {
  extractAutoredImagesFromRecord,
  mergeVehicleImageSources,
  type CatalogThumbnailSource,
} from "@/lib/catalog-sync-images";
import {
  mapPruebaDesplazamientoToSiNo,
  mapPruebaMotorToSiNo,
} from "@/lib/prueba-operativa-sino";
import type { CatalogItem } from "@/types/catalog";
import type { EditorVehicleDetails } from "@/types/editor";

export type ImportPatentSource =
  | "inventario"
  | "tasaciones"
  | "tasaciones+glo3d"
  | "glo3d"
  | "glo3d+autored"
  | "autored";

export type ImportPatentSyncMode = "tasaciones-first" | "external";

export type ImportPatentOptions = {
  estadoRetiro?: string;
  /** Refresca datos desde Tasaciones/inventario compartido (default true). */
  forceRefresh?: boolean;
  /** Plan B: fuerza consulta directa a APIs Glo3D y Autored aunque Tasaciones esté completo. */
  forceExternalApis?: boolean;
  /** Estrategia de sync: tasaciones-first (default) o external (solo APIs). */
  syncMode?: ImportPatentSyncMode;
  /** Omite consulta a Glo3D (útil si la API está saturada). */
  skipGlo3dFetch?: boolean;
  /** Mapa precargado de inventario Tasaciones (import por lote). */
  tasacionesMap?: Map<string, Record<string, unknown>>;
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
  glo3dRateLimited?: boolean;
  autoredSynced?: boolean;
  autoredConfigured?: boolean;
  autoredReason?: "synced" | "not_configured" | "no_record" | "no_identity";
  retryAfterMs?: number;
  syncDiagnostics?: {
    tasacionesFound: boolean;
    tasacionesComplete: boolean;
    usedExternalApis: boolean;
    glo3dFound: boolean;
    glo3dImageCount: number;
    glo3dViewer: boolean;
    thumbnailSource: CatalogThumbnailSource;
    autoredSynced: boolean;
    syncComplete: boolean;
    warnings: string[];
  };
};

function resolveAutoredSyncReason(
  autoredSynced: boolean,
  autored: Record<string, unknown> | null,
): ImportPatentResult["autoredReason"] {
  if (autoredSynced) return "synced";
  if (!isAutoredApiConfigured() && !process.env.CATALOG_SOURCE_AUTORED_API_URL) {
    return "not_configured";
  }
  if (!autored) return "no_record";
  return "no_identity";
}

function buildImportPatentResult(
  base: Omit<
    ImportPatentResult,
    "autoredConfigured" | "autoredReason"
  > & { autored: Record<string, unknown> | null },
): ImportPatentResult {
  const autoredSynced = base.autoredSynced ?? autoredRecordHasIdentity(base.autored, base.patente);
  return {
    ...base,
    autoredSynced,
    autoredConfigured: isAutoredApiConfigured() || Boolean(process.env.CATALOG_SOURCE_AUTORED_API_URL),
    autoredReason: resolveAutoredSyncReason(autoredSynced, base.autored),
  };
}

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
  "fotos_urls",
  "fotos",
  "thumbnail",
  "imagen_principal",
  "foto_portada",
  "marca",
  "modelo",
  "ano",
  "version",
  "vin",
  "transmision",
  "cilindrada",
  "llaves",
  "aire_acondicionado",
  "prueba_motor",
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
    normalized === "sin informacion disponible" ||
    normalized === "unidad"
  );
}

function sanitizeIdentityValue(
  value: string | undefined,
  patente: string,
): string | undefined {
  if (!value?.trim()) return undefined;
  const trimmed = value.trim();
  if (isPlaceholderVehicleLabel(trimmed)) return undefined;
  if (normalizePatent(trimmed) === normalizePatent(patente)) return undefined;
  if (trimmed.toLowerCase() === "unidad") return undefined;
  return trimmed;
}

function parseIdentityFromVehicleTitle(
  title: string | undefined,
  patente: string,
): { marca?: string; modelo?: string; ano?: string } {
  if (!title?.trim()) return {};
  const cleaned = title.trim().replace(/\s+/g, " ");
  if (looksLikeChileanPatent(cleaned) || normalizePatent(cleaned) === normalizePatent(patente)) {
    return {};
  }
  const yearMatch = cleaned.match(/\b(19|20)\d{2}\b/);
  const ano = yearMatch?.[0];
  const withoutYear = ano ? cleaned.replace(yearMatch![0], "").trim() : cleaned;
  const tokens = withoutYear.split(" ").filter(Boolean);
  if (tokens.length >= 2) {
    const parsedMarca = sanitizeMarcaValue(tokens[0]);
    const parsedModelo = sanitizeModeloValue(tokens.slice(1).join(" "), patente);
    return {
      marca: parsedMarca,
      modelo: parsedModelo,
      ano,
    };
  }
  if (tokens.length === 1) {
    const parsedModelo = sanitizeModeloValue(tokens[0], patente);
    return { modelo: parsedModelo, ano };
  }
  return ano ? { ano } : {};
}

function isDerivedPlaceholderIdentity(
  marca: string | undefined,
  modelo: string | undefined,
  patente: string,
): boolean {
  const normalizedPatente = normalizePatent(patente);
  const marcaNorm = marca?.trim().toLowerCase() ?? "";
  const modeloNorm = modelo?.trim().toLowerCase() ?? "";
  if (marcaNorm === "unidad") return true;
  if (modeloNorm && modeloNorm === normalizedPatente.toLowerCase() && (!marca || marcaNorm === "unidad")) {
    return true;
  }
  if (marcaNorm && marcaNorm === normalizedPatente.toLowerCase()) return true;
  return false;
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
  return extractGlo3dInventoryImages({
    raw: glo3d.raw,
    technicalFields: glo3d.technicalFields,
  });
}

function extractAutoredImages(autored?: Record<string, unknown> | null): string[] {
  return extractAutoredImagesFromRecord(autored);
}

function resolveMergedVehicleImages(
  glo3d: Glo3dInventoryEntry | null | undefined,
  autored: Record<string, unknown> | null | undefined,
  row?: Record<string, unknown>,
) {
  const glo3dImages = glo3d ? extractGlo3dImages(glo3d) : [];
  const autoredImages = extractAutoredImagesFromRecord(autored);
  const inventarioImages = row ? normalizeImageList(row.imagenes) : [];
  const rowThumb = row ? pickString(row, ["thumbnail", "imagen_principal", "foto_portada"]) : undefined;
  if (rowThumb?.startsWith("http")) inventarioImages.unshift(rowThumb);
  return mergeVehicleImageSources({ glo3dImages, autoredImages, inventarioImages });
}

function buildSyncDiagnostics(
  patente: string,
  glo3d: Glo3dInventoryEntry | null,
  autored: Record<string, unknown> | null,
  merged: ReturnType<typeof mergeVehicleImageSources>,
  hasGlo3dViewer: boolean,
  tasaciones: {
    found: boolean;
    complete: boolean;
    usedExternalApis: boolean;
  },
): NonNullable<ImportPatentResult["syncDiagnostics"]> {
  const warnings: string[] = [];
  const glo3dImageCount = glo3d ? extractGlo3dImages(glo3d).length : 0;

  if (!tasaciones.found) {
    warnings.push("Tasaciones: patente no encontrada en inventario compartido.");
  } else if (!tasaciones.complete && !tasaciones.usedExternalApis) {
    warnings.push("Tasaciones: ficha incompleta; se intentará plan B (APIs externas).");
  }
  if (!glo3d && tasaciones.usedExternalApis) {
    warnings.push("Glo3D API: patente no encontrada en consulta directa.");
  } else if (glo3d && glo3dImageCount === 0 && tasaciones.usedExternalApis) {
    warnings.push("Glo3D API: registro sin miniaturas extraíbles.");
  }
  if (hasGlo3dViewer && merged.thumbnailSource === "autored") {
    warnings.push("Miniatura viene de Autored; se esperaba imagen Glo3D embebida.");
  }
  if (!merged.thumbnail) {
    warnings.push("Sin miniatura utilizable tras la fusión.");
  }
  if (!autoredRecordHasIdentity(autored, patente)) {
    warnings.push("Sin marca/modelo útiles para esta patente.");
  }

  const syncComplete =
    Boolean(merged.thumbnail) &&
    (!hasGlo3dViewer || merged.thumbnailSource === "glo3d" || glo3dImageCount === 0);

  return {
    tasacionesFound: tasaciones.found,
    tasacionesComplete: tasaciones.complete,
    usedExternalApis: tasaciones.usedExternalApis,
    glo3dFound: Boolean(glo3d),
    glo3dImageCount,
    glo3dViewer: hasGlo3dViewer,
    thumbnailSource: merged.thumbnailSource,
    autoredSynced: autoredRecordHasIdentity(autored, patente),
    syncComplete,
    warnings,
  };
}

function normalizeAutoredImportRecord(
  raw?: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!raw) return null;
  const merged = buildMergedRecord(raw);
  const patente = pickString(merged, ["patente", "PPU", "ppu", "plate", "stock_number"]) ?? "";
  let marca = pickString(merged, [
    "marca",
    "brand",
    "make",
    "vehicle_brand",
    "vehiculo_marca",
    "fabricante",
    "nombre_marca",
    "brand_name",
    "original_brand_name",
    "make_name",
    "nombre_fabricante",
  ]);
  let modelo = pickString(merged, [
    "modelo",
    "model",
    "model2",
    "vehicle_model",
    "vehiculo_modelo",
    "nombre_modelo",
    "model_name",
    "original_model_name",
  ]);
  let ano = pickString(merged, [
    "ano",
    "anio",
    "year",
    "año",
    "agno",
    "anio_fabricacion",
    "fabricacion",
    "year_manufacture",
  ]);
  if (!marca || !modelo || !ano) {
    const titleIdentity = parseIdentityFromVehicleTitle(
      pickString(merged, ["titulo", "nombre_vehiculo", "vehiculo", "vehicle_name", "nombre"]),
      patente,
    );
    marca = marca ?? titleIdentity.marca;
    modelo = modelo ?? titleIdentity.modelo;
    ano = ano ?? titleIdentity.ano;
  }
  marca = sanitizeMarcaValue(marca);
  modelo = sanitizeModeloValue(modelo, patente);
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
  const numeroChasis =
    pickString(merged, [
      "numero_chasis",
      "n_de_chasis",
      "nro_chasis",
      "chasis",
      "chassis_number",
    ]) ?? pickString(merged, ["vin", "n_de_vin", "extracted_vin", "numero_vin"]);
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
  const combustible = pickString(merged, [
    "combustible",
    "tipo_combustible",
    "fuel",
    "fuel_type",
    "engine_fuel_type",
    "fuelTypeName",
  ]);
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
  if (combustible) {
    normalized.combustible = combustible;
    normalized.tipo_combustible = combustible;
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
  const identity = mergePreferMeaningful(autoredMerged, mergePreferMeaningful(glo3dFields, rowMerged));
  const technical = mergePreferMeaningful(glo3dFields, autoredMerged);
  const merged = { ...technical, ...identity };

  const marca = sanitizeIdentityValue(
    pickString(merged, ["marca", "brand", "make", "vehicle_brand", "vehiculo_marca"]),
    patente,
  );
  const modelo = sanitizeIdentityValue(
    pickString(merged, ["modelo", "model", "model2", "vehicle_model", "vehiculo_modelo"]),
    patente,
  );
  const ano = pickString(merged, ["ano", "anio", "year", "año"]);
  const version = pickString(merged, ["version", "trim", "ver"]);
  const title =
    [marca, modelo, ano]
      .filter((part) => part && !isPlaceholderVehicleLabel(part))
      .join(" ")
      .trim() || `Unidad ${patente}`;
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
    vin: pickString(merged, ["vin", "n_de_vin", "numero_vin", "extracted_vin"]),
    nChasis:
      pickString(merged, ["n_de_chasis", "numero_chasis", "nro_chasis", "chasis"]) ??
      pickString(merged, ["vin", "n_de_vin", "extracted_vin"]),
    nMotor:
      pickString(merged, ["n_de_motor", "numero_motor", "nro_motor", "ndm", "motor", "engine_number"]) ??
      pickString(merged, ["engine_number"]),
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
    aro: pickString(merged, ["aro", "rin", "rines", "aro_llanta", "wheel_size"]),
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
      mapPruebaMotorToSiNo(
        pickString(row, ["prueba_motor", "pdm"]) ??
          pickString(glo3dFields, [
            "prueba_motor",
            "prueba_motor_arranca",
            "pdm",
            "motor_arranca",
            "motor arranca",
          ]),
      ) ?? undefined,
    pruebaDesplazamiento:
      mapPruebaDesplazamientoToSiNo(
        pickString(row, ["prueba_desplazamiento", "pdd"]) ??
          pickString(glo3dFields, [
            "prueba_desplazamiento",
            "prueba_desplazamiento_mueve",
            "pdd",
            "se_desplaza",
            "se desplaza",
          ]),
      ) ?? undefined,
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
    extendedDescription: pickString(row, ["descripcion_ampliada", "observaciones"]) ?? undefined,
    originalPrice: resolvePublicationPriceFromRow(row),
  };
}

function resolvePublicationPriceFromRow(row: Record<string, unknown>): string | undefined {
  const raw = pickString(row, [
    "precio_promedio_publicacion",
    "valor_minimo",
    "precio_referencia",
    "precio_normal",
    "original_price",
  ]);
  if (!raw) return undefined;
  const digits = raw.replace(/[^\d]/g, "");
  return digits || undefined;
}

async function applyDefaultVentaDirectaForNewVehicle(
  payload: Record<string, unknown>,
  autored: Record<string, unknown> | null,
): Promise<Record<string, unknown>> {
  const km = pickString(payload, ["kilometraje", "km", "odometro", "mileage"]);
  const averagePrice = autored
    ? await fetchAutoredPublicationAveragePrice(autored, km)
    : null;
  const extendedDescription = buildDefaultVentaDirectaExtendedDescription(averagePrice);
  return {
    ...payload,
    descripcion_ampliada: extendedDescription,
    observaciones: extendedDescription,
    ...(averagePrice
      ? {
          valor_minimo: averagePrice,
          precio_referencia: averagePrice,
          precio_promedio_publicacion: averagePrice,
        }
      : {}),
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

  const marca =
    sanitizeIdentityValue(
      pickString(merged, ["marca", "brand", "make", "vehicle_brand", "vehiculo_marca"]),
      patente,
    ) ?? "Sin Marca";
  const modelo =
    sanitizeIdentityValue(
      pickString(merged, ["modelo", "model", "model2", "vehicle_model", "vehiculo_modelo"]),
      patente,
    ) ?? "Sin Modelo";
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
  const llaves = pickString(technical, ["llaves", "keys", "lla"]);
  const aireAcondicionado = pickString(technical, ["aire_acondicionado", "ac"]);
  const unicoPropietario = pickString(technical, ["unico_propietario"]);
  const condicionado = pickString(technical, ["condicionado", "acondicionado"]);
  const multas = pickString(technical, ["multas", "mul"]);
  const tag = pickString(technical, ["tag"]);
  const pruebaMotor =
    mapPruebaMotorToSiNo(
      pickString(technical, ["prueba_motor", "pdm", "prueba_motor_arranca", "motor_arranca"]),
    ) ?? null;
  const pruebaDesplazamiento =
    mapPruebaDesplazamientoToSiNo(
      pickString(technical, ["prueba_desplazamiento", "pdd", "se_desplaza"]),
    ) ?? null;
  const estadoAirbags = pickString(technical, ["estado_airbags", "eda"]);
  const glo3dImages = glo3d ? extractGlo3dImages(glo3d) : [];
  const mergedImages = mergeVehicleImageSources({
    glo3dImages,
    autoredImages: extractAutoredImagesFromRecord(autored),
    inventarioImages: [],
  });
  const imagenes = mergedImages.images;
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
    llaves: llaves ?? null,
    aire_acondicionado: aireAcondicionado ?? null,
    unico_propietario: unicoPropietario ?? null,
    condicionado: condicionado ?? null,
    multas: multas ?? null,
    tag: tag ?? null,
    prueba_motor: pruebaMotor,
    pdm: pruebaMotor,
    prueba_desplazamiento: pruebaDesplazamiento,
    pdd: pruebaDesplazamiento,
    estado_airbags: estadoAirbags ?? null,
    eda: estadoAirbags ?? null,
    imagenes: imagenes.length > 0 ? imagenes : null,
    thumbnail: mergedImages.thumbnail ?? null,
    imagen_principal: mergedImages.thumbnail ?? null,
    foto_portada: mergedImages.thumbnail ?? null,
    fotos_urls: imagenes.length > 0 ? imagenes : null,
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
  const mergedImages = resolveMergedVehicleImages(glo3d, autored, base);
  const imagenes = mergedImages.images;
  const primaryImage = mergedImages.thumbnail ?? pickString(base, ["thumbnail", "imagen_principal", "foto_portada"]);
  const withMedia = applyGlo3dImagesToInventarioRow(
    {
      ...base,
      patente,
      glo3d: glo3d?.raw ?? base.glo3d ?? null,
      glo3d_url: glo3d?.view3dUrl ?? base.glo3d_url ?? base.url_3d ?? null,
      url_3d: glo3d?.view3dUrl ?? base.url_3d ?? base.glo3d_url ?? null,
      autored: autored ?? base.autored ?? null,
    },
    imagenes.length > 0 ? imagenes : primaryImage ? [primaryImage] : [],
  );
  if (!withMedia.thumbnail && primaryImage) {
    withMedia.thumbnail = primaryImage;
    withMedia.imagen_principal = primaryImage;
    withMedia.foto_portada = primaryImage;
  }
  return withMedia;
}

function resolveImportSource(
  glo3d: Glo3dInventoryEntry | null,
  autored: Record<string, unknown> | null,
  fromExistingInventory: boolean,
  fromTasaciones: boolean,
  usedExternalApis: boolean,
): ImportPatentSource {
  if (fromExistingInventory && !fromTasaciones && !usedExternalApis) return "inventario";
  if (fromTasaciones && !usedExternalApis) {
    if (glo3d && autored) return "tasaciones+glo3d";
    return "tasaciones";
  }
  if (fromExistingInventory) return "inventario";
  if (glo3d && autored) return "glo3d+autored";
  if (glo3d) return "glo3d";
  return "autored";
}

async function resolveTasacionesRowForImport(
  patente: string,
  options?: ImportPatentOptions,
): Promise<Record<string, unknown> | null> {
  const fromMap = resolveTasacionesRowFromMap(patente, options?.tasacionesMap);
  if (fromMap) {
    return buildAutoredFromTasacionesRow(fromMap);
  }
  return fetchTasacionesRecordByPatent(patente);
}

function inventarioRowHasCompleteGlo3d(row: Record<string, unknown>): boolean {
  const entry = buildGlo3dEntryFromInventarioRow(row);
  if (!entry) return false;
  const hasViewer = Boolean(
    entry.view3dUrl ?? pickString(row, ["glo3d_url", "url_3d", "visor_3d_url"]),
  );
  const hasRaw = row.glo3d_campos != null || row.glo3d != null;
  const storedThumb = pickString(row, ["thumbnail", "imagen_principal", "foto_portada"]);
  const hasStoredThumb = Boolean(storedThumb?.startsWith("http"));
  const hasExtractedImages = glo3dSourcesHaveUsableImages(entry.raw, entry.technicalFields);
  return hasViewer && hasRaw && (hasStoredThumb || hasExtractedImages);
}

function inventarioRowHasCompleteAutored(row: Record<string, unknown>): boolean {
  const patente = pickString(row, ["patente", "PPU", "ppu", "stock_number"]) ?? "";
  const marca = pickString(row, ["marca", "brand"]);
  const modelo = pickString(row, ["modelo", "model"]);
  if (isPlaceholderVehicleLabel(marca) || isPlaceholderVehicleLabel(modelo)) {
    return false;
  }
  if (marca && modelo && isDerivedPlaceholderIdentity(marca, modelo, patente)) {
    return false;
  }
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

  const syncMode = options?.syncMode ?? "tasaciones-first";
  const forceExternalApis =
    options?.forceExternalApis === true || syncMode === "external";
  const refreshSources = options?.forceRefresh !== false;

  if (forceExternalApis && refreshSources) {
    invalidateGlo3dPatentCache(requestedPatente);
    invalidateAutoredPatentCache(requestedPatente);
  }

  const existingRowEarly = await fetchInventarioRowByPatent(requestedPatente);
  let skippedGlo3dFetch = false;
  let skippedAutoredFetch = false;
  let glo3dRateLimited = false;
  let usedExternalApis = false;
  let fromTasaciones = false;

  // ── 1) Tasaciones (fuente primaria) ─────────────────────────────────────
  let tasacionesRow: Record<string, unknown> | null = null;
  if (
    refreshSources ||
    !existingRowEarly ||
    !inventarioRowIsTasacionesComplete(existingRowEarly, requestedPatente)
  ) {
    tasacionesRow = await resolveTasacionesRowForImport(requestedPatente, options);
  } else if (existingRowEarly) {
    tasacionesRow = buildAutoredFromTasacionesRow(existingRowEarly);
  }

  fromTasaciones = Boolean(tasacionesRow);
  let tasacionesCompleteness = assessTasacionesRecordCompleteness(
    tasacionesRow,
    requestedPatente,
  );

  let glo3d: Glo3dInventoryEntry | null = tasacionesRow
    ? buildGlo3dFromTasacionesRow(tasacionesRow)
    : null;
  let autored: Record<string, unknown> | null = tasacionesRow
    ? normalizeAutoredImportRecord(buildAutoredFromTasacionesRow(tasacionesRow))
    : null;

  if (glo3d) skippedGlo3dFetch = true;
  if (autoredRecordHasIdentity(autored, requestedPatente)) skippedAutoredFetch = true;

  // Cache local si Tasaciones no respondió pero inventario catálogo está completo
  if (!tasacionesCompleteness.complete && existingRowEarly) {
    if (inventarioRowHasCompleteGlo3d(existingRowEarly) && !glo3d) {
      glo3d = buildGlo3dEntryFromInventarioRow(existingRowEarly);
      skippedGlo3dFetch = true;
    }
    if (inventarioRowHasCompleteAutored(existingRowEarly) && !autoredRecordHasIdentity(autored, requestedPatente)) {
      const stored = existingRowEarly.autored_campos ?? existingRowEarly.autored;
      if (stored && typeof stored === "object" && !Array.isArray(stored)) {
        autored = normalizeAutoredImportRecord(stored as Record<string, unknown>);
        skippedAutoredFetch = Boolean(autored);
      }
    }
    tasacionesCompleteness = assessTasacionesRecordCompleteness(
      tasacionesRow ?? existingRowEarly,
      requestedPatente,
    );
  }

  // ── 2) Plan B: APIs externas solo si falta info o se fuerza ─────────────
  const needsExternalGlo3d =
    forceExternalApis ||
    (!options?.skipGlo3dFetch &&
      !tasacionesCompleteness.hasGlo3dViewer &&
      !glo3d?.view3dUrl);
  const needsExternalAutored =
    forceExternalApis || !autoredRecordHasIdentity(autored, requestedPatente);

  if (needsExternalGlo3d && !options?.skipGlo3dFetch) {
    usedExternalApis = true;
    skippedGlo3dFetch = false;
    try {
      const fetched = await fetchGlo3dRecordByPatent(requestedPatente, {
        forceRefresh: forceExternalApis,
      });
      glo3d = fetched ?? glo3d;
    } catch (error) {
      if (error instanceof Glo3dRateLimitError) {
        glo3dRateLimited = true;
        skippedGlo3dFetch = true;
        if (!glo3d && existingRowEarly) {
          glo3d = buildGlo3dEntryFromInventarioRow(existingRowEarly);
        }
      } else if (!glo3d) {
        throw error;
      }
    }
  }

  if (needsExternalAutored) {
    usedExternalApis = true;
    skippedAutoredFetch = false;
    autored =
      (await fetchAutoredRecordByPatent(requestedPatente, {
        forceRefresh: forceExternalApis,
      })) ?? autored;
    autored = normalizeAutoredImportRecord(autored);
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

  const autoredSynced = autoredRecordHasIdentity(autored, patente);

  let payload = buildInventarioPayloadFromSources(patente, glo3d, autored, options);
  if (tasacionesRow) {
    payload = mergePreferMeaningful(payload, tasacionesRow);
    payload.glo3d_campos =
      payload.glo3d_campos ?? tasacionesRow.glo3d_campos ?? tasacionesRow.glo3d ?? null;
    payload.autored_campos =
      payload.autored_campos ?? tasacionesRow.autored_campos ?? tasacionesRow.autored ?? null;
    payload.origen = usedExternalApis ? "tasaciones+external" : "tasaciones";
  }
  payload.patente = patente;
  payload.PPU = patente;
  payload.stock_number = patente;
  if (!sanitizeModeloValue(String(payload.modelo ?? ""), patente)) {
    payload.modelo = "Sin Modelo";
  }
  if (!sanitizeMarcaValue(String(payload.marca ?? ""))) {
    payload.marca = "Sin Marca";
  }
  const shouldPersist = Boolean(glo3d || autored || tasacionesRow || options?.forceRefresh);

  const buildResult = (
    row: Record<string, unknown>,
    created: boolean,
    fromExistingInventory: boolean,
  ): ImportPatentResult => {
    const mergedRow = buildCatalogRow(patente, row, glo3d, autored);
    const mergedImages = resolveMergedVehicleImages(glo3d, autored, mergedRow);
    const images = mergedImages.images;
    const item = catalogRowToItem(mergedRow);
    if (!item) throw new Error(`No se pudo normalizar el inventario para ${patente}.`);
    const hasGlo3dViewer = Boolean(glo3d?.view3dUrl ?? mergedRow.glo3d_url ?? mergedRow.url_3d);
    const completeness = assessTasacionesRecordCompleteness(
      tasacionesRow ?? mergedRow,
      patente,
    );

    return buildImportPatentResult({
      item,
      vehicleDetails: buildVehicleDetailsFromSources(patente, mergedRow, glo3d, autored, images),
      source: resolveImportSource(
        glo3d,
        autored,
        fromExistingInventory,
        fromTasaciones,
        usedExternalApis,
      ),
      created,
      patente,
      requestedPatente,
      correctedPatente,
      hasGlo3dViewer,
      skippedGlo3dFetch,
      skippedAutoredFetch,
      glo3dRateLimited,
      autoredSynced,
      autored,
      retryAfterMs: glo3dRateLimited ? getGlo3dCircuitRetryAfterMs() : undefined,
      syncDiagnostics: buildSyncDiagnostics(patente, glo3d, autored, mergedImages, hasGlo3dViewer, {
        found: fromTasaciones,
        complete: completeness.complete,
        usedExternalApis,
      }),
    });
  };

  if (existingRow) {
    const persisted = shouldPersist
      ? await persistInventarioRow(patente, payload, existingRow, options)
      : { row: mergePreferMeaningful(payload, existingRow), created: false };
    return buildResult(persisted.row, persisted.created, true);
  }

  if (!glo3d && !autoredSynced && !fromTasaciones) {
    if (glo3dRateLimited) {
      throw new Glo3dRateLimitError(getGlo3dCircuitRetryAfterMs());
    }
    throw new Error(
      `No se encontró ${requestedPatente} en Tasaciones ni en APIs externas. Verifica la patente en TasacionesVedisa1.`,
    );
  }

  if (!existingRow) {
    payload = await applyDefaultVentaDirectaForNewVehicle(payload, autored);
  }

  const persisted = await persistInventarioRow(patente, payload, null, options);
  return buildResult(persisted.row, persisted.created, false);
}

const TASACIONES_BATCH_DELAY_MS = Number(process.env.TASACIONES_BATCH_DELAY_MS ?? "0");
const EXTERNAL_API_BATCH_DELAY_MS = Number(process.env.EXTERNAL_API_BATCH_DELAY_MS ?? "900");

export async function preloadTasacionesMapForImport(
  options?: ImportPatentOptions,
): Promise<Map<string, Record<string, unknown>>> {
  const cached = getCachedTasacionesInventarioMap();
  if (cached && !options?.forceExternalApis) return cached;
  const map = await fetchTasacionesInventarioMap();
  setCachedTasacionesInventarioMap(map);
  return map;
}

export async function importVehiclesByPatentsBatch(
  rawPatents: string[],
  options?: ImportPatentOptions,
): Promise<ImportPatentsBatchResult> {
  const patentes = rawPatents
    .map((value) => normalizePatent(value))
    .filter((value) => /^[A-Z0-9]{5,10}$/.test(value));
  const uniquePatentes = [...new Set(patentes)];

  const tasacionesMap =
    options?.tasacionesMap ??
    (await preloadTasacionesMapForImport(options).catch(() => new Map()));

  const results: ImportPatentResult[] = [];
  const errors: Array<{ patente: string; error: string }> = [];
  let rateLimited = false;

  for (let index = 0; index < uniquePatentes.length; index += 1) {
    const patente = uniquePatentes[index]!;
    try {
      results.push(
        await importVehicleByPatent(patente, {
          ...options,
          tasacionesMap,
          forceRefresh: options?.forceRefresh ?? true,
          syncMode: options?.syncMode ?? "tasaciones-first",
        }),
      );
    } catch (error) {
      if (error instanceof Glo3dRateLimitError) rateLimited = true;
      errors.push({
        patente,
        error: error instanceof Error ? error.message : "Error desconocido",
      });
    }

    if (index + 1 < uniquePatentes.length) {
      const lastUsedExternal = results[results.length - 1]?.syncDiagnostics?.usedExternalApis;
      const delayMs = lastUsedExternal ? EXTERNAL_API_BATCH_DELAY_MS : TASACIONES_BATCH_DELAY_MS;
      if (delayMs > 0) await sleepMs(delayMs);
    }
  }

  return { results, errors, rateLimited };
}
