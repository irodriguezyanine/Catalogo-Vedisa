import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/admin-session";
import { mergeSharedEventsIntoConfig } from "@/lib/catalog-shared-merge";
import { preserveEditorBaseSectionVisibility } from "@/lib/catalog-shared-constants";
import { buildCatalogSharedSyncStatus } from "@/lib/catalog-shared-sync-status";
import { getEditorConfig } from "@/lib/editor-config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Estado liviano de sincronización Tasaciones ↔ Catálogo para el panel admin. */
export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const session = verifyAdminSessionToken(token);
  if (!session.valid) {
    return Response.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  const loaded = await getEditorConfig();
  const merged = await mergeSharedEventsIntoConfig(loaded.config, {
    pruneOrphanCatalogAssignments: false,
  });
  const config = preserveEditorBaseSectionVisibility(loaded.config, merged);

  return Response.json({
    ok: true,
    status: buildCatalogSharedSyncStatus(config),
    config,
  });
}
