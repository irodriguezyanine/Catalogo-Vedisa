import { getCachedCatalogFeed } from "@/lib/catalog-feed-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Inventario público para refresco en tiempo real del home sin recargar la página. */
export async function GET() {
  const feed = await getCachedCatalogFeed();
  return Response.json({
    ok: true,
    items: feed.items,
    itemCount: feed.items.length,
  });
}
