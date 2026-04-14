import { createClient } from "@supabase/supabase-js";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import type { CatalogFeed, CatalogItem, CatalogSource } from "@/types/catalog";

const DEFAULT_TABLE = process.env.CATALOG_SUPABASE_TABLE ?? "inventario";
const DEFAULT_SELECT = process.env.CATALOG_SUPABASE_SELECT ?? "*";
const DEFAULT_LIMIT = Number(process.env.CATALOG_LIMIT ?? "60");
const DEFAULT_ORDER_BY = process.env.CATALOG_SUPABASE_ORDER_BY ?? "created_at";
const GLO3D_INVENTORY_POST_URL =
  "https://us-central1-glo3d-c338b.cloudfunctions.net/outbound/api/v1/inventory";
const GLO3D_MAX_PAGES = Number(process.env.GLO3D_MAX_PAGES ?? "8");

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

function normalizeStock(value?: string): string {
  return (value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "");
}

function extractPatentFromText(value?: string): string | undefined {
  if (!value) return undefined;
  const match = value.toUpperCase().replace(/\s+/g, "").match(/\b([A-Z]{4}[0-9]{2})\b/);
  return match?.[1];
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
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseKey = serviceRoleKey ?? supabaseAnonKey;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Faltan variables de Supabase (URL y/o key)",
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
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

type AwsVehicle = {
  id?: string;
  patente?: string;
  marca?: string;
  modelo?: string;
  ano?: string;
  version?: string;
  descripcion?: string;
  imagenes?: string[];
  aws_campos?: Record<string, unknown>;
};

function flattenObject(obj: unknown, prefix = ""): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (obj == null || typeof obj !== "object" || Array.isArray(obj)) return out;

  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const flatKey = prefix ? `${prefix}_${k}` : k;
    if (v != null && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flattenObject(v, flatKey));
    } else if (v != null && v !== "") {
      out[flatKey] = v;
    }
  }

  return out;
}

function pickString(item: Record<string, unknown>, aliases: string[]): string | undefined {
  const map = new Map<string, unknown>();
  for (const [k, v] of Object.entries(item)) {
    map.set(k.toLowerCase(), v);
  }
  for (const alias of aliases) {
    const value = map.get(alias.toLowerCase());
    const str = typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
    if (str) return str;
  }
  return undefined;
}

function mapAwsItem(item: Record<string, unknown>): AwsVehicle {
  const flat = flattenObject(item);
  const merged = { ...item, ...flat };
  const patente =
    pickString(merged, ["PPU", "ppu", "fields_PPU", "fields_ppu", "patente", "plate", "stock_number"]) ??
    extractPatentFromText(
      Object.values(merged)
        .map((v) => (typeof v === "string" ? v : ""))
        .join(" "),
    );

  const imageCandidates = [
    pickString(merged, ["thumb", "thumbnail_url", "image", "image_url", "foto"]),
    pickString(merged, ["src_with_params", "src"]),
  ].filter(Boolean) as string[];

  return {
    id: pickString(merged, ["id", "product_id", "uuid", "stock_number", "sku"]),
    patente,
    marca: pickString(merged, ["brand", "brand_name", "make", "marca", "original_brand_name"]),
    modelo: pickString(merged, ["model", "modelo", "showName", "original_model_name"]),
    ano: pickString(merged, ["ano", "anio", "year", "fields_year"]),
    version: pickString(merged, ["version", "ver", "trim", "fields_ver"]),
    descripcion: pickString(merged, ["descripcion", "description", "showName", "tipo_de_vehiculo"]),
    imagenes: [...new Set(imageCandidates)],
    aws_campos: flat,
  };
}

function normalizeAwsVehicle(vehicle: AwsVehicle): CatalogItem {
  const id = vehicle.id ?? crypto.randomUUID();
  const patent = normalizeStock(vehicle.patente);
  const title = [vehicle.marca, vehicle.modelo].filter(Boolean).join(" ").trim() || patent || `Vehículo ${id.slice(0, 8)}`;
  const subtitle = [patent, vehicle.ano].filter(Boolean).join(" · ");

  return {
    id,
    title,
    subtitle: subtitle || undefined,
    images: (vehicle.imagenes ?? []).filter((url) => url.startsWith("http")),
    thumbnail: vehicle.imagenes?.[0],
    raw: {
      ...vehicle.aws_campos,
      patente: patent || vehicle.patente,
      descripcion: vehicle.descripcion,
      source: "aws",
    },
  };
}

async function fetchFromAwsInventory(): Promise<CatalogItem[]> {
  const region = process.env.AWS_REGION ?? "us-east-1";
  const tableName = process.env.AWS_DYNAMODB_TABLE ?? "Products";
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const sessionToken = process.env.AWS_SESSION_TOKEN;

  if (!accessKeyId || !secretAccessKey) return [];

  const client = new DynamoDBClient({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
      ...(sessionToken ? { sessionToken } : {}),
    },
  });
  const docClient = DynamoDBDocumentClient.from(client);

  const rows: Record<string, unknown>[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined = undefined;
  let safety = 0;

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey: lastEvaluatedKey,
        Limit: 1000,
      }),
    );
    rows.push(...((result.Items ?? []) as Record<string, unknown>[]));
    lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    safety += 1;
  } while (lastEvaluatedKey && safety < 20);

  return rows.map(mapAwsItem).map(normalizeAwsVehicle);
}

function extractEmbedUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const raw = value.trim();
  if (!raw) return undefined;
  if (raw.startsWith("http")) return raw.replace(/\$.*$/, "");
  const match = raw.match(/src=["']([^"']+)["']/);
  return match?.[1];
}

