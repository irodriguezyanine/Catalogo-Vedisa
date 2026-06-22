import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/admin-session";
import { reconcileSharedPlatforms } from "@/lib/catalog-shared-reconcile";
import { revalidateCatalogSurfaces } from "@/lib/revalidate-catalog";

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
    return Response.json({
      ok: true,
      sync: result.sync,
      syncOk: true,
      persisted: result.persisted,
      config: result.mergedConfig,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudo reintentar la sincronización compartida.";
    return Response.json({ ok: false, error: message, syncOk: false }, { status: 500 });
  }
}
