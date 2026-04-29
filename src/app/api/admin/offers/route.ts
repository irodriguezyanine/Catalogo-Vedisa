import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/admin-session";
import { deleteVehicleOfferById, readVehicleOffers } from "@/lib/offers";

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const session = verifyAdminSessionToken(token);
  if (!session.valid || !session.email) {
    return Response.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") ?? "5000");
  const result = await readVehicleOffers({ limit });
  if (!result.ok) {
    return Response.json({ ok: false, error: result.error, offers: [] }, { status: 400 });
  }

  return Response.json({ ok: true, offers: result.offers });
}

type DeleteOfferRequest = {
  id?: string;
};

export async function DELETE(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const session = verifyAdminSessionToken(token);
  if (!session.valid || !session.email) {
    return Response.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as DeleteOfferRequest;
  const id = String(body.id ?? "").trim();
  if (!id) {
    return Response.json({ ok: false, error: "ID de oferta inválido." }, { status: 400 });
  }

  const result = await deleteVehicleOfferById(id);
  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: 400 });
  }

  return Response.json({ ok: true });
}
