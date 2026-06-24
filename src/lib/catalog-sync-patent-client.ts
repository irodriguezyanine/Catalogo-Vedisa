import { isGlo3dRateLimitResponse } from "@/lib/glo3d-client-cooldown";
import type { CatalogItem } from "@/types/catalog";
import type { EditorVehicleDetails } from "@/types/editor";

/** Pausa entre patentes en sincronización masiva (evita saturar APIs). */
export const CATALOG_SYNC_PATENT_DELAY_MS = 2_000;
export const CATALOG_SYNC_PATENT_MAX_RETRIES = 6;
export const CATALOG_SYNC_PATENT_RETRY_BASE_MS = 4_000;
export const CATALOG_SYNC_PATENT_TIMEOUT_MS = 90_000;

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
};

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function postImportPatent(
  patente: string,
  options: {
    estadoRetiro?: string;
    forceRefresh?: boolean;
  },
): Promise<{ response: Response; payload: ImportPatentApiPayload }> {
  const response = await fetch("/api/admin/import-patent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      patente,
      estadoRetiro: options.estadoRetiro,
      forceRefresh: options.forceRefresh ?? true,
      skipGlo3dFetch: false,
    }),
    signal: AbortSignal.timeout(CATALOG_SYNC_PATENT_TIMEOUT_MS),
  });
  const payload = (await response.json().catch(() => ({}))) as ImportPatentApiPayload;
  return { response, payload };
}

export async function importPatentWithRetries(
  patente: string,
  options: {
    estadoRetiro?: string;
    forceRefresh?: boolean;
  },
): Promise<{ response: Response; payload: ImportPatentApiPayload }> {
  let lastPayload: ImportPatentApiPayload | undefined;

  for (let attempt = 0; attempt < CATALOG_SYNC_PATENT_MAX_RETRIES; attempt += 1) {
    const { response, payload } = await postImportPatent(patente, options);
    lastPayload = payload;

    if (isGlo3dRateLimitResponse(response, payload) || payload.glo3dRateLimited) {
      const waitMs = Math.max(
        CATALOG_SYNC_PATENT_RETRY_BASE_MS * (attempt + 1),
        payload.retryAfterMs ?? 0,
        2_000,
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
