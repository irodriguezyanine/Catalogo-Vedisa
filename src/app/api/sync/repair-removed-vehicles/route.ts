import { revalidateCatalogSurfaces } from "@/lib/revalidate-catalog";
import { removeVehicleFromCatalogEvent } from "@/lib/catalog-remove-vehicle-from-event";
import { buildCatalogSyncCorsHeaders, withCatalogSyncCors } from "@/lib/catalog-sync-cors";
import { revertInventarioTrasQuitarDeRemate } from "@/lib/catalog-inventory-remate-sync";

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

/** Repara visibilidad pública de patentes eliminadas del remate en Tasaciones. */
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
    patentes?: string[];
  };

  const remateId = String(body.remateId ?? "").trim();
  const patentes = [
    ...new Set(
      [body.patente, ...(body.patentes ?? [])]
        .map((value) => String(value ?? "").trim().toUpperCase().replace(/\s+/g, "").replace(/-/g, ""))
        .filter(Boolean),
    ),
  ];

  if (!remateId || patentes.length === 0) {
    return withCatalogSyncCors(
      req,
      Response.json({ ok: false, error: "Faltan remateId o patentes." }, { status: 400 }),
    );
  }

  try {
    const results: Array<{ patente: string; ok: boolean; removedKeys: string[] }> = [];
    for (const patente of patentes) {
      const removed = await removeVehicleFromCatalogEvent(remateId, patente);
      await revertInventarioTrasQuitarDeRemate(patente);
      results.push({ patente, ok: removed.ok, removedKeys: removed.removedKeys });
    }
    revalidateCatalogSurfaces();
    return withCatalogSyncCors(req, Response.json({ ok: true, results, revalidated: true }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falló la reparación en catálogo.";
    return withCatalogSyncCors(req, Response.json({ ok: false, error: message }, { status: 500 }));
  }
}
