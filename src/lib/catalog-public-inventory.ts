import type { VehicleCommercialEventBadge } from "@/components/catalog-card";
import type { CatalogFeed, CatalogItem } from "@/types/catalog";
import type { EditorConfig, EditorVehicleDetails, ManualPublication, UpcomingAuction } from "@/types/editor";
import { applyCatalogDetailsOverride } from "@/lib/catalog-details-override";
import { resolveCommercialEventType } from "@/lib/catalog-shared-constants";
import {
  extractEstadoRetiro,
  isCatalogPublishedVehicle,
} from "@/lib/catalog-publication-rules";

type CommercialEventType = "remate" | "venta_directa";

function detectCommercialEventType(value?: string | null): CommercialEventType {
  const normalized = String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
  if (
    normalized.includes("ventadirecta") ||
    normalized.includes("vtadirecta") ||
    normalized.includes("vtdirecta") ||
    normalized.includes("ventadir")
  ) {
    return "venta_directa";
  }
  return "remate";
}

function sanitizeAuctionTitle(value?: string | null): string {
  const raw = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return "Sin título";
  return raw;
}

function getAuctionEventType(auction: UpcomingAuction): CommercialEventType {
  if (auction.eventType === "venta_directa" || auction.eventType === "remate") {
    return auction.eventType;
  }
  return detectCommercialEventType(auction.name);
}

function formatAuctionDateLabel(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatAuctionWindowLabel(auction: UpcomingAuction): string {
  const inicio = auction.startAt ? new Date(auction.startAt) : null;
  const cierre = auction.endAt ? new Date(auction.endAt) : null;
  if (inicio && cierre && !Number.isNaN(inicio.getTime()) && !Number.isNaN(cierre.getTime())) {
    const ini = inicio.toLocaleString("es-CL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const fin = cierre.toLocaleString("es-CL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return `${ini} → ${fin}`;
  }
  return formatAuctionDateLabel(auction.date);
}

export function getVehicleKey(item: CatalogItem): string {
  const raw = item.raw as Record<string, unknown>;
  const patent = [raw.patente, raw.PATENTE, raw.PPU, raw.stock_number].find(
    (value) => typeof value === "string" && value.trim().length > 0,
  ) as string | undefined;
  if (patent) return patent.toUpperCase().replace(/\s+/g, "").replace(/-/g, "");
  return item.id;
}

export function getPatent(item: CatalogItem): string {
  const raw = item.raw as Record<string, unknown>;
  const patent = [raw.patente, raw.PATENTE, raw.PPU, raw.stock_number].find(
    (value) => typeof value === "string" && value.trim().length > 0,
  ) as string | undefined;
  return patent?.toUpperCase().replace(/\s+/g, "").replace(/-/g, "") ?? "—";
}

function pickFirstPriceValue(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return String(Math.round(value));
    }
    if (typeof value === "string") {
      const sample = value.trim();
      if (sample && /\d/.test(sample)) return sample;
    }
  }
  return null;
}

export function formatPrice(value?: string): string | null {
  if (!value?.trim()) return null;
  const sample = value.trim();
  const clean = sample.replace(/[^\d]/g, "");
  if (!clean) return null;
  const amount = Number(clean);
  if (!Number.isFinite(amount)) return null;
  const hasIva = /\biva\b/i.test(sample) && !/sin\s*iva/i.test(sample);
  const base = new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(amount);
  return hasIva ? `${base} + IVA` : base;
}

export function resolveVehiclePriceRaw(
  item: CatalogItem,
  priceMap: Record<string, string>,
): string | null {
  const key = getVehicleKey(item);
  const configured = priceMap[key];
  if (typeof configured === "string" && configured.trim()) {
    return configured.trim();
  }
  const raw = item.raw as Record<string, unknown>;
  return pickFirstPriceValue([
    raw.precio_minimo_remate,
    raw.precioMinimoRemate,
    raw.precio_minimo,
    raw.precioMinimo,
    raw.valor_minimo,
    raw.valorMinimo,
    raw.precio_base,
    raw.precioBase,
    raw.base_price,
    raw.reference_price,
    raw.precio,
    raw.monto,
  ]);
}

function getEditorOverrideForItem(
  item: CatalogItem,
  vehicleDetails: Record<string, EditorVehicleDetails>,
): EditorVehicleDetails | undefined {
  const fromId = vehicleDetails[item.id];
  const raw = item.raw as Record<string, unknown>;
  const rawPatente = [raw.patente, raw.PATENTE, raw.PPU, raw.stock_number].find(
    (v) => typeof v === "string" && v.trim(),
  ) as string | undefined;
  const patentKey = rawPatente
    ? rawPatente.toUpperCase().replace(/\s+/g, "").replace(/-/g, "")
    : fromId?.patente?.trim()
      ? fromId.patente.toUpperCase().replace(/\s+/g, "").replace(/-/g, "")
      : "";
  const fromPatentKey = patentKey ? vehicleDetails[patentKey] : undefined;
  if (fromId && fromPatentKey) return { ...fromId, ...fromPatentKey };
  return fromPatentKey ?? fromId;
}

