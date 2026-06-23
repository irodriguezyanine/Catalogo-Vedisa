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
  source: { id?: string | null; name?: string | null; eventType?: string | null },
): "remate" | "venta_directa" {
  if (source.id === DEFAULT_VENTA_DIRECTA_EVENT_ID) return "venta_directa";

  const text = normalizeEventText(source.name);
  if (
    text.includes("ventadirecta") ||
    text.includes("vtadirecta") ||
    text.includes("vtdirecta") ||
    text.includes("ventadir")
  ) {
    return "venta_directa";
  }
  if (text.includes("remate")) {
    return "remate";
  }

  if (source.eventType === "venta_directa" || source.eventType === "remate") {
    return source.eventType;
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
  options?: {
    sharedItemCount?: number;
    sharedRow?: {
      descripcion?: string | null;
      fecha_hora_inicio?: string | null;
      fecha_hora_cierre?: string | null;
      fecha_hora_remate?: string | null;
    };
  },
): void {
  const sharedItemCount = options?.sharedItemCount ?? 0;
  const hasSharedRow = Boolean(options?.sharedRow);
  if (
    ventaDirectaSection.size === 0 &&
    sharedItemCount === 0 &&
    !hasSharedRow &&
    !byId.has(DEFAULT_VENTA_DIRECTA_EVENT_ID)
  ) {
    return;
  }

  const sharedRow = options?.sharedRow;
  const existing = byId.get(DEFAULT_VENTA_DIRECTA_EVENT_ID);
  const name =
    existing?.name?.trim() ||
    String(sharedRow?.descripcion ?? "").trim() ||
    DEFAULT_VENTA_DIRECTA_EVENT_NAME;
  const startAt = existing?.startAt ?? sharedRow?.fecha_hora_inicio ?? existing?.date ?? undefined;
  const endAt =
    existing?.endAt ??
    sharedRow?.fecha_hora_cierre ??
    sharedRow?.fecha_hora_remate ??
    undefined;
  byId.set(DEFAULT_VENTA_DIRECTA_EVENT_ID, {
    ...(existing ?? {
      id: DEFAULT_VENTA_DIRECTA_EVENT_ID,
      date: new Date().toISOString().slice(0, 10),
    }),
    id: DEFAULT_VENTA_DIRECTA_EVENT_ID,
    name,
    startAt,
    endAt,
    eventType: "venta_directa",
    eventOrigin: existing?.eventOrigin ?? "tasaciones",
  });
}

export function isVentaDirectaAuctionActive(auction: UpcomingAuction, nowMs: number): boolean {
  if (resolveCommercialEventType(auction) !== "venta_directa") return false;
  // Alineado con Tasaciones: el catálogo compartido permanece activo mientras el evento siga abierto.
  if (auction.id === DEFAULT_VENTA_DIRECTA_EVENT_ID) return true;
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

/** Alinea `hiddenCategoryIds` con filas compartidas en `remates` (abierto ↔ visible, cerrado ↔ oculto). */
export function applySharedRemateEstadoToHiddenCategories(
  hiddenCategoryIds: Set<string>,
  rows: Array<{ id?: string | null; estado?: string | null }>,
): void {
  for (const row of rows) {
    const id = String(row.id ?? "").trim();
    if (!id) continue;
    const estado = String(row.estado ?? "").trim().toLowerCase();
    const auctionKey = `auction:${id}`;

    if (estado === "abierto") {
      hiddenCategoryIds.delete(auctionKey);
      if (id === DEFAULT_VENTA_DIRECTA_EVENT_ID) {
        hiddenCategoryIds.delete("section:ventas-directas");
      }
      continue;
    }

    if (estado === "cerrado") {
      hiddenCategoryIds.add(auctionKey);
      if (id === DEFAULT_VENTA_DIRECTA_EVENT_ID) {
        hiddenCategoryIds.add("section:ventas-directas");
      }
    }
  }
}

const BASE_HOME_SECTION_HIDDEN_KEYS = ["section:proximos-remates", "section:ventas-directas"] as const;

function isRemateAuctionVisible(
  auction: UpcomingAuction,
  hiddenCategoryIds: Set<string>,
): boolean {
  if (resolveCommercialEventType(auction) !== "remate") return false;
  return !hiddenCategoryIds.has(`auction:${auction.id}`);
}

function isVentaDirectaAuctionVisible(
  auction: UpcomingAuction,
  hiddenCategoryIds: Set<string>,
): boolean {
  if (resolveCommercialEventType(auction) !== "venta_directa") return false;
  return !hiddenCategoryIds.has(`auction:${auction.id}`);
}

/** Si hay al menos un remate visible por subgrupo, la sección base no puede quedar oculta. */
export function reconcileVisibleRemateAuctionsSectionVisibility(
  hiddenCategoryIds: Iterable<string> | undefined,
  upcomingAuctions: UpcomingAuction[] | undefined,
): string[] {
  const hidden = new Set(hiddenCategoryIds ?? []);
  const hasVisibleRemateAuction = (upcomingAuctions ?? []).some((auction) =>
    isRemateAuctionVisible(auction, hidden),
  );
  if (hasVisibleRemateAuction) {
    hidden.delete("section:proximos-remates");
  }
  return Array.from(hidden);
}

/** Si hay venta directa visible por subgrupo, la sección base no puede quedar oculta. */
export function reconcileVisibleVentaDirectaAuctionsSectionVisibility(
  hiddenCategoryIds: Iterable<string> | undefined,
  upcomingAuctions: UpcomingAuction[] | undefined,
): string[] {
  const hidden = new Set(hiddenCategoryIds ?? []);
  const hasVisibleVentaDirectaAuction = (upcomingAuctions ?? []).some((auction) =>
    isVentaDirectaAuctionVisible(auction, hidden),
  );
  if (hasVisibleVentaDirectaAuction) {
    hidden.delete("section:ventas-directas");
    hidden.delete(`auction:${DEFAULT_VENTA_DIRECTA_EVENT_ID}`);
  }
  return Array.from(hidden);
}

/** Alinea visibilidad de secciones base con subgrupos comerciales visibles. */
export function reconcileVisibleCommercialSectionVisibility(
  hiddenCategoryIds: Iterable<string> | undefined,
  upcomingAuctions: UpcomingAuction[] | undefined,
): string[] {
  const afterRemates = reconcileVisibleRemateAuctionsSectionVisibility(
    hiddenCategoryIds,
    upcomingAuctions,
  );
  return reconcileVisibleVentaDirectaAuctionsSectionVisibility(afterRemates, upcomingAuctions);
}

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

/** Tras guardar, conserva asignaciones que el editor acaba de enviar aunque el merge aún no las refleje. */
export function mergeEditorConfigAfterServerPersist(
  editorSent: EditorConfig,
  serverReturned: EditorConfig,
): EditorConfig {
  const preserved = preserveEditorBaseSectionVisibility(editorSent, serverReturned);
  const sentAssignments = editorSent.vehicleUpcomingAuctionIds ?? {};
  const mergedAssignments = { ...(preserved.vehicleUpcomingAuctionIds ?? {}) };

  for (const [vehicleKey, auctionId] of Object.entries(sentAssignments)) {
    if (auctionId) mergedAssignments[vehicleKey] = auctionId;
  }

  const proxSet = new Set(preserved.sectionVehicleIds?.["proximos-remates"] ?? []);
  const vdSet = new Set(preserved.sectionVehicleIds?.["ventas-directas"] ?? []);

  for (const [vehicleKey, auctionId] of Object.entries(sentAssignments)) {
    if (!auctionId) continue;
    proxSet.delete(vehicleKey);
    vdSet.delete(vehicleKey);
    const auction = preserved.upcomingAuctions?.find((entry) => entry.id === auctionId);
    const eventType = resolveCommercialEventType(
      auction ?? { id: auctionId, name: "", eventType: undefined },
    );
    if (eventType === "venta_directa") vdSet.add(vehicleKey);
    else proxSet.add(vehicleKey);
  }

  for (const key of editorSent.sectionVehicleIds?.["proximos-remates"] ?? []) proxSet.add(key);
  for (const key of editorSent.sectionVehicleIds?.["ventas-directas"] ?? []) vdSet.add(key);

  return {
    ...preserved,
    vehicleUpcomingAuctionIds: mergedAssignments,
    sectionVehicleIds: {
      ...preserved.sectionVehicleIds,
      "proximos-remates": Array.from(proxSet),
      "ventas-directas": Array.from(vdSet),
    },
  };
}
