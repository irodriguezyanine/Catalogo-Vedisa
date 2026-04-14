import { createClient } from "@supabase/supabase-js";
import type { CatalogFeed, CatalogItem, CatalogSource } from "@/types/catalog";

const DEFAULT_TABLE = process.env.CATALOG_SUPABASE_TABLE ?? "inventario";
const DEFAULT_SELECT = process.env.CATALOG_SUPABASE_SELECT ?? "*";
const DEFAULT_LIMIT = Number(process.env.CATALOG_LIMIT ?? "60");
const DEFAULT_ORDER_BY = process.env.CATALOG_SUPABASE_ORDER_BY ?? "created_at";

function getStringFromKeys(
  row: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number") {
      return String(value);
    }
  }
  return undefined;
}

function tryParseJsonArray(value: string): unknown[] | undefined {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function normalizeImageList(value: unknown): string[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => {
        if (typeof entry === "string") return [entry.trim()];
        if (typeof entry === "object" && entry !== null) {
          const obj = entry as Record<string, unknown>;
          const maybeUrl =
            getStringFromKeys(obj, ["url", "src", "href", "imagen", "image"]) ??
            "";
          return maybeUrl ? [maybeUrl] : [];
        }
        return [];
      })
      .filter(Boolean);
  }

  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return [];

    const parsedArray = tryParseJsonArray(raw);
    if (parsedArray) {
      return normalizeImageList(parsedArray);
    }

    return raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part) => part.startsWith("http"));
  }

  return [];
}

function normalizeRow(row: Record<string, unknown>): CatalogItem | null {
  const id =
    getStringFromKeys(row, ["id", "uuid", "vehicle_id", "inventario_id"]) ??
    crypto.randomUUID();

  const title =
    getStringFromKeys(row, [
      "titulo",
      "nombre",
      "nombre_vehiculo",
      "vehiculo",
      "marca_modelo",
      "modelo",
      "patente",
    ]) ?? `Vehículo ${id.slice(0, 8)}`;

  const subtitle = getStringFromKeys(row, [
    "patente",
    "anio",
    "categoria",
    "tipo_vehiculo",
    "descripcion",
  ]);

  const lot = getStringFromKeys(row, [
    "lote",
    "numero_lote",
    "lot",
    "numero_remate",
  ]);

  const status = getStringFromKeys(row, ["estado_remate", "estado", "status"]);
  const location = getStringFromKeys(row, [
    "sucursal",
    "ciudad",
    "direccion",
    "ubicacion",
  ]);
  const auctionDate = getStringFromKeys(row, [
    "fecha_remate",
    "fecha_publicacion",
    "auction_date",
  ]);

  const imageCandidates = [
    row.fotos_urls,
    row.fotos,
    row.galeria,
    row.galeria_fotos,
    row.images,
    row.imagenes,
    row.photos,
    row.photo_urls,
  ];

  const images = imageCandidates.flatMap((candidate) =>
    normalizeImageList(candidate),
  );

  const thumbnail =
    getStringFromKeys(row, ["thumbnail", "imagen_principal", "foto_portada"]) ??
    images[0];

  const view3dUrl = getStringFromKeys(row, [
    "url_3d",
    "link_3d",
    "visor_3d_url",
    "glo3d_url",
    "iframe_3d",
    "view3d",
  ]);

  return {
    id,
    title,
    subtitle,
    lot,
    status,
    location,
    auctionDate,
    images,
    thumbnail,
    view3dUrl,
    raw: row,
  };
}

function extractRowsFromPayload(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter(
      (entry): entry is Record<string, unknown> =>
        typeof entry === "object" && entry !== null,
    );
  }

  if (typeof payload === "object" && payload !== null) {
    const container = payload as Record<string, unknown>;
    const nestedArray =
      (Array.isArray(container.items) && container.items) ||
      (Array.isArray(container.data) && container.data) ||
      (Array.isArray(container.results) && container.results);

    if (nestedArray) {
      return nestedArray.filter(
        (entry): entry is Record<string, unknown> =>
          typeof entry === "object" && entry !== null,
      );
    }
  }

  return [];
}

async function fetchFromTasacionesApi(): Promise<CatalogItem[] | null> {
  const apiUrl = process.env.CATALOG_SOURCE_API_URL;
  if (!apiUrl) return null;

  const token = process.env.CATALOG_SOURCE_API_TOKEN;
  const response = await fetch(apiUrl, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    throw new Error(`CATALOG_SOURCE_API_URL respondió ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  const rows = extractRowsFromPayload(payload);
  return rows.map(normalizeRow).filter((item): item is CatalogItem => !!item);
}

async function fetchFromSupabase(): Promise<CatalogItem[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL y/o NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  let query = supabase.from(DEFAULT_TABLE).select(DEFAULT_SELECT).limit(DEFAULT_LIMIT);

  if (DEFAULT_ORDER_BY) {
    query = query.order(DEFAULT_ORDER_BY, { ascending: false });
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const rawRows = (data ?? []) as unknown[];
  const rows = rawRows.filter(
    (entry): entry is Record<string, unknown> =>
      typeof entry === "object" && entry !== null && !Array.isArray(entry),
  );
  return rows.map(normalizeRow).filter((item): item is CatalogItem => !!item);
}

export async function getCatalogFeed(): Promise<CatalogFeed> {
  try {
    const apiItems = await fetchFromTasacionesApi();
    if (apiItems && apiItems.length > 0) {
      return {
        source: "tasaciones-api",
        items: apiItems,
      };
    }
  } catch (error) {
    console.warn("[catalog] Fallo origen API Tasaciones:", error);
  }

  try {
    const supabaseItems = await fetchFromSupabase();
    return {
      source: supabaseItems.length > 0 ? "supabase" : "empty",
      items: supabaseItems,
      warning:
        supabaseItems.length === 0
          ? "No llegaron registros desde Supabase."
          : undefined,
    };
  } catch (error) {
    return {
      source: "empty",
      items: [],
      warning:
        error instanceof Error
          ? `No fue posible cargar inventario: ${error.message}`
          : "No fue posible cargar inventario.",
    };
  }
}

export function sourceLabel(source: CatalogSource): string {
  if (source === "tasaciones-api") return "Tasaciones API";
  if (source === "supabase") return "Supabase";
  return "Sin datos";
}
