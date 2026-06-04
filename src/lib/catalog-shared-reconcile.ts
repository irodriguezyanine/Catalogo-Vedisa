import { syncEditorConfigToSharedTablesWithOptions } from "@/lib/catalog-shared-sync";
import { mergeSharedEventsIntoConfig } from "@/lib/catalog-shared-merge";
import { getEditorConfig, saveEditorConfig } from "@/lib/editor-config";
import type { EditorConfig } from "@/types/editor";

export type SharedPlatformsReconcileResult = {
  mergedConfig: EditorConfig;
  persisted: boolean;
  sync: Awaited<ReturnType<typeof syncEditorConfigToSharedTablesWithOptions>>;
};

/**
 * Réplica bidireccional entre Catálogo, Subastas y Tasaciones:
 * 1) Lee remates/items compartidos y los fusiona en la config del catálogo.
 * 2) Persiste la config fusionada.
 * 3) Empuja la config fusionada a remates, remates_items e inventario compartidos.
 */
export async function reconcileSharedPlatforms(
  updatedBy = "sync@catalogo.vedisa",
): Promise<SharedPlatformsReconcileResult> {
  const loaded = await getEditorConfig();
  const mergedConfig = await mergeSharedEventsIntoConfig(loaded.config);
  const saved = await saveEditorConfig(mergedConfig, updatedBy);
  if (!saved.ok) {
    throw new Error(saved.error ?? "No se pudo persistir la configuración fusionada.");
  }
  const sync = await syncEditorConfigToSharedTablesWithOptions(mergedConfig, {});
  return {
    mergedConfig,
    persisted: saved.ok,
    sync,
  };
}
