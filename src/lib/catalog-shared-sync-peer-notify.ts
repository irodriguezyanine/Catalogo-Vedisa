export type PeerSyncNotifyResult = {
  url: string;
  ok: boolean;
  error?: string;
};

function resolvePeerSyncUrls(): string[] {
  const raw =
    process.env.CATALOG_SHARED_SYNC_BASE_URL?.trim() ??
    process.env.CATALOG_SOURCE_API_URL?.trim();
  if (!raw) return [];

  return raw
    .split(/[,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((base) => {
      const normalized = base.replace(/\/$/, "");
      if (
        normalized.endsWith("/api/sync/shared-events") ||
        normalized.endsWith("/api/sync/event")
      ) {
        return normalized;
      }
      return `${normalized}/api/sync/shared-events`;
    });
}

/**
 * Tras escribir en Supabase compartido, avisa a Tasaciones/Subastas para que refresquen su vista.
 * Configurar CATALOG_SHARED_SYNC_BASE_URL=https://vedisa.vercel.app (puede ser lista separada por coma).
 */
export async function notifySharedSyncPeers(
  source = "catalog@after-save",
): Promise<PeerSyncNotifyResult[]> {
  const urls = resolvePeerSyncUrls();
  if (urls.length === 0) return [];

  const secret =
    process.env.CATALOG_SHARED_SYNC_SECRET?.trim() ??
    process.env.CATALOG_SYNC_WEBHOOK_SECRET?.trim();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (secret) {
    headers.Authorization = `Bearer ${secret}`;
    headers["x-catalog-sync-secret"] = secret;
  }

  const body = JSON.stringify({
    type: "reconcile",
    source,
    idempotencyKey: `catalog-notify-${Date.now()}`,
  });

  const results = await Promise.all(
    urls.map(async (url): Promise<PeerSyncNotifyResult> => {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers,
          body,
          signal: AbortSignal.timeout(15_000),
          cache: "no-store",
        });
        if (response.ok) return { url, ok: true };
        const text = await response.text().catch(() => "");
        return {
          url,
          ok: false,
          error: text ? `HTTP ${response.status}: ${text.slice(0, 180)}` : `HTTP ${response.status}`,
        };
      } catch (error) {
        return {
          url,
          ok: false,
          error: error instanceof Error ? error.message : "No se pudo contactar al peer",
        };
      }
    }),
  );

  return results;
}
