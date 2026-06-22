import { type LotDocumentLink } from "@/lib/lot-documents";
import { normalizePatentKey } from "@/lib/vehicle-identity";

export type TasacionesDocumentoPublico = {
  id: string;
  nombre_archivo: string;
  public_url: string;
  tipo_documento?: string;
  origen_almacenamiento?: "supabase" | "externo";
};

export type TasacionesDocumentosFetchResult = {
  documentos: LotDocumentLink[];
  nombresArchivoOcultos: string[];
};

type TasacionesDocumentosApiResponse = {
  ok?: boolean;
  meta?: {
    nombres_archivo_ocultos?: string[];
  };
  por_patente?: Record<
    string,
    {
      documentos?: TasacionesDocumentoPublico[];
      nombres_archivo_ocultos?: string[];
    }
  >;
  data?: TasacionesDocumentoPublico[];
};

export function tasacionesDocumentoToLotLink(doc: TasacionesDocumentoPublico): LotDocumentLink {
  return {
    url: doc.public_url.trim(),
    label: doc.nombre_archivo?.trim() || "Documento",
  };
}

function pickDocumentosFromPayload(
  payload: TasacionesDocumentosApiResponse,
  patenteNorm: string,
): TasacionesDocumentoPublico[] {
  const porPatente = payload.por_patente?.[patenteNorm]?.documentos;
  if (Array.isArray(porPatente) && porPatente.length > 0) return porPatente;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

function pickNombresOcultosFromPayload(
  payload: TasacionesDocumentosApiResponse,
  patenteNorm: string,
): string[] {
  const porPatente = payload.por_patente?.[patenteNorm]?.nombres_archivo_ocultos;
  if (Array.isArray(porPatente) && porPatente.length > 0) return porPatente;
  if (Array.isArray(payload.meta?.nombres_archivo_ocultos)) {
    return payload.meta.nombres_archivo_ocultos;
  }
  return [];
}

/**
 * Documentos de inventario en Tasaciones (Supabase Storage o Cloudinary vía public_url).
 * Solo servidor: usa CATALOG_SOURCE_API_TOKEN.
 */
export async function fetchTasacionesDocumentosByPatent(
  patente: string,
  options?: { revalidate?: number },
): Promise<TasacionesDocumentosFetchResult> {
  const empty = { documentos: [], nombresArchivoOcultos: [] };
  const apiBase = process.env.CATALOG_SOURCE_API_URL?.trim();
  if (!apiBase) return empty;

  const patenteNorm = normalizePatentKey(patente);
  if (!patenteNorm) return empty;

  const token = process.env.CATALOG_SOURCE_API_TOKEN?.trim();
  const base = apiBase.trim().replace(/\/$/, "");
  const endpoint = base.includes("/api/inventario-publico")
    ? new URL(base.replace(/\/inventario-publico\/?$/, "/inventario-documentos-publico"))
    : base.includes("/api/")
      ? new URL(`${base.replace(/\/[^/]+\/?$/, "")}/inventario-documentos-publico`)
      : new URL("/api/inventario-documentos-publico", base);

  endpoint.searchParams.set("patente", patenteNorm);
  endpoint.searchParams.set("solo_pdf", "true");
  endpoint.searchParams.set("verificar_visible_catalogo", "true");

  const revalidate = options?.revalidate ?? 120;

  const response = await fetch(endpoint.toString(), {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token
        ? {
            "x-api-key": token,
            Authorization: `Bearer ${token}`,
          }
        : {}),
    },
    next: { revalidate },
  });

  if (!response.ok) {
    console.warn(
      `[tasaciones-documentos] ${endpoint.pathname} respondió ${response.status} para ${patenteNorm}`,
    );
    return empty;
  }

  const payload = (await response.json()) as TasacionesDocumentosApiResponse;
  if (!payload.ok) return empty;

  const documentos = pickDocumentosFromPayload(payload, patenteNorm)
    .filter((doc) => doc.public_url?.trim().startsWith("http"))
    .map(tasacionesDocumentoToLotLink);

  return {
    documentos,
    nombresArchivoOcultos: pickNombresOcultosFromPayload(payload, patenteNorm),
  };
}
