import { createClient } from "@supabase/supabase-js";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import type { CatalogFeed, CatalogItem, CatalogSource } from "@/types/catalog";

const DEFAULT_TABLE = process.env.CATALOG_SUPABASE_TABLE ?? "inventario";
const DEFAULT_SELECT = process.env.CATALOG_SUPABASE_SELECT ?? "*";
const DEFAULT_LIMIT = Number(process.env.CATALOG_LIMIT ?? "60");
const DEFAULT_ORDER_BY = process.env.CATALOG_SUPABASE_ORDER_BY ?? "created_at";
const AUTORED_API_URL = process.env.CATALOG_SOURCE_AUTORED_API_URL;
const AUTORED_MAX_LOOKUPS = Number(process.env.CATALOG_AUTORED_MAX_LOOKUPS ?? "120");
const GLO3D_INVENTORY_POST_URL =
  "https://us-central1-glo3d-c338b.cloudfunctions.net/outbound/api/v1/inventory";
const GLO3D_MAX_PAGES = Number(process.env.GLO3D_MAX_PAGES ?? "8");
const GLO3D_IFRAME_NOVA_BASE = "https://glo3d.net/iframeNova";
const GLO3D_IFRAME_PARAMS =
  "gallery=true&featurevideos=true&condition=false&interior=false&footerGallery=false&zoom=false&navigationarrows=false&spinicon=basic&font=Roboto&topbarblinking=false&fullscreen=false&load=false&autorotate=false&themetextcolor=black";

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

  const view3dRaw = getStringFromKeys(row, [
    "url_3d",
    "link_3d",
    "visor_3d_url",
    "glo3d_url",
    "iframe_3d",
    "view3d",
    "iframe",
    "iframe_with_params",
    "src",
    "src_with_params",
  ]);
  const parsed3d = extractEmbedUrl(view3dRaw);
  const parsed3dId = extractGlo3dId(parsed3d);
  const view3dUrl = parsed3dId
    ? buildGlo3dIframeNovaUrl(parsed3dId)
    : parsed3d
      ? normalizeGlo3dUrl(parsed3d)
      : undefined;

  const estadoRetiro = getStringFromKeys(row, ["estado_retiro"]);
  const enBodega = estadoRetiro
    ? estadoRetiro.startsWith("en_bodega")
    : undefined;

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
    enBodega,
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
  const apiBase = process.env.CATALOG_SOURCE_API_URL;
  if (!apiBase) return null;

  const token = process.env.CATALOG_SOURCE_API_TOKEN;
  const endpoint =
    apiBase.includes("/api/")
      ? new URL(apiBase)
      : new URL("/api/inventario-publico", apiBase);

  endpoint.searchParams.set(
    "limit",
    process.env.CATALOG_SOURCE_API_LIMIT ?? "500",
  );
  endpoint.searchParams.set(
    "estado",
    process.env.CATALOG_SOURCE_API_ESTADO ?? "en_bodega",
  );
  endpoint.searchParams.set(
    "incluir_historicos",
    process.env.CATALOG_SOURCE_API_INCLUIR_HISTORICOS ?? "true",
  );

  const response = await fetch(endpoint.toString(), {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "x-api-key": token } : {}),
    },
    next: { revalidate: 120 },
  });

  if (!response.ok) {
    throw new Error(
      `CATALOG_SOURCE_API_URL respondió ${response.status}`,
    );
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
  const awsFields = vehicle.aws_campos ?? {};
  const view3dRaw = pickString(awsFields, [
    "iframe_with_params",
    "iframe",
    "src_with_params",
    "src",
    "url_3d",
    "glo3d_url",
  ]);
  const parsed3d = extractEmbedUrl(view3dRaw);
  const parsed3dId = extractGlo3dId(parsed3d);
  const view3dUrl = parsed3dId
    ? buildGlo3dIframeNovaUrl(parsed3dId)
    : parsed3d
      ? normalizeGlo3dUrl(parsed3d)
      : undefined;

  return {
    id,
    title,
    subtitle: subtitle || undefined,
    images: (vehicle.imagenes ?? []).filter((url) => url.startsWith("http")),
    thumbnail: vehicle.imagenes?.[0],
    view3dUrl,
    raw: {
      ...awsFields,
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

function extractGlo3dId(value?: string): string | undefined {
  if (!value) return undefined;
  const s = value.trim();
  if (!s) return undefined;

  const idQuery = s.match(/[?&]id=([^&\s]+)/);
  if (idQuery?.[1]) return idQuery[1];

  const iframePath = s.match(/glo3d\.net\/(?:iframe|iframeNova)\/([^/?\s]+)/);
  if (iframePath?.[1]) return iframePath[1];

  const relativeIframePath = s.match(/(?:^|\/)(?:iframe|iframeNova)\/([^/?\s]+)/);
  if (relativeIframePath?.[1]) return relativeIframePath[1];

  const genericPath = s.match(/glo3d\.net\/([^/?\s]+)(?:\?|$)/);
  if (genericPath?.[1] && !genericPath[1].includes("embed")) return genericPath[1];

  return undefined;
}

function buildGlo3dIframeNovaUrl(id: string): string {
  return `${GLO3D_IFRAME_NOVA_BASE}/${id}?&${GLO3D_IFRAME_PARAMS}`;
}

function normalizeGlo3dUrl(value: string): string {
  if (value.startsWith("//")) return `https:${value}`;
  if (value.startsWith("/")) return `https://glo3d.net${value}`;
  return value;
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

      const glo3dId = extractGlo3dId(embed);
      if (glo3dId) {
        resolved.set(stock, buildGlo3dIframeNovaUrl(glo3dId));
        pending.delete(stock);
        continue;
      }

      if (embed && /(?:iframe|iframeNova)\//i.test(embed)) {
        resolved.set(stock, normalizeGlo3dUrl(embed));
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

function isMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function mergeRawPreferPrimary(
  primaryRaw: Record<string, unknown>,
  fallbackRaw: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...primaryRaw };
  for (const [key, value] of Object.entries(fallbackRaw)) {
    const current = merged[key];
    if (!isMeaningfulValue(current) && isMeaningfulValue(value)) {
      merged[key] = value;
    }
  }
  return merged;
}

function itemNeedsTechnicalFallback(item: CatalogItem): boolean {
  const raw = item.raw as Record<string, unknown>;
  const fieldsToCheck = [
    ["vin", "numero_chasis", "nro_chasis", "chasis"],
    ["kilometraje", "km", "kms", "odometro"],
    ["color", "color_exterior", "color_vehiculo"],
    ["combustible", "tipo_combustible", "fuel"],
    ["transmision", "caja", "tipo_caja"],
    ["traccion", "tipo_traccion"],
    ["aro", "rin", "rines"],
    ["cilindrada", "cc", "motor_cc"],
  ];
  return fieldsToCheck.some((aliases) => !getStringFromKeys(raw, aliases));
}

async function fetchAutoredByPatent(
  patent: string,
): Promise<Record<string, unknown> | null> {
  if (!AUTORED_API_URL) return null;
  const token = process.env.CATALOG_SOURCE_API_TOKEN;
  const url = new URL(AUTORED_API_URL);
  url.searchParams.set("patente", patent);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "x-api-key": token } : {}),
    },
    next: { revalidate: 120 },
  });
  if (!response.ok) return null;

  const payload = (await response.json()) as unknown;
  const rows = extractRowsFromPayload(payload);
  if (rows.length > 0) return rows[0];
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return null;
}