export { getEditorOverrideForItem };

function mapManualPublicationToCatalogItem(entry: ManualPublication): CatalogItem {
  const images = (entry.images ?? []).filter((url) => url.startsWith("http"));
  const thumbnail = entry.thumbnail ?? images[0];
  return {
    id: `manual-${entry.id}`,
    title: entry.title,
    subtitle: entry.subtitle,
    status: entry.status,
    location: entry.location,
    lot: entry.lot,
    auctionDate: entry.auctionDate,
    images,
    thumbnail,
    view3dUrl: entry.view3dUrl,
    raw: {
      source: "manual",
      patente: entry.patente,
      marca: entry.brand,
      modelo: entry.model,
      ano: entry.year,
      categoria: entry.category,
      descripcion: entry.description,
      precio_normal: entry.originalPrice ?? entry.price,
      precio_promocional: entry.promoPrice ?? (entry.promoEnabled ? entry.price : undefined),
      promo_enabled: entry.promoEnabled ?? false,
      manual_id: entry.id,
    },
  };
}

function extractEstadoRetiroFromItem(item: CatalogItem): string {
  return extractEstadoRetiro(item);
}

export function buildCommercialEventByVehicleKey(
  config: EditorConfig,
): Record<string, VehicleCommercialEventBadge> {
  const labels: Record<string, VehicleCommercialEventBadge> = {};
  const auctionsById = new Map(
    (config.upcomingAuctions ?? []).map((auction) => [auction.id, auction] as const),
  );
  for (const [vehicleKey, auctionId] of Object.entries(config.vehicleUpcomingAuctionIds ?? {})) {
    const auction = auctionsById.get(auctionId);
    if (!auction) continue;
    const eventType = getAuctionEventType(auction);
    if (eventType === "venta_directa") {
      labels[vehicleKey] = { kind: "venta_directa", label: "Venta directa" };
      continue;
    }
    const dateLabel = formatAuctionWindowLabel(auction);
    const name = sanitizeAuctionTitle(auction.name);
    labels[vehicleKey] = {
      kind: "remate",
      label: dateLabel ? `${name} · ${dateLabel}` : name,
    };
  }
  return labels;
}

export function resolveCommercialEventBadge(
  item: CatalogItem,
  config: EditorConfig,
  assignedBadges: Record<string, VehicleCommercialEventBadge>,
): VehicleCommercialEventBadge | null {
  const key = getVehicleKey(item);
  if (assignedBadges[key]) return assignedBadges[key];

  return null;
}

export type VehicleListCommercialFilter = "all" | "remate" | "venta_directa";

