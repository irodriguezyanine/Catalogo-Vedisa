import { handleCatalogSyncEvent } from "@/lib/catalog-sync-event-handler";
import { buildCatalogSyncCorsHeaders, withCatalogSyncCors } from "@/lib/catalog-sync-cors";
import type { CatalogSyncEvent } from "@/types/catalog-sync-contract";

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

/** Endpoint idempotente unificado: reconcile | remove-vehicle | visibility-changed */
export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return withCatalogSyncCors(
      req,
      Response.json({ ok: false, error: "No autorizado." }, { status: 401 }),
    );
  }

  const body = (await req.json().catch(() => ({}))) as CatalogSyncEvent & {
    source?: string;
  };
  const eventType = String(body.type ?? "").trim() as CatalogSyncEvent["type"];

  if (!eventType) {
    return withCatalogSyncCors(
      req,
      Response.json({ ok: false, error: "Falta type en el evento." }, { status: 400 }),
    );
  }

  const result = await handleCatalogSyncEvent(
    { ...body, type: eventType },
    body.source ?? "webhook@sync-event",
  );

  return withCatalogSyncCors(
    req,
    Response.json(result, { status: result.ok ? 200 : 500 }),
  );
}
