/** Logging estructurado para depurar sync Tasaciones / import por patente. */

export type CatalogSyncLogLevel = "info" | "warn" | "error";

export type CatalogSyncLogPayload = Record<string, unknown>;

const PREFIX = "[catalog-sync]";

function emit(level: CatalogSyncLogLevel, stage: string, payload?: CatalogSyncLogPayload) {
  const line = `${PREFIX} ${stage}`;
  if (level === "error") {
    console.error(line, payload ?? "");
    return;
  }
  if (level === "warn") {
    console.warn(line, payload ?? "");
    return;
  }
  console.info(line, payload ?? "");
}

export function logCatalogSync(stage: string, payload?: CatalogSyncLogPayload) {
  emit("info", stage, payload);
}

export function warnCatalogSync(stage: string, payload?: CatalogSyncLogPayload) {
  emit("warn", stage, payload);
}

export function errorCatalogSync(stage: string, payload?: CatalogSyncLogPayload) {
  emit("error", stage, payload);
}

export function logCatalogSyncPatentResult(
  patente: string,
  result: {
    ok?: boolean;
    source?: string;
    syncDiagnostics?: {
      tasacionesFound?: boolean;
      tasacionesComplete?: boolean;
      usedExternalApis?: boolean;
      syncComplete?: boolean;
      thumbnailSource?: string;
      warnings?: string[];
    };
    error?: string;
    rateLimited?: boolean;
  },
) {
  const diag = result.syncDiagnostics;
  const level: CatalogSyncLogLevel =
    result.error || result.rateLimited
      ? "error"
      : diag?.syncComplete === false
        ? "warn"
        : "info";
  emit(level, `${patente} import`, {
    ok: result.ok ?? !result.error,
    source: result.source,
    tasacionesFound: diag?.tasacionesFound,
    tasacionesComplete: diag?.tasacionesComplete,
    usedExternalApis: diag?.usedExternalApis,
    syncComplete: diag?.syncComplete,
    thumbnailSource: diag?.thumbnailSource,
    warnings: diag?.warnings,
    error: result.error,
    rateLimited: result.rateLimited,
  });
}
