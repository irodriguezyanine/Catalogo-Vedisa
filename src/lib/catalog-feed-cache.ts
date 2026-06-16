import { unstable_cache } from "next/cache";
import { getCatalogFeed } from "@/lib/catalog";
import type { CatalogFeed } from "@/types/catalog";

export const CATALOG_FEED_CACHE_TAG = "catalog-feed";

/**
 * Feed cacheado para páginas públicas. Invalidar con revalidateTag(CATALOG_FEED_CACHE_TAG)
 * — ya se hace desde import/sync/refresh sin cambiar contratos de API.
 */
export const getCachedCatalogFeed = unstable_cache(
  async (): Promise<CatalogFeed> => getCatalogFeed(),
  ["catalog-feed-v1"],
  { revalidate: 120, tags: [CATALOG_FEED_CACHE_TAG] },
);