function normalizePatenteKey(value?: string | null): string {
  return String(value ?? "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "");
}

function buildCatalogItemFromEditorAssignment(
  vehicleKey: string,
  details: EditorVehicleDetails | undefined,
  auctionId: string,
  config: EditorConfig,
): CatalogItem | null {
  const patenteFromKey = /^[A-Z0-9]{5,10}$/.test(vehicleKey)
    ? normalizePatenteKey(vehicleKey)
    : "";
  const patente = normalizePatenteKey(details?.patente) || patenteFromKey;
  if (!patente) return null;

  const auctionsById = new Map((config.upcomingAuctions ?? []).map((auction) => [auction.id, auction]));
  const auction = auctionsById.get(auctionId);
  const estadoRetiro =
    auction && resolveCommercialEventType(auction) === "venta_directa"
      ? "en_bodega_a_venta_directa"
      : "en_bodega_a_remate";

  const images = (details?.imagesCsv ?? "")
    .split(/[\n,;|]+/)
    .map((part) => part.trim())
    .filter((url) => url.startsWith("http"));
  const title =
    details?.title?.trim() ||
    [details?.brand, details?.model].filter(Boolean).join(" ").trim() ||
    `Unidad ${patente}`;

  return {
    id: vehicleKey,
    title,
    subtitle: patente,
    images,
    thumbnail: details?.thumbnail?.startsWith("http") ? details.thumbnail : images[0],
    view3dUrl: details?.view3dUrl,
    raw: {
      patente,
      PATENTE: patente,
      PPU: patente,
      stock_number: patente,
      marca: details?.brand,
      modelo: details?.model,
      descripcion: details?.description,
      source: "editor_assignment_public",
      estado_retiro: estadoRetiro,
    },
  };
}

/** Incluye patentes asignadas a remates/VD que aún no están en el feed compartido. */
function mergeAssignedEditorPlaceholders(
  items: CatalogItem[],
  config: EditorConfig,
): CatalogItem[] {
  const seenPatentes = new Set<string>();
  const seenKeys = new Set<string>();
  for (const item of items) {
    seenKeys.add(getVehicleKey(item));
    seenKeys.add(item.id);
    const patente = getPatent(item);
    if (patente !== "—") seenPatentes.add(patente);
  }

  const placeholders: CatalogItem[] = [];
  for (const [vehicleKey, auctionId] of Object.entries(config.vehicleUpcomingAuctionIds ?? {})) {
    if (!auctionId?.trim()) continue;
    if (seenKeys.has(vehicleKey)) continue;

    const patenteHint = normalizePatenteKey(vehicleKey);
    const details =
      config.vehicleDetails?.[vehicleKey] ??
      (patenteHint ? config.vehicleDetails?.[patenteHint] : undefined);
    const placeholder = buildCatalogItemFromEditorAssignment(
      vehicleKey,
      details,
      auctionId,
      config,
    );
    if (!placeholder) continue;

    const patente = getPatent(placeholder);
    if (patente !== "—" && seenPatentes.has(patente)) continue;

    placeholders.push(placeholder);
    seenKeys.add(vehicleKey);
    seenKeys.add(getVehicleKey(placeholder));
    if (patente !== "—") seenPatentes.add(patente);
  }

  return placeholders.length > 0 ? [...items, ...placeholders] : items;
}

export function getVehicleAssignedAuctionId(item: CatalogItem, config: EditorConfig): string | null {
  const key = getVehicleKey(item);
  const fromKey = config.vehicleUpcomingAuctionIds?.[key]?.trim();
  if (fromKey) return fromKey;
  const fromId = config.vehicleUpcomingAuctionIds?.[item.id]?.trim();
  if (fromId) return fromId;
  const patente = getPatent(item);
  if (patente !== "—") {
    const fromPatente = config.vehicleUpcomingAuctionIds?.[patente]?.trim();
    if (fromPatente) return fromPatente;
  }
  return null;
}

export function getFilterableAuctionGroups(config: EditorConfig): {
  remates: UpcomingAuction[];
  ventasDirectas: UpcomingAuction[];
} {
  const remates: UpcomingAuction[] = [];
  const ventasDirectas: UpcomingAuction[] = [];
  for (const auction of config.upcomingAuctions ?? []) {
    if (!auction?.id) continue;
    if (resolveCommercialEventType(auction) === "venta_directa") {
      ventasDirectas.push(auction);
    } else {
      remates.push(auction);
    }
  }
  return { remates, ventasDirectas };
}

export function matchesVehicleListCommercialFilter(
  item: CatalogItem,
  config: EditorConfig,
  options: { tipo: VehicleListCommercialFilter; eventoId: string | null },
): boolean {
  const auctionId = getVehicleAssignedAuctionId(item, config);
  if (options.eventoId) return auctionId === options.eventoId;
  if (options.tipo === "all") return true;
  if (!auctionId) return false;
  const auctionsById = new Map((config.upcomingAuctions ?? []).map((auction) => [auction.id, auction]));
  const auction = auctionsById.get(auctionId);
  if (!auction) return false;
  return resolveCommercialEventType(auction) === options.tipo;
}

export function getVisibleCatalogItems(feed: CatalogFeed, config: EditorConfig): CatalogItem[] {
  const manualItems = (config.manualPublications ?? []).map(mapManualPublicationToCatalogItem);
  const mergedHidden = new Set(config.hiddenVehicleIds ?? []);
  for (const soldVehicleId of config.soldVehicleIds ?? []) {
    mergedHidden.add(soldVehicleId);
  }
  for (const manual of config.manualPublications ?? []) {
    if (!manual.visible) mergedHidden.add(`manual-${manual.id}`);
  }
  const soldSet = new Set(config.soldVehicleIds ?? []);

  const items = mergeAssignedEditorPlaceholders(
    [...feed.items, ...manualItems].map((item) =>
      applyCatalogDetailsOverride(item, getEditorOverrideForItem(item, config.vehicleDetails)),
    ),
    config,
  );

  return items.filter((item) => {
    const key = getVehicleKey(item);
    if (soldSet.has(key) || mergedHidden.has(key)) return false;
    return isCatalogPublishedVehicle(item, config);
  });
}
