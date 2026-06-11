import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/admin-session";
import { getCatalogFeed } from "@/lib/catalog";
import { reconcileSharedPlatforms } from "@/lib/catalog-shared-reconcile";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const session = verifyAdminSessionToken(token);
  if (!session.valid || !session.email) {
    return Response.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  try {
    const feed = await getCatalogFeed();
    const reconcile = await reconcileSharedPlatforms(session.email);
    revalidatePath("/");
    revalidatePath("/api/catalogo");

    return Response.json({
      ok: true,
      source: feed.source,
      itemCount: feed.items.length,
      items: feed.items,
      sync: reconcile.sync,
      revalidatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo actualizar inventario y sincronizar.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
