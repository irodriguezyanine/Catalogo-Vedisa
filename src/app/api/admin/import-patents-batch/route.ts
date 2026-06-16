import { revalidateCatalogSurfaces } from "@/lib/revalidate-catalog";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/admin-session";
import { importVehiclesByPatentsBatch } from "@/lib/catalog-import-patent";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const session = verifyAdminSessionToken(token);
  if (!session.valid || !session.email) {
    return Response.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    patentes?: string[];
    estadoRetiro?: string;
    forceRefresh?: boolean;
    skipGlo3dFetch?: boolean;
  };
  const patentes = Array.isArray(body.patentes)
    ? body.patentes.map((value) => String(value ?? "").trim()).filter(Boolean)
    : [];
  if (patentes.length === 0) {
    return Response.json({ ok: false, error: "Debes indicar al menos una patente." }, { status: 400 });
  }
  if (patentes.length > 12) {
    return Response.json(
      { ok: false, error: "Máximo 12 patentes por lote para no saturar Glo3D." },
      { status: 400 },
    );
  }

  try {
    const batch = await importVehiclesByPatentsBatch(patentes, {
      estadoRetiro: body.estadoRetiro,
      forceRefresh: body.forceRefresh,
      skipGlo3dFetch: body.skipGlo3dFetch,
    });
    revalidateCatalogSurfaces();
    return Response.json({
      ok: true,
      imported: batch.results.length,
      failed: batch.errors.length,
      rateLimited: batch.rateLimited,
      results: batch.results,
      errors: batch.errors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo importar el lote de patentes.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
