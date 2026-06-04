import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/admin-session";
import { mergeSharedEventsIntoConfig } from "@/lib/catalog-shared-merge";
import { syncEditorConfigToSharedTablesWithOptions } from "@/lib/catalog-shared-sync";
import { getMergedEditorConfig, saveEditorConfig } from "@/lib/editor-config";
import { DEFAULT_EDITOR_CONFIG, type EditorConfig } from "@/types/editor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const result = await getMergedEditorConfig();
  return Response.json({ ok: true, config: result.config, persisted: result.persisted });
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
  const result = await saveEditorConfig(config, session.email);
  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: 400 });
  }
  const normalizedConfig = result.normalizedConfig ?? config;
  const mergedConfig = await mergeSharedEventsIntoConfig(normalizedConfig);

  try {
    await saveEditorConfig(mergedConfig, session.email);
    const sync = await syncEditorConfigToSharedTablesWithOptions(mergedConfig, {
      deletedRemateIds: body.deletedAuctionIds ?? [],
    });
    return Response.json({ ok: true, sync, config: mergedConfig, syncOk: true });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Se guardó la configuración, pero falló la sincronización compartida.";
    return Response.json({ ok: false, error: message, config: mergedConfig, syncOk: false }, { status: 500 });
  }
}
