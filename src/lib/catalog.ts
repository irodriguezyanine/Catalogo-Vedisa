import { createClient } from "@supabase/supabase-js";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import type { CatalogFeed, CatalogItem, CatalogSource } from "@/types/catalog";

const DEFAULT_TABLE = process.env.CATALOG_SUPABASE_TABLE ?? "inventario";
const DEFAULT_SELECT = process.env.CATALOG_SUPABASE_SELECT ?? "*";
// Catálogo debe reflejar eventos sincronizados completos; 60 filas era insuficiente
// para asignar vehículos de remates/vtas directas históricamente cargados.
const DEFAULT_LIMIT = Number(process.env.CATALOG_LIMIT ?? "500");
const DEFAULT_ORDER_BY = process.env.CATALOG_SUPABASE_ORDER_BY ?? "created_at";
const AUTORED_API_URL = process.env.CATALOG_SOURCE_AUTORED_API_URL;
const AUTORED_MAX_LOOKUPS = Number(process.env.CATALOG_AUTORED_MAX_LOOKUPS ?? "1000");
const GLO3D_INVENTORY_POST_URL =
  "https://us-central1-glo3d-c338b.cloudfunctions.net/outbound/api/v1/inventory";
const GLO3D_MAX_PAGES = Number(process.env.GLO3D_MAX_PAGES ?? "8");
const GLO3D_REFRESH_MAX_PAGES = Number(process.env.GLO3D_REFRESH_MAX_PAGES ?? "12");
const GLO3D_PAGE_CACHE_TTL_MS = 120_000;
const GLO3D_PATENT_CACHE_TTL_MS = 300_000;

type Glo3dPagePayload = {
  data: Array<Record<string, unknown>>;
  remaining: number;
  ok: boolean;
  rateLimited?: boolean;
};

const glo3dPageCache = new Map<string, { expires: number; payload: Glo3dPagePayload }>();
const glo3dPatentCache = new Map<string, { expires: number; entry: Glo3dInventoryEntry | null }>();

function getGlo3dCredentials(): { username: string; password: string } | null {
  const username =
    process.env.GLO3D_API_USERNAME ??
    process.env.VITE_GLO3D_API_USERNAME ??
    process.env.NEXT_PUBLIC_GLO3D_API_USERNAME;
  const password =
    process.env.GLO3D_API_PASSWORD ??
    process.env.VITE_GLO3D_API_PASSWORD ??
    process.env.NEXT_PUBLIC_GLO3D_API_PASSWORD;
  if (!username || !password) return null;
  return { username, password };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
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

export function catalogRowToItem(row: Record<string, unknown>): CatalogItem | null {
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
    "incluir_historicos",
    process.env.CATALOG_SOURCE_API_INCLUIR_HISTORICOS ?? "false",
  );
  const estadoFilter = process.env.CATALOG_SOURCE_API_ESTADO?.trim();
  if (estadoFilter) {
    endpoint.searchParams.set("estado", estadoFilter);
  }

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
  return rows.map(catalogRowToItem).filter((item): item is CatalogItem => !!item);
}

function normalizePatentLookup(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "").replace(/-/g, "");
}

export async function fetchInventarioRowByPatent(
  patent: string,
): Promise<Record<string, unknown> | null> {
  const normalized = normalizePatentLookup(patent);
  if (!normalized) return null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  const supabaseKey = serviceRoleKey ?? supabaseAnonKey;
  if (!supabaseUrl || !supabaseKey) return null;

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const table = process.env.CATALOG_SUPABASE_TABLE ?? "inventario";
  const { data } = await supabase
    .from(table)
    .select("*")
    .eq("patente", normalized)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data || typeof data !== "object") return null;
  return data as Record<string, unknown>;
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
  return rows.map(catalogRowToItem).filter((item): item is CatalogItem => !!item);
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

function pickScalarString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return undefined;
}

function normalizeCustomSpecKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function extractCustomSpecFieldMap(raw: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const visited = new Set<unknown>();

  const visit = (node: unknown): void => {
    if (node == null || typeof node !== "object") return;
    if (visited.has(node)) return;
    visited.add(node);

    if (Array.isArray(node)) {
      for (const entry of node) {
        if (entry && typeof entry === "object" && !Array.isArray(entry)) {
          const record = entry as Record<string, unknown>;
          const keyRaw =
            pickScalarString(record.abbreviation) ??
            pickScalarString(record.abbrev) ??
            pickScalarString(record.short_name) ??
            pickScalarString(record.key) ??
            pickScalarString(record.code) ??
            pickScalarString(record.name) ??
            pickScalarString(record.label) ??
            pickScalarString(record.title) ??
            pickScalarString(record.item);
          const valueRaw =
            pickScalarString(record.value) ??
            pickScalarString(record.field_value) ??
            pickScalarString(record.val) ??
            pickScalarString(record.content) ??
            pickScalarString(record.text) ??
            pickScalarString(record.display_value) ??
            (record.value && typeof record.value === "object"
              ? pickScalarString((record.value as Record<string, unknown>).value)
              : undefined);

          if (keyRaw && valueRaw) {
            const normalizedKey = normalizeCustomSpecKey(keyRaw);
            const literalKey = keyRaw.trim().toLowerCase();
            if (normalizedKey && !(normalizedKey in result)) result[normalizedKey] = valueRaw;
            if (literalKey && !(literalKey in result)) result[literalKey] = valueRaw;
          }
        }
        visit(entry);
      }
      return;
    }

    for (const value of Object.values(node as Record<string, unknown>)) {
      visit(value);
    }
  };

  visit(raw);
  return result;
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

export type Glo3dInventoryEntry = {
  view3dUrl?: string;
  technicalFields: Record<string, unknown>;
  raw: Record<string, unknown>;
};

function normalizeGlo3dTechnicalFields(
  glo3dRaw: Record<string, unknown>,
): Record<string, unknown> {
  const flat = flattenObject(glo3dRaw);
  const customSpecFields = extractCustomSpecFieldMap(glo3dRaw);
  const merged = { ...glo3dRaw, ...flat, ...customSpecFields };
  const result: Record<string, unknown> = {};

  const patenteVerifier = pickString(merged, [
    "patente_verifier",
    "patente_dv",
    "ppu_dv",
    "dv",
    "verificador",
  ]);
  const marca = pickString(merged, ["marca", "brand", "make", "original_brand_name"]);
  const tipo = pickString(merged, ["tipo", "type", "condition_type", "tipo_unidad"]);
  const modelo = pickString(merged, [
    "modelo",
    "model",
    "original_model_name",
    "showName",
    "model2",
  ]);
  const version = pickString(merged, ["version", "ver", "trim"]);
  const color = pickString(merged, ["color", "color_exterior", "color_vehiculo", "exterior_color"]);
  const combustible = pickString(merged, ["combustible", "tipo_combustible", "fuel", "fuel_type"]);
  const llaves = pickString(merged, ["llaves", "keys", "has_keys", "tiene_llaves", "lla"]);
  const transmision = pickString(merged, [
    "transmision",
    "transmisión",
    "caja",
    "tipo_caja",
    "transmission",
    "gearbox",
  ]);
  const traccion = pickString(merged, [
    "traccion",
    "tracción",
    "tipo_traccion",
    "drivetrain",
    "traction",
    "drive_type",
  ]);
  const aireAcondicionado = pickString(merged, [
    "aire_acondicionado",
    "ac",
    "air_conditioning",
    "has_ac",
  ]);
  const unicoPropietario = pickString(merged, [
    "unico_propietario",
    "único_propietario",
    "single_owner",
    "one_owner",
  ]);
  const condicionado = pickString(merged, [
    "condicionado",
    "conditioned",
    "acondicionado",
  ]);
  const ano = pickString(merged, ["ano", "anio", "year", "fields_year"]);
  const patente = pickString(merged, ["patente", "PPU", "ppu", "plate", "stock_number"]);
  const nombrePropietarioAnterior = pickString(merged, [
    "nombre_propietario_anterior",
    "previous_owner_name",
    "owner_previous_name",
    "npa",
  ]);
  const rutPropietarioAnterior = pickString(merged, [
    "rut_propietario_anterior",
    "previous_owner_rut",
    "owner_previous_rut",
    "rpa",
  ]);
  const rutVerificador = pickString(merged, [
    "rut_verificador",
    "verifier_rut",
    "rut_verifier",
    "rut_verificador_dv",
  ]);
  const cilindrada = pickString(merged, ["cilindrada", "cc", "motor_cc", "engine_cc"]);
  const nMotor = pickString(merged, ["n_de_motor", "numero_motor", "motor_number", "ndm"]);
  const nSerie = pickString(merged, ["n_de_serie", "numero_serie", "serial_number", "nds"]);
  const nVin = pickString(merged, ["n_de_vin", "vin", "numero_chasis", "nro_chasis"]);
  const nChasis = pickString(merged, ["n_de_chasis", "numero_chasis", "nro_chasis"]);
  const nSiniestro = pickString(merged, [
    "n_de_siniestro",
    "numero_siniestro",
    "numero_de_siniestro",
    "n_siniestro",
    "n_s",
    "ns",
    "n°s",
  ]);
  const ubicacionFisica = pickString(merged, ["ubicacion_fisica", "ubicacion", "ubi", "location"]);
  const transportista = pickString(merged, ["transportista", "tra"]);
  const taller = pickString(merged, ["taller", "tal"]);
  const multas = pickString(merged, ["multas", "mul"]);
  const tag = pickString(merged, ["tag"]);
  const vencRevisionTecnica = pickString(merged, [
    "vencimiento_revision_tecnica",
    "revision_tecnica_vencimiento",
    "vrt",
  ]);
  const vencPermisoCirculacion = pickString(merged, [
    "vencimiento_permiso_circulacion",
    "permiso_circulacion_vencimiento",
    "vpc",
  ]);
  const vencSeguroObligatorio = pickString(merged, [
    "vencimiento_seguro_obligatorio",
    "seguro_obligatorio_vencimiento",
    "vso",
  ]);
  const pruebaMotor = pickString(merged, ["prueba_motor", "prueba_motor_arranca", "pdm"]);
  const pruebaDesplazamiento = pickString(merged, [
    "prueba_desplazamiento",
    "prueba_desplazamiento_mueve",
    "pdd",
  ]);
  const estadoAirbags = pickString(merged, ["estado_airbags", "airbags_estado", "eda"]);
  const tipoVehiculo = pickString(merged, [
    "tipo_de_vehiculo",
    "tipo_vehiculo",
    "vehicle_type",
    "vehicle_type_name",
  ]);

  if (patente) {
    result.patente = patente;
    result.ppu = patente;
  }
  if (patenteVerifier) result.patente_verifier = patenteVerifier;
  if (marca) result.marca = marca;
  if (tipo) result.tipo = tipo;
  if (modelo) result.modelo = modelo;
  if (version) {
    result.version = version;
    result.ver = version;
    result.trim = version;
  }
  if (color) result.color = color;
  if (combustible) result.combustible = combustible;
  if (llaves) result.llaves = llaves;
  if (transmision) {
    result.transmision = transmision;
    result.caja = transmision;
  }
  if (traccion) result.traccion = traccion;
  if (aireAcondicionado) result.aire_acondicionado = aireAcondicionado;
  if (unicoPropietario) result.unico_propietario = unicoPropietario;
  if (condicionado) result.condicionado = condicionado;
  if (ano) {
    result.ano = ano;
    result.anio = ano;
    result.year = ano;
  }
  if (nombrePropietarioAnterior) result.nombre_propietario_anterior = nombrePropietarioAnterior;
  if (rutPropietarioAnterior) result.rut_propietario_anterior = rutPropietarioAnterior;
  if (rutVerificador) result.rut_verificador = rutVerificador;
  if (nMotor) {
    result.n_de_motor = nMotor;
    result.ndm = nMotor;
  }
  if (nSerie) {
    result.n_de_serie = nSerie;
    result.nds = nSerie;
  }
  if (nVin) result.n_de_vin = nVin;
  if (nChasis) result.n_de_chasis = nChasis;
  if (nSiniestro) {
    result.n_de_siniestro = nSiniestro;
    result.n_s = nSiniestro;
    result.ns = nSiniestro;
  }
  if (ubicacionFisica) {
    result.ubicacion_fisica = ubicacionFisica;
    result.ubi = ubicacionFisica;
  }
  if (transportista) {
    result.transportista = transportista;
    result.tra = transportista;
  }
  if (taller) {
    result.taller = taller;
    result.tal = taller;
  }
  if (multas) {
    result.multas = multas;
    result.mul = multas;
  }
  if (tag) result.tag = tag;
  if (vencRevisionTecnica) {
    result.vencimiento_revision_tecnica = vencRevisionTecnica;
    result.vrt = vencRevisionTecnica;
  }
  if (vencPermisoCirculacion) {
    result.vencimiento_permiso_circulacion = vencPermisoCirculacion;
    result.vpc = vencPermisoCirculacion;
  }
  if (vencSeguroObligatorio) {
    result.vencimiento_seguro_obligatorio = vencSeguroObligatorio;
    result.vso = vencSeguroObligatorio;
  }
  if (pruebaMotor) {
    result.prueba_motor = pruebaMotor;
    result.pdm = pruebaMotor;
  }
  if (pruebaDesplazamiento) {
    result.prueba_desplazamiento = pruebaDesplazamiento;
    result.pdd = pruebaDesplazamiento;
  }
  if (estadoAirbags) {
    result.estado_airbags = estadoAirbags;
    result.eda = estadoAirbags;
  }
  if (cilindrada) {
    result.cilindrada = cilindrada;
    result.cc = cilindrada;
  }
  if (tipoVehiculo) {
    result.tipo_de_vehiculo = tipoVehiculo;
    result.tipo_vehiculo = tipoVehiculo;
  }

  return result;
}

function collectPatentCandidatesFromUnknown(node: unknown, out: Set<string>): void {
  if (node == null) return;
  if (typeof node === "string") {
    const compact = normalizeStock(node);
    if (/^[A-Z]{4}\d{2}$/.test(compact)) out.add(compact);
    const fromText = extractPatentFromText(node);
    if (fromText) out.add(fromText);
    return;
  }
  if (Array.isArray(node)) {
    for (const entry of node) collectPatentCandidatesFromUnknown(entry, out);
    return;
  }
  if (typeof node === "object") {
    for (const value of Object.values(node as Record<string, unknown>)) {
      collectPatentCandidatesFromUnknown(value, out);
    }
  }
}

function extractPatentFromGlo3dItem(item: Record<string, unknown>): string | undefined {
  const technicalFields = normalizeGlo3dTechnicalFields(item);
  const customSpecFields = extractCustomSpecFieldMap(item);
  const merged = { ...item, ...technicalFields, ...customSpecFields };

  const direct = normalizeStock(
    getStringFromKeys(merged, [
      "stock_number",
      "stock",
      "PPU",
      "ppu",
      "patente",
      "plate",
      "license_plate",
    ]) ?? pickString(merged, ["patente", "ppu", "stock_number", "plate"]),
  );
  if (/^[A-Z]{4}\d{2}$/.test(direct)) return direct;

  const fromText = [
    pickString(merged, ["showName", "name", "title", "description"]),
    pickString(customSpecFields, ["ppu", "patente", "plate"]),
  ]
    .map((value) => extractPatentFromText(value))
    .find((value): value is string => !!value);
  if (fromText) return fromText;

  const candidates = new Set<string>();
  collectPatentCandidatesFromUnknown(item, candidates);
  return candidates.values().next().value;
}

function glo3dItemMatchesPatent(item: Record<string, unknown>, target: string): boolean {
  const candidates = new Set<string>();
  collectPatentCandidatesFromUnknown(item, candidates);
  if (candidates.has(target)) return true;
  const stock = normalizeStock(
    getStringFromKeys(item, ["stock_number", "stock", "PPU", "ppu", "patente", "plate"]) ?? "",
  );
  return stock === target;
}

function glo3dRawContainsNeedle(item: Record<string, unknown>, target: string): boolean {
  return JSON.stringify(item).toUpperCase().includes(target);
}

function stampGlo3dEntryPatent(entry: Glo3dInventoryEntry, patente: string): Glo3dInventoryEntry {
  const raw = { ...(entry.raw as Record<string, unknown>), patente, ppu: patente, stock_number: patente };
  return {
    ...entry,
    technicalFields: {
      ...entry.technicalFields,
      patente,
      ppu: patente,
      stock_number: patente,
    },
    raw,
  };
}

function glo3dEntryToCatalogRow(patente: string, entry: Glo3dInventoryEntry): Record<string, unknown> {
  const fields = entry.technicalFields;
  const raw = entry.raw as Record<string, unknown>;
  const thumb =
    pickString(raw, ["thumb", "thumbnail_url", "image", "image_url", "foto", "thumbnail"]) ??
    pickString(fields, ["thumb", "thumbnail_url", "image", "image_url", "foto"]);
  const imagenes = thumb && thumb.startsWith("http") ? [thumb] : [];
  return {
    patente,
    stock_number: patente,
    PPU: patente,
    marca: pickString(fields, ["marca", "brand", "make"]) ?? "Sin Marca",
    modelo: pickString(fields, ["modelo", "model", "model2"]) ?? "Sin Modelo",
    ano: pickString(fields, ["ano", "anio", "year"]),
    version: pickString(fields, ["version", "trim", "ver"]),
    kilometraje: pickString(fields, ["kilometraje", "km", "odometro", "odometer"]),
    descripcion: pickString(fields, ["descripcion", "description"]),
    imagenes: imagenes.length > 0 ? imagenes : null,
    glo3d_url: entry.view3dUrl ?? null,
    url_3d: entry.view3dUrl ?? null,
    visor_3d_url: entry.view3dUrl ?? null,
    glo3d: raw,
    origen: "glo3d",
    estado_retiro: "en_tasacion",
    categoria: (pickString(fields, ["categoria", "tipo_vehiculo", "tipo_de_vehiculo"]) ?? "vehiculo_liviano").toLowerCase(),
  };
}

function buildGlo3dEntryFromRaw(item: Record<string, unknown>): Glo3dInventoryEntry | null {
  const technicalFields = normalizeGlo3dTechnicalFields(item);
  const embed =
    extractEmbedUrl(item.src_with_params) ??
    extractEmbedUrl(item.src) ??
    extractEmbedUrl(item.iframe_with_params) ??
    extractEmbedUrl(item.iframe);
  const glo3dId = extractGlo3dId(embed);
  const fallbackView3d = pickString(item, [
    "url_3d",
    "glo3d_url",
    "iframe",
    "iframe_with_params",
    "src",
    "src_with_params",
  ]);
  const view3dUrlFromRaw = extractEmbedUrl(fallbackView3d);

  if (glo3dId) {
    const view3dUrl = buildGlo3dIframeNovaUrl(glo3dId);
    return {
      view3dUrl,
      technicalFields: { ...technicalFields, foto3d: view3dUrl },
      raw: item,
    };
  }
  if (embed && /(?:iframe|iframeNova)\//i.test(embed)) {
    const view3dUrl = normalizeGlo3dUrl(embed);
    return {
      view3dUrl,
      technicalFields: { ...technicalFields, foto3d: view3dUrl },
      raw: item,
    };
  }
  return {
    view3dUrl: view3dUrlFromRaw,
    technicalFields: view3dUrlFromRaw
      ? { ...technicalFields, foto3d: view3dUrlFromRaw }
      : technicalFields,
    raw: item,
  };
}

async function fetchGlo3dInventoryPage(page: number, search?: string): Promise<Glo3dPagePayload> {
  const credentials = getGlo3dCredentials();
  if (!credentials) {
    return { data: [], remaining: 0, ok: false };
  }

  const cacheKey = `${page}:${(search ?? "").trim().toUpperCase()}`;
  const cached = glo3dPageCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.payload;
  }

  const authHeader = `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")}`;
  const body =
    page === 0
      ? JSON.stringify(
          search?.trim()
            ? { pageSize: 200, search: search.trim(), query: search.trim() }
            : { pageSize: 200 },
        )
      : JSON.stringify(
          search?.trim()
            ? { page, pageSize: 200, search: search.trim(), query: search.trim() }
            : { page, pageSize: 200 },
        );

  for (let attempt = 0; attempt < 4; attempt += 1) {
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

    if (response.status === 429) {
      await sleep(900 * (attempt + 1));
      continue;
    }

    if (!response.ok) {
      return { data: [], remaining: 0, ok: false, rateLimited: response.status === 429 };
    }

    const payload = (await response.json()) as {
      data?: Array<Record<string, unknown>>;
      remaining?: number;
    };
    const result: Glo3dPagePayload = {
      data: payload.data ?? [],
      remaining: payload.remaining ?? 0,
      ok: true,
    };
    glo3dPageCache.set(cacheKey, { expires: Date.now() + GLO3D_PAGE_CACHE_TTL_MS, payload: result });
    return result;
  }

  return { data: [], remaining: 0, ok: false, rateLimited: true };
}

