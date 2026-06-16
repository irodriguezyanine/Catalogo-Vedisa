import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/admin-session";
import { revalidateCatalogSurfaces } from "@/lib/revalidate-catalog";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const session = verifyAdminSessionToken(token);

  if (!session.valid) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  revalidateCatalogSurfaces();

  return Response.json({ ok: true, revalidatedAt: new Date().toISOString() });
}
