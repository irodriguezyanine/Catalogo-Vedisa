import type { CatalogFeed, CatalogItem } from "@/types/catalog";

const FEED_RAW_KEEP_KEYS = [
  "patente",
  "PPU",
  "ppu",
  "stock_number",
  "marca",
  "modelo",
  "ano",
  "anio",
  "version",
  "estado_retiro",
  "estado",
  "glo3d_url",
  "url_3d",
  "visor_3d_url",
  "thumbnail",
  "imagen_principal",
  "foto_portada",
  "siniestro",
  "n_de_siniestro",
  "categoria",
  "tipo_vehiculo",
  "origen",
  "titulo",
  "nombre_vehiculo",
  "descripcion",
  "vin",
  "kilometraje",
  "color",
] as const;

export function isCatalogStaticBuildPhase(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

export function shouldSkipCatalogFeedEnrichment(): boolean {
  return isCatalogStaticBuildPhase() || process.env.CATALOG_SKIP_FEED_ENRICH === "true";
}

export function slimCatalogFeedItem(item: CatalogItem): CatalogItem {
  const raw = item.raw as Record<string, unknown>;
  const slimRaw: Record<string, unknown> = {};
  for (const key of FEED_RAW_KEEP_KEYS) {
    if (raw[key] !== undefined && raw[key] !== null) {
      slimRaw[key] = raw[key];
    }
  }
  const images = item.images.filter((url) => url.startsWith("http")).slice(0, 16);
  return {
    ...item,
    images,
    thumbnail: item.thumbnail ?? images[0],
    raw: slimRaw,
  };
}

export function slimCatalogFeed(feed: CatalogFeed): CatalogFeed {
  return {
    ...feed,
    items: feed.items.map(slimCatalogFeedItem),
  };
}
