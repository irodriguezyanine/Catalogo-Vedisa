import { isGlo3dRateLimitResponse } from "@/lib/glo3d-client-cooldown";
import type { ImportPatentSyncMode } from "@/lib/catalog-import-patent";
import type { CatalogItem } from "@/types/catalog";
import type { EditorVehicleDetails } from "@/types/editor";

const CHILE_TIME_ZONE = "America/Santiago";

/** Pausa entre lotes cuando se usan APIs externas (plan B). */
export const CATALOG_SYNC_PATENT_DELAY_MS = 1_200;
export const CATALOG_SYNC_PATENT_MAX_RETRIES = 4;
export const CATALOG_SYNC_PATENT_RETRY_BASE_MS = 3_000;
export const CATALOG_SYNC_PATENT_TIMEOUT_MS = 120_000;
export const CATALOG_SYNC_BATCH_CHUNK_SIZE = 8;
export const CATALOG_SYNC_BATCH_TIMEOUT_MS = 130_000;

export type ImportPatentClientOptions = {
  estadoRetiro?: string;
  /** Refresca desde Tasaciones (default true en import normal). */
  forceRefresh?: boolean;
  /** Plan B: fuerza Glo3D + Autored directos. */
  forceExternalApis?: boolean;
  syncMode?: ImportPatentSyncMode;
  skipGlo3dFetch?: boolean;
};

export type ImportPatentApiPayload = {
  ok?: boolean;
  error?: string;
  item?: CatalogItem;
  vehicleDetails?: EditorVehicleDetails;
  source?: string;
  hasGlo3dViewer?: boolean;
  created?: boolean;
  patente?: string;
  glo3dRateLimited?: boolean;
  autoredSynced?: boolean;
  autoredConfigured?: boolean;
  autoredReason?: "synced" | "not_configured" | "no_record" | "no_identity";
  skippedGlo3dFetch?: boolean;
  retryAfterMs?: number;
  rateLimited?: boolean;
  syncDiagnostics?: {
    tasacionesFound?: boolean;
    tasacionesComplete?: boolean;
    usedExternalApis?: boolean;
    glo3dFound: boolean;
    glo3dImageCount: number;
    glo3dViewer: boolean;
    thumbnailSource: "glo3d" | "autored" | "inventario" | "none";
    autoredSynced: boolean;
    syncComplete: boolean;
    warnings: string[];
  };
};

export type ImportPatentsBatchApiPayload = {
  ok?: boolean;
  error?: string;
  imported?: number;
  failed?: number;
  rateLimited?: boolean;
  results?: ImportPatentApiPayload[];
  errors?: Array<{ patente: string; error: string }>;
};

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildImportPatentBody(patente: string, options: ImportPatentClientOptions) {
  const syncMode = options.syncMode ?? (options.forceExternalApis ? "external" : "tasaciones-first");
  return {
    patente,
    estadoRetiro: options.estadoRetiro,
    forceRefresh: options.forceRefresh ?? true,
    forceExternalApis: options.forceExternalApis ?? syncMode === "external",
    syncMode,
    skipGlo3dFetch: options.skipGlo3dFetch ?? false,
  };
}

function shouldRetryImportPatent(
  response: Response,
  payload: ImportPatentApiPayload,
): boolean {
  if (payload.ok && payload.item) return false;
  if (payload.syncDiagnostics?.usedExternalApis === false) return false;
  return isGlo3dRateLimitResponse(response, payload) || Boolean(payload.glo3dRateLimited);
}

export async function postImportPatent(
  patente: string,
  options: ImportPatentClientOptions = {},
): Promise<{ response: Response; payload: ImportPatentApiPayload }> {
  const response = await fetch("/api/admin/import-patent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildImportPatentBody(patente, options)),
    signal: AbortSignal.timeout(CATALOG_SYNC_PATENT_TIMEOUT_MS),
  });
  const payload = (await response.json().catch(() => ({}))) as ImportPatentApiPayload;
  return { response, payload };
}