async function fetchGlo3dByStocks(stocks: string[]): Promise<Map<string, string>> {
  const username = process.env.GLO3D_API_USERNAME ?? process.env.VITE_GLO3D_API_USERNAME;
  const password = process.env.GLO3D_API_PASSWORD ?? process.env.VITE_GLO3D_API_PASSWORD;
  if (!username || !password || stocks.length === 0) return new Map();

  const pending = new Set(stocks.map(normalizeStock).filter(Boolean));
  const resolved = new Map<string, string>();
  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;

  let page = 0;
  while (page < GLO3D_MAX_PAGES && pending.size > 0) {
    const body = page === 0 ? JSON.stringify({ pageSize: 200 }) : JSON.stringify({ page, pageSize: 200 });
    const response = await fetch(GLO3D_INVENTORY_POST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: authHeader,
      },
      body,
      cache: "no-store",
    });
    if (!response.ok) break;

    const payload = (await response.json()) as {
      data?: Array<Record<string, unknown>>;
      remaining?: number;
    };

    const data = payload.data ?? [];
    for (const item of data) {
      const stock = normalizeStock(
        getStringFromKeys(item, ["stock_number", "stock", "PPU", "patente"]),
      );
      if (!stock || !pending.has(stock)) continue;

      const embed =
        extractEmbedUrl(item.src_with_params) ??
        extractEmbedUrl(item.src) ??
        extractEmbedUrl(item.iframe_with_params) ??
        extractEmbedUrl(item.iframe);
      if (embed) {
        resolved.set(stock, embed);
        pending.delete(stock);
      }
    }

    if ((payload.remaining ?? 0) <= 0 || data.length === 0) break;
    page += 1;
  }

  return resolved;
}

function getItemStock(item: CatalogItem): string | undefined {
  const raw = item.raw as Record<string, unknown>;
  return normalizeStock(
    getStringFromKeys(raw, ["patente", "PPU", "stock_number", "stock", "sku"]) ??
      extractPatentFromText(item.subtitle) ??
      extractPatentFromText(item.title),
  );
}

function getPublicGlo3dUrl(stock?: string): string | undefined {
  const normalized = normalizeStock(stock);
  if (!normalized) return undefined;
  return `https://glo3d.net/embed?stock=${encodeURIComponent(normalized)}`;
}

function mergeCatalogItems(primary: CatalogItem[], secondary: CatalogItem[]): CatalogItem[] {
  const merged = new Map<string, CatalogItem>();

  const upsert = (item: CatalogItem) => {
    const key = getItemStock(item) || item.id;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, item);
      return;
    }

    merged.set(key, {
      ...existing,
      ...item,
      subtitle: existing.subtitle ?? item.subtitle,
      lot: existing.lot ?? item.lot,
      status: existing.status ?? item.status,
      location: existing.location ?? item.location,
      auctionDate: existing.auctionDate ?? item.auctionDate,
      images: existing.images.length > 0 ? existing.images : item.images,
      thumbnail: existing.thumbnail ?? item.thumbnail,
      view3dUrl: existing.view3dUrl ?? item.view3dUrl,
      raw: { ...item.raw, ...existing.raw },
    });
  };

  secondary.forEach(upsert);
  primary.forEach(upsert);
  return Array.from(merged.values());
}

export async function getCatalogFeed(): Promise<CatalogFeed> {
  let resolvedSource: CatalogSource = "empty";

  try {
    const apiItems = await fetchFromTasacionesApi();
    if (apiItems && apiItems.length > 0) {
      resolvedSource = "tasaciones-api";
      const awsItems = await fetchFromAwsInventory().catch(() => []);
      const mergedItems = mergeCatalogItems(apiItems, awsItems);
      const stocks = mergedItems
        .filter((item) => !item.view3dUrl)
        .map(getItemStock)
        .filter((value): value is string => !!value);
      const glo3dMap = await fetchGlo3dByStocks(stocks);

      return {
        source: resolvedSource,
        items: mergedItems.map((item) => ({
          ...item,
          view3dUrl:
            item.view3dUrl ??
            glo3dMap.get(getItemStock(item) ?? "") ??
            getPublicGlo3dUrl(getItemStock(item)),
        })),
      };
    }
  } catch (error) {
    console.warn("[catalog] Fallo origen API Tasaciones:", error);
  }

  try {
    const supabaseItems = await fetchFromSupabase();
    const awsItems = await fetchFromAwsInventory().catch(() => []);
    const mergedItems = mergeCatalogItems(supabaseItems, awsItems);

    const stocks = mergedItems
      .filter((item) => !item.view3dUrl)
      .map(getItemStock)
      .filter((value): value is string => !!value);
    const glo3dMap = await fetchGlo3dByStocks(stocks);
    const itemsWith3d = mergedItems.map((item) => ({
      ...item,
      view3dUrl:
        item.view3dUrl ??
        glo3dMap.get(getItemStock(item) ?? "") ??
        getPublicGlo3dUrl(getItemStock(item)),
    }));

    return {
      source: itemsWith3d.length > 0 ? "supabase" : "empty",
      items: itemsWith3d,
      warning:
        itemsWith3d.length === 0
          ? "No hay inventario disponible por ahora."
          : undefined,
    };
  } catch (error) {
    return {
      source: "empty",
      items: [],
      warning:
        error instanceof Error
          ? `No fue posible cargar inventario en este momento. ${error.message}`
          : "No fue posible cargar inventario.",
    };
  }
}

export function sourceLabel(source: CatalogSource): string {
  if (source === "tasaciones-api") return "Tasaciones API";
  if (source === "supabase") return "Supabase";
  return "Sin datos";
}
