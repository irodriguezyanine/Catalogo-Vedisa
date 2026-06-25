import { cookies } from "next/headers";
import { revalidateCatalogSurfaces } from "@/lib/revalidate-catalog";
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/admin-session";
import { persistVehicleSyncSnapshot } from "@/lib/catalog-editor-vehicle-persist";
import type { EditorVehicleDetails } from "@/types/editor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const session = verifyAdminSessionToken(token);
  if (!session.valid || !session.email) {
    return Response.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    patente?: string;
    vehicleKey?: string;
    itemId?: string;
    vehicleDetails?: EditorVehicleDetails;
  };

  const patente = String(body.patente ?? body.vehicleDetails?.patente ?? "").trim();
  if (!patente) {
    return Response.json({ ok: false, error: "Patente requerida." }, { status: 400 });
  }
  if (!body.vehicleDetails || typeof body.vehicleDetails !== "object") {
    return Response.json({ ok: false, error: "vehicleDetails requerido." }, { status: 400 });
  }

  const result = await persistVehicleSyncSnapshot({
    patente,
    vehicleDetails: body.vehicleDetails,
    vehicleKey: body.vehicleKey,
    itemId: body.itemId,
    updatedBy: session.email,
  });

  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: 500 });
  }

  revalidateCatalogSurfaces();
  return Response.json({
    ok: true,
    persistedAt: result.persistedAt,
    inventarioUpdated: result.inventarioUpdated,
  });
}