function resolveGlo3dEntryFromPageItems(
  items: Array<Record<string, unknown>>,
  target: string,
): Glo3dInventoryEntry | null {
  for (const item of items) {
    if (!glo3dItemMatchesPatent(item, target) && !glo3dRawContainsNeedle(item, target)) continue;
    const entry = buildGlo3dEntryFromRaw(item);
    if (entry) return stampGlo3dEntryPatent(entry, target);
  }
  if (items.length === 1) {
    const entry = buildGlo3dEntryFromRaw(items[0]);
    if (entry) return stampGlo3dEntryPatent(entry, target);
  }
  return null;
}

async function fetchGlo3dByPatentScan(patent: string): Promise<Glo3dInventoryEntry | null> {
  const target = normalizeStock(patent);
  if (!target) return null;

  for (const query of [target, target.toLowerCase()]) {
    let page = 0;
    while (page < 4) {
      const payload = await fetchGlo3dInventoryPage(page, query);
      if (!payload.ok) break;
      const resolved = resolveGlo3dEntryFromPageItems(payload.data, target);
      if (resolved) return resolved;
      if (payload.remaining <= 0 || payload.data.length === 0) break;
      page += 1;
    }
  }

  let page = 0;
  while (page < 8) {
    const payload = await fetchGlo3dInventoryPage(page);
    if (!payload.ok) break;
    const resolved = resolveGlo3dEntryFromPageItems(payload.data, target);
    if (resolved) return resolved;
    if (payload.remaining <= 0 || payload.data.length === 0) break;
    page += 1;
  }

  return null;
}

