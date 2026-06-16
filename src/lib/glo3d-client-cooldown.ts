export const GLO3D_CLIENT_COOLDOWN_MS = 30_000;
export const GLO3D_MIN_CLIENT_COOLDOWN_MS = 30_000;
export const GLO3D_COOLDOWN_STORAGE_KEY = "vedisa:glo3d-cooldown-until";
export const GLO3D_BATCH_IMPORT_MAX = 8;

export function readPersistedGlo3dCooldownUntil(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.sessionStorage.getItem(GLO3D_COOLDOWN_STORAGE_KEY);
    const until = Number(raw);
    return Number.isFinite(until) && until > Date.now() ? until : 0;
  } catch {
    return 0;
  }
}

export function persistGlo3dCooldownUntil(until: number): void {
  if (typeof window === "undefined") return;
  try {
    if (until > Date.now()) {
      window.sessionStorage.setItem(GLO3D_COOLDOWN_STORAGE_KEY, String(until));
    } else {
      window.sessionStorage.removeItem(GLO3D_COOLDOWN_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

export function resolveGlo3dClientCooldownMs(retryAfterMs?: number): number {
  return Math.max(GLO3D_MIN_CLIENT_COOLDOWN_MS, GLO3D_CLIENT_COOLDOWN_MS, retryAfterMs ?? 0);
}

export function isGlo3dRateLimitResponse(
  response: Response,
  payload?: { rateLimited?: boolean; glo3dRateLimited?: boolean },
): boolean {
  return response.status === 429 || Boolean(payload?.rateLimited || payload?.glo3dRateLimited);
}

export function isGlo3dRateLimitMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("saturad") ||
    normalized.includes("429") ||
    normalized.includes("en pausa") ||
    normalized.includes("espera")
  );
}
