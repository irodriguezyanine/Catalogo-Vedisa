/**
 * Cliente Autored API V2 — https://app.autored.cl/api/v2/docs/
 * Auth: POST /auth/login → Bearer accessToken
 * Vehículo: GET /vehicles/info?licensePlate=XXXXXX
 */

const DEFAULT_BASE_URL = "https://app.autored.cl/api/v2";

type AutoredTokenCache = {
  accessToken: string;
  expiresAt: number;
};

let tokenCache: AutoredTokenCache | null = null;

export function getAutoredCredentials():
  | { email: string; password: string; baseUrl: string }
  | null {
  const email =
    process.env.AUTORED_API_EMAIL?.trim() ??
    process.env.CATALOG_SOURCE_AUTORED_EMAIL?.trim();
  const password =
    process.env.AUTORED_API_PASSWORD?.trim() ??
    process.env.CATALOG_SOURCE_AUTORED_PASSWORD?.trim();
  if (!email || !password) return null;
  const baseUrl =
    process.env.AUTORED_API_BASE_URL?.trim() ??
    process.env.CATALOG_SOURCE_AUTORED_API_URL?.trim() ??
    DEFAULT_BASE_URL;
  return { email, password, baseUrl: baseUrl.replace(/\/$/, "") };
}

export function isAutoredApiConfigured(): boolean {
  return Boolean(getAutoredCredentials());
}

function parseExpirationMs(value: unknown): number {
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.now() + 55 * 60 * 1000;
}

async function fetchAutoredAccessToken(
  creds: { email: string; password: string; baseUrl: string },
  forceRefresh?: boolean,
): Promise<string | null> {
  if (!forceRefresh && tokenCache && tokenCache.expiresAt > Date.now() + 30_000) {
    return tokenCache.accessToken;
  }

  const response = await fetch(`${creds.baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: creds.email, password: creds.password }),
    cache: "no-store",
  });

  if (!response.ok) {
    console.warn(`[autored] Login falló HTTP ${response.status}`);
    tokenCache = null;
    return null;
  }

  const payload = (await response.json()) as {
    accessToken?: string;
    expirationDate?: string;
  };
  if (!payload.accessToken) return null;

  tokenCache = {
    accessToken: payload.accessToken,
    expiresAt: parseExpirationMs(payload.expirationDate),
  };
  return payload.accessToken;
}

export function normalizeAutoredV2Vehicle(
  raw: Record<string, unknown>,
  patente: string,
): Record<string, unknown> {
  const marca = String(raw.brand_name ?? raw.original_brand_name ?? "").trim();
  const modelo = String(raw.model_name ?? raw.original_model_name ?? "").trim();
  const version = String(raw.version_name ?? raw.original_extracted_version ?? "").trim();
  const ano = raw.year != null ? String(raw.year) : "";
  const vin = String(raw.vin ?? raw.extracted_vin ?? "").trim();
  const motor = String(raw.engine_number ?? "").trim();
  const color = String(raw.color ?? "").trim();
  const cilindrada = raw.cylinder_capacity != null ? String(raw.cylinder_capacity) : "";
  const combustible = String(raw.fuelTypeName ?? raw.fuel_type ?? "").trim();
  const traccion = String(raw.tractionName ?? "").trim();
  const transmision = String(raw.transmissionName ?? raw.transmission ?? "").trim();
  const tipo = String(raw.vehicle_type ?? "").trim();
  const showName = String(raw.showName ?? "").trim();
  const licensePlate = String(raw.license_plate ?? patente).trim().toUpperCase();

  const result: Record<string, unknown> = {
    ...raw,
    patente: licensePlate,
    PPU: licensePlate,
    license_plate: licensePlate,
    origen: "autored-v2",
  };
  if (marca) {
    result.marca = marca;
    result.brand = marca;
  }
  if (modelo) {
    result.modelo = modelo;
    result.model = modelo;
  }
  if (ano) {
    result.ano = ano;
    result.anio = ano;
    result.year = ano;
  }
  if (version) result.version = version;
  if (vin) {
    result.vin = vin;
    result.n_de_vin = vin;
  }
  if (motor) {
    result.numero_motor = motor;
    result.n_de_motor = motor;
    result.engine_number = motor;
  }
  if (color) result.color = color;
  if (cilindrada) {
    result.cilindrada = cilindrada;
    result.cc = cilindrada;
  }
  if (combustible) result.combustible = combustible;
  if (traccion) {
    result.traccion = traccion;
    result.tipo_traccion = traccion;
  }
  if (transmision) {
    result.transmision = transmision;
    result.caja = transmision;
  }
  if (tipo) {
    result.tipo_vehiculo = tipo;
    result.tipo_de_vehiculo = tipo;
    result.vehicle_type = tipo;
  }
  if (showName) {
    result.descripcion = showName;
    result.nombre_vehiculo = showName;
    result.titulo = showName;
  }
  const imageUrl = String(raw.model_url ?? "").trim();
  if (imageUrl.startsWith("http")) {
    result.imagenes = [imageUrl];
    result.thumbnail = imageUrl;
  }
  return result;
}

export async function fetchAutoredV2VehicleByPatent(
  patent: string,
  options?: { forceRefresh?: boolean },
): Promise<Record<string, unknown> | null> {
  const creds = getAutoredCredentials();
  if (!creds) return null;

  const normalized = patent.trim().toUpperCase().replace(/\s+/g, "").replace(/-/g, "");
  if (!normalized) return null;

  const accessToken = await fetchAutoredAccessToken(creds, options?.forceRefresh);
  if (!accessToken) return null;

  const url = new URL(`${creds.baseUrl}/vehicles/info`);
  url.searchParams.set("licensePlate", normalized);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (response.status === 401) {
    const retryToken = await fetchAutoredAccessToken(creds, true);
    if (!retryToken) return null;
    const retry = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${retryToken}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!retry.ok) {
      console.warn(`[autored] vehicles/info ${normalized} HTTP ${retry.status}`);
      return null;
    }
    const payload = (await retry.json()) as Record<string, unknown>;
    return normalizeAutoredV2Vehicle(payload, normalized);
  }

  if (!response.ok) {
    console.warn(`[autored] vehicles/info ${normalized} HTTP ${response.status}`);
    return null;
  }

  const payload = (await response.json()) as Record<string, unknown>;
  return normalizeAutoredV2Vehicle(payload, normalized);
}

export function invalidateAutoredTokenCache(): void {
  tokenCache = null;
}
