import type { EditorConfig, UpcomingAuction } from "@/types/editor";

export const DEFAULT_VENTA_DIRECTA_EVENT_ID = "6f4a7e7a-0c83-4e0a-8a7e-9d60f6797f11";
export const DEFAULT_VENTA_DIRECTA_EVENT_NAME = "Venta Directa - Catálogo";
export const ESTADO_RETIRO_VENTA_DIRECTA = "en_bodega_a_venta_directa";

function normalizeEventText(value?: string | null): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function resolveCommercialEventType(
  source: { name?: string | null; eventType?: string | null },
): "remate" | "venta_directa" {
  if (source.eventType === "venta_directa" || source.eventType === "remate") {
    return source.eventType;
  }
  const text = normalizeEventText(source.name);
  if (
    text.includes("ventadirecta") ||
    text.includes("vtadirecta") ||
    text.includes("vtdirecta") ||
    text.includes("ventadir")
  ) {
    return "venta_directa";
  }
  return "remate";
}

/** Claves de vehículos que deben replicarse como venta directa en remates/remates_items/inventario. */
export function collectDirectSaleVehicleKeys(config: EditorConfig): Set<string> {
  const keys = new Set(config.sectionVehicleIds?.["ventas-directas"] ?? []);
  const auctionsById = new Map((config.upcomingAuctions ?? []).map((auction) => [auction.id, auction]));

  for (const [vehicleKey, auctionId] of Object.entries(config.vehicleUpcomingAuctionIds ?? {})) {
    const auction = auctionsById.get(auctionId);
    if (auction && resolveCommercialEventType(auction) === "venta_directa") {
      keys.add(vehicleKey);
    }
  }

  return keys;
}

export function ensureDefaultVentaDirectaAuction(
  byId: Map<string, UpcomingAuction>,
  ventaDirectaSection: Set<string>,
): void {
  if (ventaDirectaSection.size === 0) return;

  const existing = byId.get(DEFAULT_VENTA_DIRECTA_EVENT_ID);
  if (existing) {
    byId.set(DEFAULT_VENTA_DIRECTA_EVENT_ID, {
      ...existing,
      eventType: "venta_directa",
      name: existing.name?.trim() || DEFAULT_VENTA_DIRECTA_EVENT_NAME,
    });
    return;
  }

  const now = new Date();
  const end = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  byId.set(DEFAULT_VENTA_DIRECTA_EVENT_ID, {
    id: DEFAULT_VENTA_DIRECTA_EVENT_ID,
    name: DEFAULT_VENTA_DIRECTA_EVENT_NAME,
    date: now.toISOString().slice(0, 10),
    startAt: now.toISOString(),
    endAt: end.toISOString(),
    eventType: "venta_directa",
    eventOrigin: "catalogo",
  });
}

export function isVentaDirectaAuctionActive(auction: UpcomingAuction, nowMs: number): boolean {
  if (resolveCommercialEventType(auction) !== "venta_directa") return false;
  if (!auction.endAt?.trim()) return true;
  const endMs = Date.parse(auction.endAt);
  if (!Number.isFinite(endMs)) return true;
  return endMs >= nowMs;
}

/** Estado compartido en `remates.estado` según visibilidad en el editor del catálogo. */
export function resolveSharedRemateEstado(
  auctionId: string,
  hiddenCategoryIds: Iterable<string> | undefined,
): "abierto" | "cerrado" {
  const hidden = new Set(hiddenCategoryIds ?? []);
  if (hidden.has(`auction:${auctionId}`)) return "cerrado";
  if (auctionId === DEFAULT_VENTA_DIRECTA_EVENT_ID && hidden.has("section:ventas-directas")) {
    return "cerrado";
  }
  return "abierto";
}

/** Alinea `hiddenCategoryIds` con filas compartidas en estado abierto (solo desoculta). */
export function applySharedRemateEstadoToHiddenCategories(
  hiddenCategoryIds: Set<string>,
  rows: Array<{ id?: string | null; estado?: string | null }>,
): void {
  for (const row of rows) {
    const id = String(row.id ?? "").trim();
    if (!id) continue;
    const estado = String(row.estado ?? "").trim().toLowerCase();
    if (estado !== "abierto") continue;

    hiddenCategoryIds.delete(`auction:${id}`);
    if (id === DEFAULT_VENTA_DIRECTA_EVENT_ID) {
      hiddenCategoryIds.delete("section:ventas-directas");
    }
  }
}

const BASE_HOME_SECTION_HIDDEN_KEYS = ["section:proximos-remates", "section:ventas-directas"] as const;

/** El editor manda la visibilidad de secciones base; el merge no puede revertirla. */
export function preserveEditorBaseSectionVisibility(
  editorConfig: EditorConfig,
  mergedConfig: EditorConfig,
): EditorConfig {
  const hidden = new Set(mergedConfig.hiddenCategoryIds ?? []);
  const editorHidden = new Set(editorConfig.hiddenCategoryIds ?? []);

  for (const sectionKey of BASE_HOME_SECTION_HIDDEN_KEYS) {
    if (editorHidden.has(sectionKey)) hidden.add(sectionKey);
    else hidden.delete(sectionKey);
  }

  const ventaDirectaAuctionKey = `auction:${DEFAULT_VENTA_DIRECTA_EVENT_ID}`;
  if (editorHidden.has("section:ventas-directas")) hidden.add(ventaDirectaAuctionKey);
  else hidden.delete(ventaDirectaAuctionKey);

  return {
    ...mergedConfig,
    hiddenCategoryIds: Array.from(hidden),
  };
}
