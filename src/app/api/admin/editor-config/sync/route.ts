import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/admin-session";
import { reconcileSharedPlatforms } from "@/lib/catalog-shared-reconcile";
import { buildCatalogSharedSyncStatus } from "@/lib/catalog-shared-sync-status";
import { fetchSharedRemateItems } from "@/lib/catalog-shared-merge";
import { DEFAULT_VENTA_DIRECTA_EVENT_ID } from "@/lib/catalog-shared-constants";
import { revalidateCatalogSurfaces } from "@/lib/revalidate-catalog";

async function countSharedVentaDirectaItems(): Promise<number> {
  const rows = await fetchSharedRemateItems([DEFAULT_VENTA_DIRECTA_EVENT_ID]);
  return rows.filter((row) => String(row.remate_id ?? "") === DEFAULT_VENTA_DIRECTA_EVENT_ID).length;
}

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const session = verifyAdminSessionToken(token);
  if (!session.valid || !session.email) {
    return Response.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  try {
    const result = await reconcileSharedPlatforms(session.email ?? "admin@catalogo");
    revalidateCatalogSurfaces();
    const sharedVentaDirectaItemsCount = await countSharedVentaDirectaItems();
    return Response.json({
      ok: true,
      sync: result.sync,
      syncOk: true,
      persisted: result.persisted,
      config: result.mergedConfig,
      syncStatus: buildCatalogSharedSyncStatus(result.mergedConfig, { sharedVentaDirectaItemsCount }),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudo reintentar la sincronización compartida.";
    return Response.json({ ok: false, error: message, syncOk: false }, { status: 500 });
  }
}
