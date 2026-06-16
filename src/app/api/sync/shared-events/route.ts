import { revalidateCatalogSurfaces } from "@/lib/revalidate-catalog";
import { mergeSharedEventsIntoConfig } from "@/lib/catalog-shared-merge";
import { reconcileSharedPlatforms } from "@/lib/catalog-shared-reconcile";
import { getEditorConfig } from "@/lib/editor-config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CATALOG_SYNC_WEBHOOK_SECRET?.trim();
  if (!secret) return true;
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const headerSecret = req.headers.get("x-catalog-sync-secret")?.trim();
  return bearer === secret || headerSecret === secret;
}

/**
 * Webhook/cron para réplica automática entre Tasaciones, Subastas y Catálogo.
 * TasacionesVedisa1 o Subastas pueden llamar este endpoint al publicar o cerrar eventos.
 */
export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  try {
    const result = await reconcileSharedPlatforms("webhook@shared-sync");
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

/** Vista rápida del estado fusionado sin persistir ni empujar cambios. */
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  const loaded = await getEditorConfig();
  const merged = await mergeSharedEventsIntoConfig(loaded.config);
  return Response.json({
    ok: true,
    persisted: loaded.persisted,
    upcomingAuctions: merged.upcomingAuctions?.length ?? 0,
    assignedVehicles: Object.keys(merged.vehicleUpcomingAuctionIds ?? {}).length,
    proximosRemates: merged.sectionVehicleIds["proximos-remates"]?.length ?? 0,
    ventasDirectas: merged.sectionVehicleIds["ventas-directas"]?.length ?? 0,
  });
}
