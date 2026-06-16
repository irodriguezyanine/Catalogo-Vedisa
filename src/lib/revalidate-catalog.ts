import { revalidatePath, revalidateTag } from "next/cache";
import { CATALOG_FEED_CACHE_TAG } from "@/lib/catalog-feed-cache";

/** Invalida caché del catálogo sin alterar sync compartido. */
export function revalidateCatalogSurfaces(): void {
  revalidateTag(CATALOG_FEED_CACHE_TAG, "max");
  revalidatePath("/");
  revalidatePath("/vehiculos");
  revalidatePath("/api/catalogo");
}
