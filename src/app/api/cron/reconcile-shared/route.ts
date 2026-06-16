import { revalidateCatalogSurfaces } from "@/lib/revalidate-catalog";
import { reconcileSharedPlatforms } from "@/lib/catalog-shared-reconcile";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim() ?? process.env.CATALOG_SYNC_WEBHOOK_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const headerSecret =
    req.headers.get("x-cron-secret")?.trim() ?? req.headers.get("x-catalog-sync-secret")?.trim();
  return bearer === secret || headerSecret === secret;
}

/** Réplica programada entre Tasaciones, Subastas y Catálogo (misma lógica que POST /api/sync/shared-events). */
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  try {
    const result = await reconcileSharedPlatforms("cron@shared-sync");
    revalidateCatalogSurfaces();
    return Response.json({
      ok: true,
      persisted: result.persisted,
      sync: result.sync,
      upcomingAuctions: result.mergedConfig.upcomingAuctions?.length ?? 0,
      assignedVehicles: Object.keys(result.mergedConfig.vehicleUpcomingAuctionIds ?? {}).length,
      reconciledAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falló la reconciliación compartida.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
