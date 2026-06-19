import { unstable_cache } from "next/cache";
import { getMergedEditorConfig, type EditorConfigLoadResult } from "@/lib/editor-config";

export const EDITOR_CONFIG_CACHE_TAG = "catalog-editor-config";

/**
 * Config del editor cacheada para páginas públicas.
 * Misma función getMergedEditorConfig(); se invalida con revalidateCatalogSurfaces().
 */
export const getCachedMergedEditorConfig = unstable_cache(
  async (): Promise<EditorConfigLoadResult> => getMergedEditorConfig(),
  ["catalog-editor-config-v1"],
  { revalidate: 120, tags: [EDITOR_CONFIG_CACHE_TAG] },
);
