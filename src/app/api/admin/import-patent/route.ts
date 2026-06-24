import { revalidateCatalogSurfaces } from "@/lib/revalidate-catalog";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/admin-session";
import { Glo3dRateLimitError } from "@/lib/catalog";
import { importVehicleByPatent } from "@/lib/catalog-import-patent";

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
    patente?: string;
    estadoRetiro?: string;
    forceRefresh?: boolean;
    forceExternalApis?: boolean;
    syncMode?: "tasaciones-first" | "external";
    skipGlo3dFetch?: boolean;
    seedInventarioRow?: Record<string, unknown>;
  };
  const patente = String(body.patente ?? "").trim();
  if (!patente) {
    return Response.json({ ok: false, error: "Debes indicar una patente." }, { status: 400 });
  }

  try {
    const result = await importVehicleByPatent(patente, {
      estadoRetiro: body.estadoRetiro,
      forceRefresh: body.forceRefresh ?? true,
      forceExternalApis: body.forceExternalApis,
      syncMode: body.syncMode,
      skipGlo3dFetch: body.skipGlo3dFetch,
      seedInventarioRow: body.seedInventarioRow,
    });
    revalidateCatalogSurfaces();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo importar la patente.";
    const rateLimited = error instanceof Glo3dRateLimitError;
    const status = rateLimited ? 429 : 400;
    const retryAfterMs = rateLimited ? error.retryAfterMs : undefined;
    return Response.json({ ok: false, error: message, rateLimited, retryAfterMs }, { status });
  }
}
