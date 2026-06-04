import type { CatalogItem } from "@/types/catalog";
import type { EditorConfig } from "@/types/editor";

function getVehicleKey(item: CatalogItem): string {
  const raw = item.raw as Record<string, unknown>;
  const patent = [raw.patente, raw.PATENTE, raw.PPU, raw.stock_number].find(
    (value) => typeof value === "string" && value.trim().length > 0,
  ) as string | undefined;
  if (patent) return patent.toUpperCase().replace(/\s+/g, "").replace(/-/g, "");
  return item.id;
}

/** Estados de inventario compartido (VedisaTasaciones1) aptos para catálogo público. */
export const CATALOG_PUBLISHED_ESTADOS_RETIRO = new Set([
  "en_bodega_a_remate",
  "en_bodega_a_venta_directa",
]);

export function extractEstadoRetiro(item: CatalogItem): string {
  const raw = item.raw as Record<string, unknown>;
  const candidate =
    raw.estado_retiro ??
    raw.estadoRetiro ??
    raw.estado_remate ??
    raw.estado ??
    "";
  return String(candidate).trim().toLowerCase();
}

function normalizeOriginToken(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function collectOriginTokens(item: CatalogItem): string[] {
  const raw = item.raw as Record<string, unknown>;
  const extra = raw.extra_fields;
  const extraFields =
    extra && typeof extra === "object" && !Array.isArray(extra)
      ? (extra as Record<string, unknown>)
      : {};

  return [
    raw.origen,
    raw.origin,
    raw.source,
    raw.source_system,
    raw.platform,
    raw.sistema_origen,
    raw.event_origin,
    extraFields.source_system,
    extraFields.event_origin,
    extraFields.platform,
  ]
    .map(normalizeOriginToken)
    .filter(Boolean);
}

/** Excluye unidades del ecosistema vehiculosdeocasion u otros orígenes de ocasión. */
export function isVehiculosDeOcasionItem(item: CatalogItem): boolean {
  for (const token of collectOriginTokens(item)) {
    if (
      token.includes("vehiculosdeocasion") ||
      token.includes("vehiculodeocasion") ||
      token.includes("deocasion") ||
      token === "ocasion"
    ) {
      return true;
    }
  }

  const haystack = normalizeOriginToken(JSON.stringify(item.raw));
  return (
    haystack.includes("vehiculosdeocasion") ||
    haystack.includes("vehiculosdeocasioncl") ||
    haystack.includes("deocasion")
  );
}

export function collectExplicitlyPublishedVehicleKeys(config: EditorConfig): Set<string> {
  const keys = new Set<string>();

  for (const sectionIds of Object.values(config.sectionVehicleIds ?? {})) {
    for (const key of sectionIds ?? []) keys.add(key);
  }
  for (const key of Object.keys(config.vehicleUpcomingAuctionIds ?? {})) {
    keys.add(key);
  }
  for (const category of config.managedCategories ?? []) {
    for (const key of category.vehicleIds ?? []) keys.add(key);
  }
  for (const manual of config.manualPublications ?? []) {
    if (manual.visible !== false) keys.add(`manual-${manual.id}`);
  }

  return keys;
}

export function isExplicitlyPublishedInEditor(key: string, config: EditorConfig): boolean {
  return collectExplicitlyPublishedVehicleKeys(config).has(key);
}

/**
 * Define qué unidades puede ver el catálogo público (home, /vehiculos y detalle).
 * - Publicadas en el panel admin o asignadas a remate/venta directa activa (sync compartida), o
 * - Sincronizadas desde VedisaTasaciones1 con estado de bodega válido.
 * Nunca incluye vehículos de ocasión ni unidades en otros estados de retiro.
 */
export function isCatalogPublishedVehicle(item: CatalogItem, config: EditorConfig): boolean {
  const key = getVehicleKey(item);

  if ((config.soldVehicleIds ?? []).includes(key)) return false;
  if ((config.hiddenVehicleIds ?? []).includes(key)) return false;

  if (key.startsWith("manual-")) {
    const manualId = key.slice("manual-".length);
    const manual = (config.manualPublications ?? []).find((entry) => entry.id === manualId);
    return manual?.visible !== false;
  }

  if (isVehiculosDeOcasionItem(item)) return false;

  if (isExplicitlyPublishedInEditor(key, config)) return true;

  if (config.vehicleUpcomingAuctionIds?.[key]) return true;

  const estadoRetiro = extractEstadoRetiro(item);
  return CATALOG_PUBLISHED_ESTADOS_RETIRO.has(estadoRetiro);
}
