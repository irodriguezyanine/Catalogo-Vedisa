import { type LotDocumentLink } from "@/lib/lot-documents";
import { normalizePatentKey } from "@/lib/vehicle-identity";

export type TasacionesDocumentoPublico = {
  id: string;
  nombre_archivo: string;
  public_url: string;
  tipo_documento?: string;
  origen_almacenamiento?: "supabase" | "externo";
};

export type TasacionesDocumentoGestion = {
  id: string;
  inventario_id: string;
  nombre_archivo: string;
  public_url: string;
  tipo_documento: string;
  visible_catalogo: boolean;
  puede_publicar: boolean;
};

export type TasacionesDocumentosFetchResult = {
  documentos: LotDocumentLink[];
  nombresArchivoOcultos: string[];
  documentosGestion: TasacionesDocumentoGestion[];
};

type TasacionesDocumentosApiResponse = {
  ok?: boolean;
  meta?: {
    nombres_archivo_ocultos?: string[];
    documentos_gestion?: TasacionesDocumentoGestion[];
  };
  por_patente?: Record<
    string,
    {
      documentos?: TasacionesDocumentoPublico[];
      nombres_archivo_ocultos?: string[];
      documentos_gestion?: TasacionesDocumentoGestion[];
    }
  >;
  data?: TasacionesDocumentoPublico[];
};

function buildTasacionesDocumentosEndpoint(apiBase: string): URL {
  const base = apiBase.trim().replace(/\/$/, "");
  if (base.includes("/api/inventario-publico")) {
    return new URL(base.replace(/\/inventario-publico\/?$/, "/inventario-documentos-publico"));
  }
  if (base.includes("/api/")) {
    return new URL(`${base.replace(/\/[^/]+\/?$/, "")}/inventario-documentos-publico`);
  }
  return new URL("/api/inventario-documentos-publico", base);
}

function authHeaders(token: string | undefined): Record<string, string> {
  return token
    ? {
        "x-api-key": token,
        Authorization: `Bearer ${token}`,
      }
    : {};
}

export function tasacionesDocumentoToLotLink(doc: TasacionesDocumentoPublico): LotDocumentLink {
  return {
    url: doc.public_url.trim(),
    label: doc.nombre_archivo?.trim() || "Documento",
  };
}

function pickFromPatente<T>(
  payload: TasacionesDocumentosApiResponse,
  patenteNorm: string,
  picker: (entry: NonNullable<TasacionesDocumentosApiResponse["por_patente"]>[string]) => T[] | undefined,
  metaPicker: (meta: NonNullable<TasacionesDocumentosApiResponse["meta"]>) => T[] | undefined,
): T[] {
  const porPatente = payload.por_patente?.[patenteNorm];
  const fromPatente = porPatente ? picker(porPatente) : undefined;
  if (Array.isArray(fromPatente) && fromPatente.length > 0) return fromPatente;
  const fromMeta = payload.meta ? metaPicker(payload.meta) : undefined;
  if (Array.isArray(fromMeta)) return fromMeta;
  return [];
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

async function fetchTasacionesDocumentosPayload(
  patente: string,
  options?: { revalidate?: number; incluirGestion?: boolean },
): Promise<TasacionesDocumentosApiResponse | null> {
  const apiBase = process.env.CATALOG_SOURCE_API_URL?.trim();
  if (!apiBase) return null;

  const patenteNorm = normalizePatentKey(patente);
  if (!patenteNorm) return null;

  const token = process.env.CATALOG_SOURCE_API_TOKEN?.trim();
  const endpoint = buildTasacionesDocumentosEndpoint(apiBase);
  endpoint.searchParams.set("patente", patenteNorm);
  endpoint.searchParams.set("solo_pdf", "true");
  endpoint.searchParams.set("verificar_visible_catalogo", "true");
  if (options?.incluirGestion) {
    endpoint.searchParams.set("incluir_gestion", "true");
  }

  const response = await fetch(endpoint.toString(), {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token),
    },
    next: { revalidate: options?.revalidate ?? 120 },
  });

  if (!response.ok) {
    console.warn(
      `[tasaciones-documentos] ${endpoint.pathname} respondió ${response.status} para ${patenteNorm}`,
    );
    return null;
  }

  const payload = (await response.json()) as TasacionesDocumentosApiResponse;
  return payload.ok ? payload : null;
}

const emptyResult: TasacionesDocumentosFetchResult = {
  documentos: [],
  nombresArchivoOcultos: [],
  documentosGestion: [],
};

export async function fetchTasacionesDocumentosByPatent(
  patente: string,
  options?: { revalidate?: number },
): Promise<TasacionesDocumentosFetchResult> {
  const payload = await fetchTasacionesDocumentosPayload(patente, options);
  if (!payload) return emptyResult;

  const patenteNorm = normalizePatentKey(patente);
  const documentos = pickDocumentosFromPayload(payload, patenteNorm)
    .filter((doc) => doc.public_url?.trim().startsWith("http"))
    .map(tasacionesDocumentoToLotLink);

  return {
    documentos,
    nombresArchivoOcultos: pickFromPatente(
      payload,
      patenteNorm,
      (row) => row.nombres_archivo_ocultos,
      (meta) => meta.nombres_archivo_ocultos,
    ),
    documentosGestion: [],
  };
}

export async function fetchTasacionesDocumentosGestionByPatent(
  patente: string,
): Promise<TasacionesDocumentosFetchResult> {
  const payload = await fetchTasacionesDocumentosPayload(patente, {
    revalidate: 0,
    incluirGestion: true,
  });
  if (!payload) return emptyResult;

  const patenteNorm = normalizePatentKey(patente);
  const documentos = pickDocumentosFromPayload(payload, patenteNorm)
    .filter((doc) => doc.public_url?.trim().startsWith("http"))
    .map(tasacionesDocumentoToLotLink);

  return {
    documentos,
    nombresArchivoOcultos: pickFromPatente(
      payload,
      patenteNorm,
      (row) => row.nombres_archivo_ocultos,
      (meta) => meta.nombres_archivo_ocultos,
    ),
    documentosGestion: pickFromPatente(
      payload,
      patenteNorm,
      (row) => row.documentos_gestion,
      (meta) => meta.documentos_gestion,
    ),
  };
}

export async function patchTasacionesDocumentoVisible(
  documentoId: string,
  visibleCatalogo: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const apiBase = process.env.CATALOG_SOURCE_API_URL?.trim();
  if (!apiBase) return { ok: false, error: "CATALOG_SOURCE_API_URL no configurado." };

  const token = process.env.CATALOG_SOURCE_API_TOKEN?.trim();
  const base = apiBase.trim().replace(/\/$/, "");
  const endpoint = base.includes("/api/")
    ? new URL(`${base.replace(/\/[^/]+\/?$/, "")}/inventario-documento-visible`)
    : new URL("/api/inventario-documento-visible", base);

  const response = await fetch(endpoint.toString(), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token),
    },
    body: JSON.stringify({
      documento_id: documentoId,
      visible_catalogo: visibleCatalogo,
    }),
    cache: "no-store",
  });

  const body = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!response.ok || !body.ok) {
    return { ok: false, error: body.error ?? `Error ${response.status}` };
  }
  return { ok: true };
}