export async function fetchGlo3dRecordByPatent(
  patent: string,
): Promise<Glo3dInventoryEntry | null> {
  const stock = normalizeStock(patent);
  if (!stock) return null;

  const cached = glo3dPatentCache.get(stock);
  if (cached && cached.expires > Date.now()) {
    return cached.entry;
  }

  const fromScan = await fetchGlo3dByPatentScan(stock);
  glo3dPatentCache.set(stock, { expires: Date.now() + GLO3D_PATENT_CACHE_TTL_MS, entry: fromScan });
  return fromScan;
}

export async function appendGlo3dOnlyCatalogItems(items: CatalogItem[]): Promise<CatalogItem[]> {
  const known = new Set(
    items
      .map(getItemStock)
      .filter((value): value is string => !!value)
      .map((value) => normalizeStock(value)),
  );
  const extra: CatalogItem[] = [];

  let page = 0;
  while (page < GLO3D_REFRESH_MAX_PAGES) {
    const payload = await fetchGlo3dInventoryPage(page);
    if (!payload.ok) break;

    for (const raw of payload.data) {
      const patente =
        extractPatentFromGlo3dItem(raw) ??
        normalizeStock(getStringFromKeys(raw, ["stock_number", "stock", "PPU", "ppu"]) ?? "");
      if (!patente || !/^[A-Z]{4}\d{2}$/.test(patente) || known.has(patente)) continue;

      const entry = buildGlo3dEntryFromRaw(raw);
      if (!entry) continue;
      const row = glo3dEntryToCatalogRow(patente, stampGlo3dEntryPatent(entry, patente));
      const item = catalogRowToItem(row);
      if (!item) continue;
      extra.push(item);
      known.add(patente);
    }

    if (payload.remaining <= 0 || payload.data.length === 0) break;
    page += 1;
  }

  if (extra.length === 0) return items;
  return mergeCatalogItems(items, extra);
}

