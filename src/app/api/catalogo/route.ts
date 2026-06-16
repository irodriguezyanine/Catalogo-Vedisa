import { getCatalogFeed } from "@/lib/catalog";
import type { CatalogItem } from "@/types/catalog";

export const revalidate = 300;

function toMinimalItem(item: CatalogItem) {
  return {
    id: item.id,
    title: item.title,
    subtitle: item.subtitle,
    thumbnail: item.thumbnail,
    images: item.images,
    view3dUrl: item.view3dUrl,
    lot: item.lot,
    status: item.status,
    location: item.location,
    auctionDate: item.auctionDate,
    enBodega: item.enBodega,
    raw: {
      patente: (item.raw as Record<string, unknown>).patente,
      marca: (item.raw as Record<string, unknown>).marca,
      modelo: (item.raw as Record<string, unknown>).modelo,
      ano: (item.raw as Record<string, unknown>).ano,
      precio: (item.raw as Record<string, unknown>).precio,
      estado_retiro: (item.raw as Record<string, unknown>).estado_retiro,
    },
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const minimal = url.searchParams.get("fields") === "minimal";
  const feed = await getCatalogFeed();
  if (!minimal) return Response.json(feed);
  return Response.json({
    ...feed,
    items: feed.items.map(toMinimalItem),
  });
}
