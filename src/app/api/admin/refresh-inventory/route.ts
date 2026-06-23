import { revalidateCatalogSurfaces } from "@/lib/revalidate-catalog";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/admin-session";
import { appendGlo3dOnlyCatalogItems, getCatalogFeed, isGlo3dCircuitOpen } from "@/lib/catalog";
import { reconcileSharedPlatforms } from "@/lib/catalog-shared-reconcile";
import { buildCatalogSharedSyncStatus } from "@/lib/catalog-shared-sync-status";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const session = verifyAdminSessionToken(token);
  if (!session.valid || !session.email) {
    return Response.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  try {
    const feed = await getCatalogFeed();
    const items = isGlo3dCircuitOpen()
      ? feed.items
      : await appendGlo3dOnlyCatalogItems(feed.items);
    const reconcile = await reconcileSharedPlatforms(session.email);
    revalidateCatalogSurfaces();

    return Response.json({
      ok: true,
      source: feed.source,
      sync: reconcile.sync,
      syncOk: true,
      persisted: reconcile.persisted,
      config: reconcile.mergedConfig,
      syncStatus: buildCatalogSharedSyncStatus(reconcile.mergedConfig),
      itemCount: items.length,
      items,
      revalidatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo actualizar inventario y sincronizar.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
