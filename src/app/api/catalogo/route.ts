import { getCatalogFeed } from "@/lib/catalog";

export const revalidate = 300;

export async function GET() {
  const feed = await getCatalogFeed();
  return Response.json(feed);
}
