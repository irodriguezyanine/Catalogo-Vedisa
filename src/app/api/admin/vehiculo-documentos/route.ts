import { cookies } from "next/headers";
import {
  fetchTasacionesDocumentosGestionByPatent,
  patchTasacionesDocumentoVisible,
} from "@/lib/tasaciones-documentos";
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/admin-session";
import { normalizePatentKey } from "@/lib/vehicle-identity";

async function assertAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const session = verifyAdminSessionToken(token);
  if (!session.valid || !session.email) return null;
  return session;
}

export async function GET(request: Request) {
  const session = await assertAdmin();
  if (!session) {
    return Response.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const patente = normalizePatentKey(searchParams.get("patente") ?? "");
  if (!patente) {
    return Response.json({ ok: false, error: "Indica patente." }, { status: 400 });
  }

  const result = await fetchTasacionesDocumentosGestionByPatent(patente);

  return Response.json({
    ok: true,
    patente,
    documentos_inventario: result.documentosGestion,
    nombres_archivo_ocultos: result.nombresArchivoOcultos,
  });
}

export async function PATCH(request: Request) {
  const session = await assertAdmin();
  if (!session) {
    return Response.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    documento_id?: string;
    visible_catalogo?: boolean;
  } | null;

  const documentoId = String(body?.documento_id ?? "").trim();
  if (!documentoId || typeof body?.visible_catalogo !== "boolean") {
    return Response.json(
      { ok: false, error: "Indica documento_id y visible_catalogo." },
      { status: 400 },
    );
  }

  const result = await patchTasacionesDocumentoVisible(documentoId, body.visible_catalogo);
  if (!result.ok) {
    return Response.json({ ok: false, error: result.error ?? "Error al guardar." }, { status: 502 });
  }

  return Response.json({ ok: true });
}