async function fetchGlo3dByStocks(stocks: string[]): Promise<Map<string, Glo3dInventoryEntry>> {
  const credentials = getGlo3dCredentials();
  if (!credentials || stocks.length === 0) return new Map();
  const { username, password } = credentials;

  const pending = new Set(stocks.map(normalizeStock).filter(Boolean));
  const resolved = new Map<string, Glo3dInventoryEntry>();
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
      const stock = extractPatentFromGlo3dItem(item);
      if (!stock || !pending.has(stock)) continue;
      const entry = buildGlo3dEntryFromRaw(item);
      if (!entry) continue;
      resolved.set(stock, entry);
      pending.delete(stock);
    }

    if ((payload.remaining ?? 0) <= 0 || data.length === 0) break;
    page += 1;
  }

  return resolved;
}

async function enrichWithGlo3dInventory(items: CatalogItem[]): Promise<CatalogItem[]> {
  if (items.length === 0) return items;
  const stocks = Array.from(
    new Set(items.map(getItemStock).filter((value): value is string => !!value)),
  );
  if (stocks.length === 0) return items;

  const glo3dMap = await fetchGlo3dByStocks(stocks);
  if (glo3dMap.size === 0) return items;

  return items.map((item) => {
    const stock = getItemStock(item);
    if (!stock) return item;
    const glo3d = glo3dMap.get(stock);
    if (!glo3d) return item;
    const raw = item.raw as Record<string, unknown>;
    return {
      ...item,
      view3dUrl: item.view3dUrl ?? glo3d.view3dUrl,
      raw: {
        ...mergeRawPreferPrimary(raw, glo3d.technicalFields),
        glo3d: glo3d.raw,
      },
    };
  });
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
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    if (
      [
        "-",
        "--",
        "—",
        "n/a",
        "na",
        "s/i",
        "sin info",
        "sin información",
        "sin informacion",
        "no informado",
        "no informa",
      ].includes(normalized)
    ) {
      return false;
    }
    return true;
  }
  return true;
}

