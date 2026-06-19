import { getCachedMergedEditorConfig } from "@/lib/editor-config-cache";
import { toPublicEditorSnapshot } from "@/lib/public-editor-config";

export const dynamic = "force-dynamic";
export const revalidate = 60;

/** Config de layout/secciones para el sitio público (sin mutaciones). */
export async function GET() {
  const result = await getCachedMergedEditorConfig();
  return Response.json({
    ok: true,
    config: toPublicEditorSnapshot(result.config),
    persisted: result.persisted,
  });
}
