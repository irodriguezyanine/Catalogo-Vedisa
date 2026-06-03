import type { VehicleCommercialEventBadge } from "@/components/catalog-card";
import type { CatalogFeed, CatalogItem } from "@/types/catalog";
import type { EditorConfig, EditorVehicleDetails, ManualPublication, UpcomingAuction } from "@/types/editor";

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

function parseImagesCsv(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith("http"));
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

function applyDetailsOverride(item: CatalogItem, override?: EditorVehicleDetails): CatalogItem {
  if (!override) return item;
  const images = parseImagesCsv(override.imagesCsv);
  return {
    ...item,
    title: override.title ?? item.title,
    subtitle: override.subtitle ?? item.subtitle,
    status: override.status ?? item.status,
    location: override.location ?? item.location,
    lot: override.lot ?? item.lot,
    auctionDate: override.auctionDate ?? item.auctionDate,
    thumbnail: override.thumbnail ?? item.thumbnail,
    view3dUrl: override.view3dUrl ?? item.view3dUrl,
    images: images.length > 0 ? images : item.images,
    raw: {
      ...item.raw,
      ...(override.patente ? { patente: override.patente, PPU: override.patente } : {}),
      ...(override.nSiniestro
        ? {
            n_de_siniestro: override.nSiniestro,
            numero_siniestro: override.nSiniestro,
            n_s: override.nSiniestro,
            ns: override.nSiniestro,
          }
        : {}),
      ...(override.description ? { descripcion: override.description, description: override.description } : {}),
      ...(override.brand ? { marca: override.brand, brand: override.brand } : {}),
      ...(override.model ? { modelo: override.model, model: override.model } : {}),
      ...(override.year ? { ano: override.year, anio: override.year, year: override.year } : {}),
    },
  };
}

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

function extractEstadoRetiro(item: CatalogItem): string {
  const raw = item.raw as Record<string, unknown>;
  const candidate =
    raw.estado_retiro ??
    raw.estadoRetiro ??
    raw.estado_remate ??
    raw.estado ??
    "";
  return String(candidate).trim().toLowerCase();
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

  const estadoRetiro = extractEstadoRetiro(item);
  if (estadoRetiro === "en_bodega_a_venta_directa") {
    return { kind: "venta_directa", label: "Venta directa" };
  }
  if (estadoRetiro === "en_bodega_a_remate") {
    return { kind: "remate", label: "Remate" };
  }
  return null;
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

  const items = [...feed.items, ...manualItems].map((item) =>
    applyDetailsOverride(item, getEditorOverrideForItem(item, config.vehicleDetails)),
  );

  return items.filter((item) => {
    const key = getVehicleKey(item);
    return !soldSet.has(key) && !mergedHidden.has(key);
  });
}
