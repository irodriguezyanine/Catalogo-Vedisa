import { getCatalogFeed } from "@/lib/catalog";
import type { CatalogFeed } from "@/types/catalog";

export const CATALOG_FEED_CACHE_TAG = "catalog-feed";

/**
 * Feed público sin unstable_cache: el inventario completo con glo3d_campos supera el
 * límite de 2MB de Next.js data cache. La revalidación la manejan las páginas (revalidate)
 * y revalidateTag(CATALOG_FEED_CACHE_TAG) tras import/sync.
 */
export async function getCachedCatalogFeed(): Promise<CatalogFeed> {
  return getCatalogFeed();
}
