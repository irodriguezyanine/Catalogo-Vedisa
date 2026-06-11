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

function inferTransmissionFromAutoredText(...parts: Array<string | undefined>): string | undefined {
  const combined = parts.filter(Boolean).join(" ").toUpperCase();
  if (!combined) return undefined;
  if (/\bDCT\b|\bDSG\b/.test(combined)) return "Automática DCT";
  if (/\bCVT\b/.test(combined)) return "CVT";
  if (/\bAT\b|\bAUT\b|AUTOMAT/.test(combined)) return "Automática";
  if (/\bMT\b|\bMANUAL\b/.test(combined)) return "Manual";
  return undefined;
}

function inferFuelFromAutoredText(...parts: Array<string | undefined>): string | undefined {
  const combined = parts.filter(Boolean).join(" ").toUpperCase();
  if (!combined) return undefined;
  if (/\bDIESEL\b|\bHDI\b/.test(combined)) return "Diesel";
  if (/\bHIBRID|\bHYBRID|\bPHEV|\bMHEV/.test(combined)) return "Híbrido";
  if (/\bELECTRIC|\bEV\b/.test(combined)) return "Eléctrico";
  if (/\bGNC\b|\bGLP\b/.test(combined)) return "GNC/GLP";
  if (/\bGASOLINA\b|\bBENCINA\b/.test(combined)) return "Gasolina";
  if (/\b1\.\d\b|\b2\.\d\b/.test(combined) && !/\bDIESEL\b/.test(combined)) return "Gasolina";
  return undefined;
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
  const showName = String(raw.showName ?? "").trim();
  const combustible =
    String(raw.fuelTypeName ?? raw.fuel_type ?? "").trim() ||
    inferFuelFromAutoredText(version, showName, modelo, marca) ||
    "";
  const traccion = String(raw.tractionName ?? "").trim();
  const transmision =
    String(raw.transmissionName ?? raw.transmission ?? "").trim() ||
    inferTransmissionFromAutoredText(version, showName, modelo) ||
    "";
  const tipo = String(raw.vehicle_type ?? "").trim();
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
    result.numero_chasis = vin;
    result.n_de_chasis = vin;
    result.chasis = vin;
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

function parseKmValue(value?: string | number | null): number | null {
  if (value == null) return null;
  const digits = String(value).replace(/[^\d]/g, "");
  if (!digits) return null;
  const km = Number.parseInt(digits, 10);
  return Number.isFinite(km) && km >= 0 ? km : null;
}

function mapAutoredTransmissionId(transmission?: string): number | undefined {
  const sample = (transmission ?? "").toUpperCase();
  if (!sample) return undefined;
  if (/\bAT\b|\bAUT\b|AUTOMAT|CVT|DCT|DSG/.test(sample)) return 1;
  if (/\bMT\b|\bMANUAL\b|MECAN/.test(sample)) return 0;
  return undefined;
}

function mapAutoredFuelTypeId(fuel?: string): number | undefined {
  const sample = (fuel ?? "").toUpperCase();
  if (!sample) return undefined;
  if (/DIESEL|HDI/.test(sample)) return 1;
  if (/HIBRID|HYBRID|PHEV|MHEV/.test(sample)) return 2;
  if (/ELECTRIC|\bEV\b/.test(sample)) return 3;
  if (/GASOLINA|BENCINA|GASOL|BENC/.test(sample)) return 0;
  return undefined;
}

function mapAutoredTractionId(traction?: string): number | undefined {
  const sample = (traction ?? "").toUpperCase();
  if (!sample) return undefined;
  if (/4X4|4WD|AWD|CUATRO/.test(sample)) return 1;
  if (/4X2|2WD|DELANTERA|TRASERA/.test(sample)) return 0;
  return undefined;
}

function extractPublicationAverageFromPayload(payload: Record<string, unknown>): number | null {
  const kpis = payload.kpis;
  if (kpis && typeof kpis === "object" && !Array.isArray(kpis)) {
    const record = kpis as Record<string, unknown>;
    const candidates = [
      record.average_price,
      record.avg_price,
      record.mean_price,
      record.price_avg,
      record.averagePrice,
      record.avgPrice,
      record.priceAverage,
      record.promedio,
    ];
    for (const candidate of candidates) {
      const amount = Number(candidate);
      if (Number.isFinite(amount) && amount > 0) return Math.round(amount);
    }
  }

  const selected = payload.selected;
  if (Array.isArray(selected) && selected.length > 0) {
    const prices = selected
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const price = Number((row as Record<string, unknown>).price);
        return Number.isFinite(price) && price > 0 ? price : null;
      })
      .filter((price): price is number => price != null);
    if (prices.length > 0) {
      const total = prices.reduce((sum, price) => sum + price, 0);
      return Math.round(total / prices.length);
    }
  }

  return null;
}

/**
 * Consulta el precio promedio de publicación en Autored por modelo, año, versión y km.
 */
export async function fetchAutoredPublicationAveragePrice(
  autored: Record<string, unknown>,
  kilometraje?: string | number | null,
): Promise<number | null> {
  const modelId = Number(autored.model_id);
  const year = Number(autored.year ?? autored.ano ?? autored.anio);
  if (!Number.isFinite(modelId) || modelId <= 0 || !Number.isFinite(year) || year <= 0) {
    return null;
  }

  const creds = getAutoredCredentials();
  if (!creds) return null;

  const accessToken = await fetchAutoredAccessToken(creds);
  if (!accessToken) return null;

  const url = new URL(`${creds.baseUrl}/prices/publication-prices`);
  url.searchParams.set("model_id", String(modelId));
  url.searchParams.set("year", String(year));
  url.searchParams.set("only_recent_publications", "true");
  url.searchParams.set("row_limit_only", "true");

  const trimName = String(
    autored.version_name ?? autored.version ?? autored.original_extracted_version ?? "",
  ).trim();
  if (trimName) url.searchParams.set("trim_name", trimName);

  const cylinderCapacity = Number(autored.cylinder_capacity ?? autored.cilindrada ?? autored.cc);
  if (Number.isFinite(cylinderCapacity) && cylinderCapacity > 0) {
    url.searchParams.set("cylinder_capacity", String(Math.round(cylinderCapacity)));
  }

  const transmissionId = mapAutoredTransmissionId(
    String(autored.transmissionName ?? autored.transmission ?? autored.transmision ?? ""),
  );
  if (transmissionId != null) url.searchParams.set("transmission_id", String(transmissionId));

  const fuelTypeId = mapAutoredFuelTypeId(
    String(autored.fuelTypeName ?? autored.fuel_type ?? autored.combustible ?? ""),
  );
  if (fuelTypeId != null) url.searchParams.set("fuel_type_id", String(fuelTypeId));

  const tractionId = mapAutoredTractionId(
    String(autored.tractionName ?? autored.traction ?? autored.traccion ?? ""),
  );
  if (tractionId != null) url.searchParams.set("traction_id", String(tractionId));

  const km = parseKmValue(kilometraje);
  if (km != null) {
    url.searchParams.set("km_min", String(Math.max(0, km - 20_000)));
    url.searchParams.set("km_max", String(km + 20_000));
  }

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
    if (!retry.ok) return null;
    const retryPayload = (await retry.json()) as Record<string, unknown>;
    return extractPublicationAverageFromPayload(retryPayload);
  }

  if (!response.ok) {
    console.warn(`[autored] publication-prices HTTP ${response.status}`);
    return null;
  }

  const payload = (await response.json()) as Record<string, unknown>;
  return extractPublicationAverageFromPayload(payload);
}
