import { revalidateCatalogSurfaces } from "@/lib/revalidate-catalog";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/admin-session";
import { appendGlo3dOnlyCatalogItems, getCatalogFeed, isGlo3dCircuitOpen } from "@/lib/catalog";
import { hydrateCatalogItemsWithEditorConfig } from "@/lib/catalog-feed-hydrate";
import { reconcileSharedPlatforms } from "@/lib/catalog-shared-reconcile";
import { buildCatalogSharedSyncStatus } from "@/lib/catalog-shared-sync-status";
import { fetchSharedRemateItems } from "@/lib/catalog-shared-merge";
import { DEFAULT_VENTA_DIRECTA_EVENT_ID } from "@/lib/catalog-shared-constants";

async function countSharedVentaDirectaItems(): Promise<number> {
  const rows = await fetchSharedRemateItems([DEFAULT_VENTA_DIRECTA_EVENT_ID]);
  return rows.filter((row) => String(row.remate_id ?? "") === DEFAULT_VENTA_DIRECTA_EVENT_ID).length;
}

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
    const reconcile = await reconcileSharedPlatforms(session.email);
    const baseItems = isGlo3dCircuitOpen()
      ? feed.items
      : await appendGlo3dOnlyCatalogItems(feed.items);
    const items = hydrateCatalogItemsWithEditorConfig(baseItems, reconcile.mergedConfig);
    revalidateCatalogSurfaces();
    const sharedVentaDirectaItemsCount = await countSharedVentaDirectaItems();

    return Response.json({
      ok: true,
      source: feed.source,
      sync: reconcile.sync,
      syncOk: true,
      persisted: reconcile.persisted,
      config: reconcile.mergedConfig,
      syncStatus: buildCatalogSharedSyncStatus(reconcile.mergedConfig, { sharedVentaDirectaItemsCount }),
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