async function enrichWithAutoredFallback(
  items: CatalogItem[],
): Promise<CatalogItem[]> {
  if (!AUTORED_API_URL || items.length === 0) return items;

  const candidates = items
    .map((item) => ({ item, stock: getItemStock(item) }))
    .filter(
      (entry): entry is { item: CatalogItem; stock: string } =>
        !!entry.stock && itemNeedsTechnicalFallback(entry.item),
    )
    .slice(0, AUTORED_MAX_LOOKUPS);

  if (candidates.length === 0) return items;

  const byStock = new Map<string, Record<string, unknown>>();
  for (const entry of candidates) {
    try {
      const autored = await fetchAutoredByPatent(entry.stock);
      if (autored) byStock.set(entry.stock, autored);
    } catch {
      // noop: no bloquea catálogo si Autored falla
    }
  }

  if (byStock.size === 0) return items;

  return items.map((item) => {
    const stock = getItemStock(item);
    if (!stock) return item;
    const autored = byStock.get(stock);
    if (!autored) return item;
    const raw = item.raw as Record<string, unknown>;
    return {
      ...item,
      raw: {
        ...mergeRawPreferPrimary(raw, autored),
        autored,
      },
    };
  });
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
      subtitle: item.subtitle ?? existing.subtitle,
      lot: item.lot ?? existing.lot,
      status: item.status ?? existing.status,
      location: item.location ?? existing.location,
      auctionDate: item.auctionDate ?? existing.auctionDate,
      images: item.images.length > 0 ? item.images : existing.images,
      thumbnail: item.thumbnail ?? existing.thumbnail,
      view3dUrl: item.view3dUrl ?? existing.view3dUrl,
      raw: mergeRawPreferPrimary(
        item.raw as Record<string, unknown>,
        existing.raw as Record<string, unknown>,
      ),
    });
  };

  secondary.forEach(upsert);
  primary.forEach(upsert);
  return Array.from(merged.values());
}

