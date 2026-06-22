import { removeVehicleFromCatalogEvent } from "@/lib/catalog-remove-vehicle-from-event";
import { buildCatalogSyncCorsHeaders, withCatalogSyncCors } from "@/lib/catalog-sync-cors";
import { revalidateCatalogSurfaces } from "@/lib/revalidate-catalog";

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

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return withCatalogSyncCors(
      req,
      Response.json({ ok: false, error: "No autorizado." }, { status: 401 }),
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    remateId?: string;
    patente?: string;
  };

  const remateId = String(body.remateId ?? "").trim();
  const patente = String(body.patente ?? "").trim();
  if (!remateId || !patente) {
    return withCatalogSyncCors(
      req,
      Response.json({ ok: false, error: "Faltan remateId o patente." }, { status: 400 }),
    );
  }

  try {
    const result = await removeVehicleFromCatalogEvent(remateId, patente);
    if (!result.ok) {
      return withCatalogSyncCors(
        req,
        Response.json({ ok: false, error: result.error ?? "No se pudo quitar del catálogo." }, { status: 500 }),
      );
    }
    revalidateCatalogSurfaces();
    return withCatalogSyncCors(
      req,
      Response.json({ ok: true, removedKeys: result.removedKeys, revalidated: true }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falló la eliminación en catálogo.";
    return withCatalogSyncCors(req, Response.json({ ok: false, error: message }, { status: 500 }));
  }
}
