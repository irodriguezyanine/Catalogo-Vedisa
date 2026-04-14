import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE_NAME, createAdminSessionToken, getAdminCredentials } from "@/lib/admin-session";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";

  const adminCredentials = getAdminCredentials();
  if (email !== adminCredentials.email.toLowerCase() || password !== adminCredentials.password) {
    return Response.json({ ok: false, error: "Credenciales inválidas." }, { status: 401 });
  }

  const token = createAdminSessionToken(adminCredentials.email);
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  return Response.json({ ok: true });
}