const BODEGA_FILTER_ENABLED =
  (process.env.CATALOG_BODEGA_FILTER ?? "true") !== "false";

function filterEnBodega(items: CatalogItem[]): CatalogItem[] {
  if (!BODEGA_FILTER_ENABLED) return items;

  const hasEstadoRetiro = items.some((item) => item.enBodega !== undefined);
  if (!hasEstadoRetiro) return items;

  return items.filter((item) => item.enBodega === true);
}

export async function getCatalogFeed(): Promise<CatalogFeed> {
  let resolvedSource: CatalogSource = "empty";

  try {
    const apiItems = await fetchFromTasacionesApi();
    if (apiItems && apiItems.length > 0) {
      resolvedSource = "tasaciones-api";
      const awsItems = await fetchFromAwsInventory().catch(() => []);
      const mergedItems = mergeCatalogItems(apiItems, awsItems);
      const enrichedItems = await enrichWithAutoredFallback(mergedItems);
      const stocks = enrichedItems
        .filter((item) => !item.view3dUrl)
        .map(getItemStock)
        .filter((value): value is string => !!value);
      const glo3dMap = await fetchGlo3dByStocks(stocks);

      const itemsWith3d = enrichedItems.map((item) => ({
        ...item,
        view3dUrl:
          item.view3dUrl ??
          glo3dMap.get(getItemStock(item) ?? ""),
      }));
      const filtered = filterEnBodega(itemsWith3d);

      return {
        source: resolvedSource,
        items: filtered,
      };
    }
  } catch (error) {
    console.warn("[catalog] Fallo origen API Tasaciones:", error);
  }

  try {
    const supabaseItems = await fetchFromSupabase();
    const awsItems = await fetchFromAwsInventory().catch(() => []);
    const mergedItems = mergeCatalogItems(supabaseItems, awsItems);
    const enrichedItems = await enrichWithAutoredFallback(mergedItems);

    const stocks = enrichedItems
      .filter((item) => !item.view3dUrl)
      .map(getItemStock)
      .filter((value): value is string => !!value);
    const glo3dMap = await fetchGlo3dByStocks(stocks);
    const itemsWith3d = enrichedItems.map((item) => ({
      ...item,
      view3dUrl:
        item.view3dUrl ??
        glo3dMap.get(getItemStock(item) ?? ""),
    }));
    const filtered = filterEnBodega(itemsWith3d);

    return {
      source: filtered.length > 0 ? "supabase" : "empty",
      items: filtered,
      warning:
        filtered.length === 0
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
