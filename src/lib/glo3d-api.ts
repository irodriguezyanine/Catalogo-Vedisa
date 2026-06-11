const GLO3D_MIN_INTERVAL_MS = Number(process.env.GLO3D_MIN_INTERVAL_MS ?? "600");
const GLO3D_CIRCUIT_COOLDOWN_MS = Number(process.env.GLO3D_CIRCUIT_COOLDOWN_MS ?? "45000");
const GLO3D_MAX_RETRIES = Number(process.env.GLO3D_MAX_RETRIES ?? "2");

let lastGlo3dHttpAt = 0;
let circuitOpenUntil = 0;
const inFlightRequests = new Map<string, Promise<unknown>>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isGlo3dCircuitOpen(): boolean {
  return Date.now() < circuitOpenUntil;
}

export function getGlo3dCircuitRetryAfterMs(): number {
  return Math.max(0, circuitOpenUntil - Date.now());
}

export function openGlo3dCircuit(cooldownMs = GLO3D_CIRCUIT_COOLDOWN_MS): void {
  circuitOpenUntil = Math.max(circuitOpenUntil, Date.now() + cooldownMs);
}

export async function waitForGlo3dSlot(): Promise<void> {
  if (isGlo3dCircuitOpen()) {
    throw new Glo3dRateLimitError(getGlo3dCircuitRetryAfterMs());
  }
  const elapsed = Date.now() - lastGlo3dHttpAt;
  const wait = GLO3D_MIN_INTERVAL_MS - elapsed;
  if (wait > 0) await sleep(wait);
  lastGlo3dHttpAt = Date.now();
}

export async function dedupeInFlight<T>(key: string, task: () => Promise<T>): Promise<T> {
  const pending = inFlightRequests.get(key);
  if (pending) return pending as Promise<T>;
  const promise = task().finally(() => {
    inFlightRequests.delete(key);
  });
  inFlightRequests.set(key, promise);
  return promise;
}

export class Glo3dRateLimitError extends Error {
  retryAfterMs: number;

  constructor(retryAfterMs = GLO3D_CIRCUIT_COOLDOWN_MS) {
    super(
      retryAfterMs > 0
        ? `La API de Glo3D está saturada. Espera ${Math.ceil(retryAfterMs / 1000)} segundos y vuelve a intentar.`
        : "La API de Glo3D está saturada. Espera unos segundos y vuelve a intentar.",
    );
    this.name = "Glo3dRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

export async function fetchGlo3dHttp(
  url: string,
  init: RequestInit,
  cacheKey: string,
): Promise<Response> {
  return dedupeInFlight(`http:${cacheKey}`, async () => {
    for (let attempt = 0; attempt < GLO3D_MAX_RETRIES; attempt += 1) {
      await waitForGlo3dSlot();
      const response = await fetch(url, init);
      if (response.status === 429) {
        openGlo3dCircuit();
        if (attempt + 1 >= GLO3D_MAX_RETRIES) {
          throw new Glo3dRateLimitError(getGlo3dCircuitRetryAfterMs());
        }
        await sleep(1500 * (attempt + 1));
        continue;
      }
      return response;
    }
    throw new Glo3dRateLimitError(getGlo3dCircuitRetryAfterMs());
  });
}

export function sleepMs(ms: number): Promise<void> {
  return sleep(ms);
}
