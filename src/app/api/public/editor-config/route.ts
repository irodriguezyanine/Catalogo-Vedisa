import { getMergedEditorConfig } from "@/lib/editor-config";
import { toPublicEditorSnapshot } from "@/lib/public-editor-config";

export const dynamic = "force-dynamic";
export const revalidate = 60;

/** Config de layout/secciones para el sitio público (sin mutaciones). */
export async function GET() {
  const result = await getMergedEditorConfig();
  return Response.json({
    ok: true,
    config: toPublicEditorSnapshot(result.config),
    persisted: result.persisted,
  });
}
