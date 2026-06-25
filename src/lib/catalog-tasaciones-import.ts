/**
 * Importación Tasaciones-first: la ficha vive en TasacionesVedisa1;
 * Glo3D/Autored directos solo como plan B cuando falta información.
 */

import {
  buildGlo3dEntryFromInventarioRow,
  type Glo3dInventoryEntry,
} from "@/lib/catalog";
import { extractGlo3dInventoryImages, glo3dSourcesHaveUsableImages, normalizeCatalogImageUrl, pickImageUrlFromValue } from "@/lib/glo3d-images";
import {
  extractAutoredImagesFromRecord,
  mergeVehicleImageSources,
} from "@/lib/catalog-sync-images";
import { autoredRecordHasIdentity } from "@/lib/vehicle-identity";

export type TasacionesCompleteness = {
  complete: boolean;
  hasIdentity: boolean;
  hasGlo3dViewer: boolean;
  hasThumbnail: boolean;
  missing: string[];
};

function pickString(row: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  const lower = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) lower.set(key.toLowerCase(), value);
  for (const key of keys) {
    const value = lower.get(key.toLowerCase());
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function normalizeImageList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => {
        if (typeof entry === "string") {
          const normalized = normalizeCatalogImageUrl(entry.trim());
          return normalized ? [normalized] : [];
        }
        const fromObject = pickImageUrlFromValue(entry);
        return fromObject ? [fromObject] : [];
      })
      .filter(Boolean);
  }
  if (typeof value === "string") {
    const direct = normalizeCatalogImageUrl(value.trim());
    if (direct) return [direct];
    return value
      .split(/[\n,;|]+/)
      .map((part) => normalizeCatalogImageUrl(part.trim()))
      .filter((url): url is string => Boolean(url));
  }
  const fromObject = pickImageUrlFromValue(value);
  return fromObject ? [fromObject] : [];
}

export function normalizePatentKey(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "").replace(/-/g, "");
}

export function extractPatentFromTasacionesRow(row: Record<string, unknown>): string {
  return normalizePatentKey(
    pickString(row, ["patente", "PPU", "ppu", "stock_number", "plate"]) ?? "",
  );
}

/** Evalúa si una fila Tasaciones/inventario ya trae ficha usable sin APIs externas. */
export function assessTasacionesRecordCompleteness(
  row: Record<string, unknown> | null | undefined,
  patente: string,
): TasacionesCompleteness {
  if (!row) {
    return {
      complete: false,
      hasIdentity: false,
      hasGlo3dViewer: false,
      hasThumbnail: false,
      missing: ["tasaciones"],
    };
  }

  const missing: string[] = [];
  const hasIdentity =
    autoredRecordHasIdentity(row, patente) ||
    Boolean(pickString(row, ["marca", "brand"]) && pickString(row, ["modelo", "model"]));
  if (!hasIdentity) missing.push("identidad");

  const glo3dEntry = buildGlo3dEntryFromInventarioRow(row);
  const hasGlo3dViewer = Boolean(
    glo3dEntry?.view3dUrl ?? pickString(row, ["glo3d_url", "url_3d", "visor_3d_url"]),
  );
  if (!hasGlo3dViewer) missing.push("visor_3d");

  const glo3dImages = glo3dEntry
    ? extractGlo3dInventoryImages({ raw: glo3dEntry.raw, technicalFields: glo3dEntry.technicalFields })
    : [];
  const autoredRaw = row.autored_campos ?? row.autored;
  const autoredImages = extractAutoredImagesFromRecord(
    autoredRaw && typeof autoredRaw === "object" && !Array.isArray(autoredRaw)
      ? (autoredRaw as Record<string, unknown>)
      : row,
  );
  const inventarioImages = [
    ...normalizeImageList(row.imagenes),
    ...normalizeImageList(row.fotos),
    ...normalizeImageList(row.fotos_urls),
    ...normalizeImageList(row.galeria),
    ...normalizeImageList(row.galeria_fotos),
    ...extractAutoredImagesFromRecord(row),
    pickString(row, ["thumbnail", "imagen_principal", "foto_portada"]),
  ].filter((url): url is string => typeof url === "string");

  const merged = mergeVehicleImageSources({ glo3dImages, autoredImages, inventarioImages });
  const hasThumbnail = Boolean(merged.thumbnail);
  if (!hasThumbnail) missing.push("miniatura");

  return {
    complete: missing.length === 0,
    hasIdentity,
    hasGlo3dViewer,
    hasThumbnail,
    missing,
  };
}

