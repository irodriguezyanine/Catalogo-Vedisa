import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/admin-session";
import { listRecentSharedSyncDlqEntries } from "@/lib/catalog-sync-dlq";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const session = verifyAdminSessionToken(token);
  if (!session.valid) {
    return Response.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  const entries = await listRecentSharedSyncDlqEntries(100);
  return Response.json({ ok: true, entries });
}
