import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/admin-session";
import { diagnosePatentSync } from "@/lib/catalog-patent-diagnose";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const session = verifyAdminSessionToken(token);
  if (!session.valid || !session.email) {
    return Response.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const patente = String(searchParams.get("patente") ?? "").trim();
  if (!patente) {
    return Response.json({ ok: false, error: "Indica ?patente=TSTZ49" }, { status: 400 });
  }

  try {
    const diagnosis = await diagnosePatentSync(patente);
    return Response.json({ ok: true, diagnosis });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "No se pudo diagnosticar la patente.",
      },
      { status: 500 },
    );
  }
}
