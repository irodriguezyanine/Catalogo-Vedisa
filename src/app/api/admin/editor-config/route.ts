import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/admin-session";
import { mergeSharedEventsIntoConfig } from "@/lib/catalog-shared-merge";
import {
  deleteRemateItemsForRemovedAssignments,
  findRemovedVehicleAssignments,
  syncEditorConfigToSharedTablesWithOptions,
} from "@/lib/catalog-shared-sync";
import {
  preserveEditorBaseSectionVisibility,
  mergeEditorConfigAfterServerPersist,
} from "@/lib/catalog-shared-constants";
import { applyRemateIdMappingsToEditorConfig } from "@/lib/catalog-shared-remate-id";
import { getEditorConfig, getMergedEditorConfig, saveEditorConfig } from "@/lib/editor-config";
import { notifySharedSyncPeers } from "@/lib/catalog-shared-sync-peer-notify";
import { revalidateCatalogSurfaces } from "@/lib/revalidate-catalog";
import { toPublicEditorSnapshot } from "@/lib/public-editor-config";
import { assertProductionSecrets, validateEditorConfigPayload } from "@/lib/validate-editor-config";
import { DEFAULT_EDITOR_CONFIG, type EditorConfig } from "@/types/editor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

assertProductionSecrets();

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const session = verifyAdminSessionToken(token);
  if (!session.valid) {
    const result = await getMergedEditorConfig();
    return Response.json({
      ok: true,
      config: toPublicEditorSnapshot(result.config),
      persisted: result.persisted,
    });
  }

  const loaded = await getEditorConfig();
  const merged = await mergeSharedEventsIntoConfig(loaded.config, {
    pruneOrphanCatalogAssignments: false,
  });
  const adminConfig = preserveEditorBaseSectionVisibility(loaded.config, merged);
  return Response.json({ ok: true, config: adminConfig, persisted: loaded.persisted });
}

export async function PUT(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const session = verifyAdminSessionToken(token);
  if (!session.valid || !session.email) {
    return Response.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    config?: EditorConfig;
    deletedAuctionIds?: string[];
  };
  const config = body.config ?? DEFAULT_EDITOR_CONFIG;
  const validation = validateEditorConfigPayload(config);
  if (!validation.ok) {
    return Response.json({ ok: false, error: validation.error }, { status: 400 });
  }

  const previousLoaded = await getEditorConfig();
  const result = await saveEditorConfig(config, session.email);
  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: 400 });
  }
  const normalizedConfig = result.normalizedConfig ?? config;

  const removedAssignments = findRemovedVehicleAssignments(previousLoaded.config, normalizedConfig);
  const removalResult = await deleteRemateItemsForRemovedAssignments(removedAssignments, normalizedConfig);

  try {
    const sync = await syncEditorConfigToSharedTablesWithOptions(normalizedConfig, {
      deletedRemateIds: body.deletedAuctionIds ?? [],
    });

    const configAfterRemateMap = sync.remateIdMappings
      ? applyRemateIdMappingsToEditorConfig(normalizedConfig, sync.remateIdMappings)
      : normalizedConfig;

    const mergedFromShared = await mergeSharedEventsIntoConfig(configAfterRemateMap, {
      pruneOrphanCatalogAssignments: false,
    });
    const mergedConfig = mergeEditorConfigAfterServerPersist(
      configAfterRemateMap,
      preserveEditorBaseSectionVisibility(configAfterRemateMap, mergedFromShared),
    );

    await saveEditorConfig(mergedConfig, session.email);
    revalidateCatalogSurfaces();
    const peerNotify = await notifySharedSyncPeers("catalog@editor-config-put");
    return Response.json({
      ok: true,
      sync,
      peerNotify,
      config: mergedConfig,
      syncOk: sync.skipped.length === 0,
      removedFromRemate: removalResult.deleted,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Se guardó la configuración, pero falló la sincronización compartida.";
    return Response.json({ ok: false, error: message, config: normalizedConfig, syncOk: false }, { status: 500 });
  }
}