export function inventarioRowIsTasacionesComplete(
  row: Record<string, unknown>,
  patente?: string,
): boolean {
  const stock = patente ?? extractPatentFromTasacionesRow(row);
  return assessTasacionesRecordCompleteness(row, stock).complete;
}

export function buildGlo3dFromTasacionesRow(
  row: Record<string, unknown>,
): Glo3dInventoryEntry | null {
  const entry = buildGlo3dEntryFromInventarioRow(row);
  if (entry) return entry;

  const rawCandidate = row.glo3d_campos ?? row.glo3d;
  if (rawCandidate && typeof rawCandidate === "object" && !Array.isArray(rawCandidate)) {
    return buildGlo3dEntryFromInventarioRow({
      ...row,
      glo3d_campos: rawCandidate,
    });
  }
  return null;
}

export function buildAutoredFromTasacionesRow(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const autoredNode = row.autored_campos ?? row.autored;
  if (autoredNode && typeof autoredNode === "object" && !Array.isArray(autoredNode)) {
    return { ...(autoredNode as Record<string, unknown>), ...row, origen: row.origen ?? "tasaciones+autored" };
  }
  return { ...row, origen: row.origen ?? "tasaciones" };
}

export function tasacionesRowHasEmbeddedGlo3d(row: Record<string, unknown>): boolean {
  const entry = buildGlo3dFromTasacionesRow(row);
  if (!entry?.view3dUrl) return false;
  return (
    Boolean(row.glo3d_campos ?? row.glo3d) ||
    glo3dSourcesHaveUsableImages(entry.raw, entry.technicalFields)
  );
}

export function tasacionesRowHasEmbeddedInventory(row: Record<string, unknown>): boolean {
  return Boolean(row.glo3d_campos ?? row.glo3d) || Boolean(row.autored_campos ?? row.autored);
}

/** Tasaciones ya trae ficha enriquecida (Glo3D/Autored embebidos) — no reconsultar APIs externas. */
export function tasacionesRowSkipsExternalApis(
  row: Record<string, unknown> | null | undefined,
  patente: string,
): boolean {
  if (!row) return false;
  if (tasacionesRowHasEmbeddedInventory(row)) return true;
  return assessTasacionesRecordCompleteness(row, patente).complete;
}

export function itemOriginatedFromTasaciones(raw: Record<string, unknown>): boolean {
  const origen = String(raw.origen ?? raw.source ?? "").toLowerCase();
  return (
    origen.includes("tasaciones") ||
    Boolean(raw.autored_campos ?? raw.autored) ||
    Boolean(raw.glo3d_campos ?? raw.glo3d)
  );
}

/** Segundos de cache para el mapa bulk de Tasaciones en import por lote. */
export const TASACIONES_BULK_CACHE_TTL_MS = Number(
  process.env.TASACIONES_BULK_CACHE_TTL_MS ?? "120000",
);

let tasacionesBulkCache: {
  expires: number;
  byPatent: Map<string, Record<string, unknown>>;
} | null = null;

export function indexTasacionesRowsByPatent(
  rows: Record<string, unknown>[],
): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const key = extractPatentFromTasacionesRow(row);
    if (!key) continue;
    map.set(key, row);
  }
  return map;
}

export function getCachedTasacionesInventarioMap(): Map<string, Record<string, unknown>> | null {
  if (!tasacionesBulkCache || tasacionesBulkCache.expires <= Date.now()) return null;
  return tasacionesBulkCache.byPatent;
}

export function setCachedTasacionesInventarioMap(byPatent: Map<string, Record<string, unknown>>): void {
  tasacionesBulkCache = {
    expires: Date.now() + TASACIONES_BULK_CACHE_TTL_MS,
    byPatent,
  };
}

export function invalidateTasacionesBulkCache(): void {
  tasacionesBulkCache = null;
}

export function resolveTasacionesRowFromMap(
  patent: string,
  map?: Map<string, Record<string, unknown>> | null,
): Record<string, unknown> | null {
  const key = normalizePatentKey(patent);
  if (!key || !map) return null;
  return map.get(key) ?? null;
}
