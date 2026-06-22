import { handleCatalogSyncEvent } from "@/lib/catalog-sync-event-handler";
import { mergeSharedEventsIntoConfig } from "@/lib/catalog-shared-merge";
import { getEditorConfig } from "@/lib/editor-config";
import { buildCatalogSyncCorsHeaders, withCatalogSyncCors } from "@/lib/catalog-sync-cors";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CATALOG_SYNC_WEBHOOK_SECRET?.trim();
  if (!secret) return true;
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const headerSecret = req.headers.get("x-catalog-sync-secret")?.trim();
  return bearer === secret || headerSecret === secret;
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: buildCatalogSyncCorsHeaders(req) });
}

/**
 * Webhook/cron para réplica automática entre Tasaciones, Subastas y Catálogo.
 * TasacionesVedisa1 o Subastas pueden llamar este endpoint al publicar o cerrar eventos.
 */
export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return withCatalogSyncCors(
      req,
      Response.json({ ok: false, error: "No autorizado." }, { status: 401 }),
    );
  }

  try {
    const result = await handleCatalogSyncEvent(
      { type: "reconcile", source: "webhook@shared-events" },
      "webhook@shared-sync",
    );
    return withCatalogSyncCors(
      req,
      Response.json({
        ok: result.ok,
        error: result.error,
        revalidated: result.revalidated,
        configVersion: result.configVersion,
        details: result.details,
        reconciledAt: new Date().toISOString(),
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falló la reconciliación compartida.";
    return withCatalogSyncCors(req, Response.json({ ok: false, error: message }, { status: 500 }));
  }
}

/** Vista rápida del estado fusionado sin persistir ni empujar cambios. */
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return withCatalogSyncCors(
      req,
      Response.json({ ok: false, error: "No autorizado." }, { status: 401 }),
    );
  }

  const loaded = await getEditorConfig();
  const merged = await mergeSharedEventsIntoConfig(loaded.config);
  return withCatalogSyncCors(
    req,
    Response.json({
      ok: true,
      persisted: loaded.persisted,
      upcomingAuctions: merged.upcomingAuctions?.length ?? 0,
      assignedVehicles: Object.keys(merged.vehicleUpcomingAuctionIds ?? {}).length,
      proximosRemates: merged.sectionVehicleIds["proximos-remates"]?.length ?? 0,
      ventasDirectas: merged.sectionVehicleIds["ventas-directas"]?.length ?? 0,
    }),
  );
}
