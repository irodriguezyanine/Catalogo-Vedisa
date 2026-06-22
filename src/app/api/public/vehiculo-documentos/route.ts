import { fetchTasacionesDocumentosByPatent } from "@/lib/tasaciones-documentos";
import { normalizePatentKey } from "@/lib/vehicle-identity";

export const revalidate = 120;

/** Documentación pública del vehículo (proxy a Tasaciones inventario_documentos). */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const patente = normalizePatentKey(searchParams.get("patente") ?? "");
  if (!patente) {
    return Response.json({ ok: false, error: "Indica patente." }, { status: 400 });
  }

  const documentos = await fetchTasacionesDocumentosByPatent(patente, { revalidate: 120 });

  return Response.json({
    ok: true,
    patente,
    documentos,
  });
}