function normalizeAutoredTechnicalFields(
  autoredRaw: Record<string, unknown>,
): Record<string, unknown> {
  const flat = flattenObject(autoredRaw);
  const merged = { ...autoredRaw, ...flat };
  const result: Record<string, unknown> = {};

  const vin = pickString(merged, [
    "vin",
    "numero_chasis",
    "nro_chasis",
    "chasis",
    "vehicle_vin",
  ]);
  const kilometraje = pickString(merged, [
    "kilometraje",
    "km",
    "kms",
    "odometro",
    "odómetro",
    "mileage",
    "odometer",
  ]);
  const color = pickString(merged, [
    "color",
    "color_exterior",
    "color_vehiculo",
    "exterior_color",
  ]);
  const combustible = pickString(merged, [
    "combustible",
    "tipo_combustible",
    "fuel",
    "fuel_type",
  ]);
  const transmision = pickString(merged, [
    "transmision",
    "transmisión",
    "caja",
    "tipo_caja",
    "transmission",
    "gearbox",
  ]);
  const traccion = pickString(merged, [
    "traccion",
    "tracción",
    "tipo_traccion",
    "drivetrain",
    "traction",
  ]);
  const aro = pickString(merged, [
    "aro",
    "aro_llanta",
    "rin",
    "rines",
    "wheel_size",
  ]);
  const cilindrada = pickString(merged, [
    "cilindrada",
    "cc",
    "motor_cc",
    "engine_cc",
  ]);

  if (vin) result.vin = vin;
  if (kilometraje) {
    result.kilometraje = kilometraje;
    result.km = kilometraje;
  }
  if (color) result.color = color;
  if (combustible) {
    result.combustible = combustible;
    result.tipo_combustible = combustible;
  }
  if (transmision) {
    result.transmision = transmision;
    result.caja = transmision;
    result.tipo_caja = transmision;
  }
  if (traccion) {
    result.traccion = traccion;
    result.tipo_traccion = traccion;
  }
  if (aro) {
    result.aro = aro;
    result.rin = aro;
  }
  if (cilindrada) {
    result.cilindrada = cilindrada;
    result.cc = cilindrada;
    result.motor_cc = cilindrada;
  }

  return result;
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

export async function fetchAutoredRecordByPatent(
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
    );
  const limitedCandidates =
    AUTORED_MAX_LOOKUPS > 0 ? candidates.slice(0, AUTORED_MAX_LOOKUPS) : candidates;

  if (limitedCandidates.length === 0) return items;

  const byStock = new Map<string, Record<string, unknown>>();
  for (const entry of limitedCandidates) {
    try {
      const autored = await fetchAutoredRecordByPatent(entry.stock);
      if (autored) byStock.set(entry.stock, normalizeAutoredTechnicalFields(autored));
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

// Requisito del negocio: el catálogo debe cargar el inventario completo.
const BODEGA_FILTER_ENABLED = false;

function filterEnBodega(items: CatalogItem[]): CatalogItem[] {
  if (!BODEGA_FILTER_ENABLED) return items;

  const hasEstadoRetiro = items.some((item) => item.enBodega !== undefined);
  if (!hasEstadoRetiro) return items;

  // Mantiene inventario sin estado explícito (ej. AWS/Rainworks) y excluye solo
  // los registros marcados como fuera de bodega.
  return items.filter((item) => item.enBodega !== false);
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
      const glo3dEnrichedItems = await enrichWithGlo3dInventory(enrichedItems);
      const filtered = filterEnBodega(glo3dEnrichedItems);

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

    const glo3dEnrichedItems = await enrichWithGlo3dInventory(enrichedItems);
    const filtered = filterEnBodega(glo3dEnrichedItems);

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