export async function importPatentWithRetries(
  patente: string,
  options: ImportPatentClientOptions = {},
): Promise<{ response: Response; payload: ImportPatentApiPayload }> {
  let lastPayload: ImportPatentApiPayload | undefined;

  for (let attempt = 0; attempt < CATALOG_SYNC_PATENT_MAX_RETRIES; attempt += 1) {
    const { response, payload } = await postImportPatent(patente, options);
    lastPayload = payload;

    if (shouldRetryImportPatent(response, payload)) {
      const waitMs = Math.max(
        CATALOG_SYNC_PATENT_RETRY_BASE_MS * (attempt + 1),
        payload.retryAfterMs ?? 0,
        1_500,
      );
      await sleepMs(waitMs);
      continue;
    }

    if (!response.ok || !payload.ok || !payload.item) {
      throw new Error(payload.error ?? `No se pudo sincronizar ${patente}.`);
    }

    return { response, payload };
  }

  throw new Error(
    lastPayload?.error ?? `Glo3D ocupado; no se sincronizó ${patente} tras varios intentos.`,
  );
}

export async function postImportPatentsBatch(
  patentes: string[],
  options: ImportPatentClientOptions = {},
): Promise<{ response: Response; payload: ImportPatentsBatchApiPayload }> {
  const syncMode = options.syncMode ?? (options.forceExternalApis ? "external" : "tasaciones-first");
  const response = await fetch("/api/admin/import-patents-batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      patentes,
      estadoRetiro: options.estadoRetiro,
      forceRefresh: options.forceRefresh ?? true,
      forceExternalApis: options.forceExternalApis ?? syncMode === "external",
      syncMode,
      skipGlo3dFetch: options.skipGlo3dFetch ?? false,
    }),
    signal: AbortSignal.timeout(CATALOG_SYNC_BATCH_TIMEOUT_MS),
  });
  const payload = (await response.json().catch(() => ({}))) as ImportPatentsBatchApiPayload;
  return { response, payload };
}

export async function importPatentsBatchWithRetries(
  patentes: string[],
  options: ImportPatentClientOptions = {},
): Promise<ImportPatentsBatchApiPayload> {
  let lastPayload: ImportPatentsBatchApiPayload | undefined;

  for (let attempt = 0; attempt < CATALOG_SYNC_PATENT_MAX_RETRIES; attempt += 1) {
    const { response, payload } = await postImportPatentsBatch(patentes, options);
    lastPayload = payload;

    const hasResults = (payload.results?.length ?? 0) > 0;
    const onlyRateLimited =
      (isGlo3dRateLimitResponse(response, payload) || payload.rateLimited) && !hasResults;

    if (onlyRateLimited) {
      const waitMs = Math.max(CATALOG_SYNC_PATENT_RETRY_BASE_MS * (attempt + 1), 1_500);
      await sleepMs(waitMs);
      continue;
    }

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error ?? "No se pudo sincronizar el lote de patentes.");
    }

    return payload;
  }

  throw new Error(lastPayload?.error ?? "Glo3D ocupado; no se pudo sincronizar el lote.");
}

/** Formato estable Chile para evitar hydration mismatch SSR/cliente. */
export function formatAuctionWindowLabelStable(auction: {
  date?: string;
  startAt?: string;
  endAt?: string;
}): string {
  const inicio = auction.startAt ? new Date(auction.startAt) : null;
  const cierre = auction.endAt ? new Date(auction.endAt) : null;
  if (inicio && cierre && !Number.isNaN(inicio.getTime()) && !Number.isNaN(cierre.getTime())) {
    const fmt = (date: Date) =>
      date.toLocaleString("es-CL", {
        timeZone: CHILE_TIME_ZONE,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    return `${fmt(inicio)} → ${fmt(cierre)}`;
  }
  const raw = (auction.date ?? "").trim();
  if (!raw) return "Sin fecha";
  const parsed = new Date(`${raw}T12:00:00`);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString("es-CL", {
      timeZone: CHILE_TIME_ZONE,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }
  return raw;
}
