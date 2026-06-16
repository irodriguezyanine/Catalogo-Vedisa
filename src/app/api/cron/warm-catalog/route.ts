import { revalidateCatalogSurfaces } from "@/lib/revalidate-catalog";
import { getCatalogFeed } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const headerSecret = req.headers.get("x-cron-secret")?.trim();
  return bearer === secret || headerSecret === secret;
}

/** Precalienta feed + enriquecimiento Glo3D selectivo (Vercel Cron / manual). */
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  try {
    const feed = await getCatalogFeed();
    revalidateCatalogSurfaces();
    return Response.json({
      ok: true,
      source: feed.source,
      itemCount: feed.items.length,
      warmedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo precalentar el catálogo.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
