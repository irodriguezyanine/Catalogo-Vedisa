import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/admin-session";
import { getEditorConfig } from "@/lib/editor-config";
import { syncEditorConfigToSharedTables } from "@/lib/catalog-shared-sync";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const session = verifyAdminSessionToken(token);
  if (!session.valid || !session.email) {
    return Response.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  const loaded = await getEditorConfig();
  try {
    const sync = await syncEditorConfigToSharedTables(loaded.config);
    return Response.json({ ok: true, sync, syncOk: true, persisted: loaded.persisted });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudo reintentar la sincronización compartida.";
    return Response.json({ ok: false, error: message, syncOk: false, persisted: loaded.persisted }, { status: 500 });
  }
}
