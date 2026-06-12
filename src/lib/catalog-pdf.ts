import type { CatalogItem } from "@/types/catalog";

export type CatalogPdfRow = {
  vehiclePrimary: string;
  vehicleSecondary: string;
  patent: string;
  model: string;
  priceLabel: string;
  thumbnailUrls: string[];
};

export type CatalogPdfSection = {
  categoryTitle: string;
  categorySubtitle: string;
  rows: CatalogPdfRow[];
};

type PdfImageAsset = {
  dataUrl: string;
  format: "PNG" | "JPEG";
  aspectRatio: number;
};

type JsPdfDocument = {
  output(type: "blob"): Blob;
  save(filename: string): void;
  internal: { pageSize: { getWidth(): number; getHeight(): number } };
  addPage(): void;
  setPage(page: number): void;
  getNumberOfPages(): number;
  setFillColor(r: number, g: number, b: number): void;
  setDrawColor(r: number, g: number, b: number): void;
  setTextColor(r: number, g: number, b: number): void;
  setFont(font: string, style: string): void;
  setFontSize(size: number): void;
  setLineWidth(width: number): void;
  text(text: string | string[], x: number, y: number, options?: Record<string, unknown>): void;
  rect(x: number, y: number, w: number, h: number, style?: string): void;
  line(x1: number, y1: number, x2: number, y2: number): void;
  roundedRect(x: number, y: number, w: number, h: number, rx: number, ry: number, style?: string): void;
  circle(x: number, y: number, r: number, style?: string): void;
  lines(
    lines: number[][],
    x: number,
    y: number,
    scale: number | [number, number],
    style?: string,
    closed?: boolean,
  ): void;
  addImage(
    imageData: string,
    format: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void;
  splitTextToSize(text: string, maxWidth: number): string[];
  getTextWidth(text: string): number;
};

const MAX_PDF_IMAGE_EDGE = 160;
const PDF_IMAGE_LOAD_CONCURRENCY = 6;
const PDF_IMAGE_FETCH_TIMEOUT_MS = 7_000;
const PDF_THUMBNAIL_CANDIDATES_PER_VEHICLE = 1;

const VEDISA_BRAND = {
  navy: [12, 28, 61] as const,
  navyDeep: [6, 18, 42] as const,
  indigo: [67, 56, 202] as const,
  cyan: [8, 145, 178] as const,
  cyanBright: [14, 165, 233] as const,
  gold: [245, 158, 11] as const,
  goldSoft: [255, 247, 237] as const,
  green: [22, 163, 74] as const,
  cyanSoft: [236, 254, 255] as const,
  cyanPale: [224, 242, 254] as const,
  slateText: [30, 41, 59] as const,
  slateMuted: [71, 85, 105] as const,
  border: [203, 213, 225] as const,
  borderSoft: [226, 232, 240] as const,
  white: [255, 255, 255] as const,
};

const VEDISA_CONTACT = {
  catalogUrl: "catalogo.vedisaremates.cl",
  offices: "Americo Vespucio 2880, Piso 7",
  exhibition: "Arturo Prat 6457, Noviciado, Pudahuel",
  hours: "Lunes a Viernes 9:00 - 13:00 / 14:00 - 17:00 / Sab-Dom Cerrado",
  whatsapp: "+56 9 8932 3397",
  onlineTitle: "Remates 100% Online",
  onlineBody:
    "Puede revisar las unidades pre-compra presencialmente en nuestra bodega sin necesidad de garantia.",
} as const;

const PDF_PRICE_FOOTER = "+ gastos de impuestos y transferencias";

const PDF_LAYOUT = {
  marginX: 48,
  contentGap: 12,
  sectionGap: 22,
  pageFooterReserve: 44,
  pageHeaderHeight: 48,
  rowPadY: 10,
  rowLineH: 11,
  ruleWeight: 0.35,
  heroRatio: 0.46,
  iconColumn: 22,
  accentWidth: 2,
} as const;

type PdfIconKind = "office" | "location" | "clock" | "phone" | "globe";

type PdfSectionHeaderLayout = {
  totalHeight: number;
  secondaryLines: string[];
  taglineLines: string[];
};

function isPdfPriceMissing(label: string): boolean {
  const normalized = sanitizeTextForPdf(label).toLowerCase();
  return !normalized || normalized === "sin precio" || normalized === "-";
}

function drawPdfIcon(
  doc: JsPdfDocument,
  kind: PdfIconKind,
  cx: number,
  cy: number,
  size: number,
  color: readonly [number, number, number],
) {
  doc.setDrawColor(...color);
  doc.setLineWidth(1);
  const half = size / 2;

  if (kind === "location") {
    doc.circle(cx, cy - half * 0.32, half * 0.3, "S");
    doc.lines(
      [
        [0, half * 0.82],
        [-half * 0.34, -half * 0.48],
        [half * 0.34, -half * 0.48],
      ],
      cx,
      cy + half * 0.18,
      [1, 1],
      "S",
      true,
    );
    doc.circle(cx, cy - half * 0.32, 1.4, "F");
    return;
  }

  if (kind === "office") {
    const w = size * 0.68;
    const h = size * 0.76;
    const left = cx - w / 2;
    const top = cy - h / 2 + 1;
    doc.rect(left, top + h * 0.3, w, h * 0.7, "S");
    doc.rect(left + w * 0.14, top, w * 0.2, h * 0.32, "S");
    doc.rect(left + w * 0.42, top, w * 0.2, h * 0.32, "S");
    doc.rect(left + w * 0.66, top, w * 0.18, h * 0.32, "S");
    return;
  }

  if (kind === "clock") {
    doc.circle(cx, cy, half * 0.78, "S");
    doc.setLineWidth(1.2);
    doc.line(cx, cy, cx, cy - half * 0.36);
    doc.line(cx, cy, cx + half * 0.3, cy + half * 0.06);
    return;
  }

  if (kind === "phone") {
    const w = size * 0.46;
    const h = size * 0.76;
    doc.roundedRect(cx - w / 2, cy - h / 2, w, h, 2, 2, "S");
    doc.circle(cx, cy + h * 0.26, 1.4, "S");
    return;
  }

  doc.circle(cx, cy, half * 0.78, "S");
  doc.line(cx - half * 0.62, cy, cx + half * 0.62, cy);
  doc.line(cx - half * 0.4, cy - half * 0.48, cx + half * 0.4, cy - half * 0.48);
  doc.line(cx - half * 0.4, cy + half * 0.48, cx + half * 0.4, cy + half * 0.48);
}

function drawPdfLink(
  doc: JsPdfDocument,
  label: string,
  centerX: number,
  y: number,
  fontSize: number,
  color: readonly [number, number, number],
) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(fontSize);
  doc.setTextColor(...color);
  doc.text(label, centerX, y, { align: "center" });
  const textWidth = doc.getTextWidth(label);
  doc.setDrawColor(...color);
  doc.setLineWidth(0.6);
  doc.line(centerX - textWidth / 2, y + 3, centerX + textWidth / 2, y + 3);
}

function drawPdfRule(
  doc: JsPdfDocument,
  x: number,
  y: number,
  width: number,
  color: readonly [number, number, number] = VEDISA_BRAND.borderSoft,
) {
  doc.setDrawColor(...color);
  doc.setLineWidth(PDF_LAYOUT.ruleWeight);
  doc.line(x, y, x + width, y);
}

function drawPdfInfoLine(
  doc: JsPdfDocument,
  icon: PdfIconKind,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  iconColor: readonly [number, number, number],
  textColor: readonly [number, number, number] = VEDISA_BRAND.slateText,
): number {
  const lines = doc.splitTextToSize(sanitizeTextForPdf(text), maxWidth - PDF_LAYOUT.iconColumn - 8);
  const blockHeight = Math.max(20, lines.length * 12 + 6);
  const iconY = y + blockHeight / 2;
  drawPdfIcon(doc, icon, x + PDF_LAYOUT.iconColumn / 2, iconY, 14, iconColor);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...textColor);
  doc.text(lines, x + PDF_LAYOUT.iconColumn + 4, y + 11);
  return blockHeight + 6;
}

function resolveSectionTagline(secondary: string, tagline: string): string {
  const cleanTagline = tagline.trim();
  if (!cleanTagline) return "";
  const taglineKey = normalizeText(cleanTagline);
  const secondaryKey = normalizeText(secondary);
  if (taglineKey === secondaryKey) return "";
  if (secondaryKey && taglineKey.startsWith(secondaryKey)) return "";
  return cleanTagline;
}

function measurePdfSectionHeader(
  doc: JsPdfDocument,
  parsed: ParsedPdfSectionHeader,
  textWidth: number,
): PdfSectionHeaderLayout {
  let height = 20;
  let secondaryLines: string[] = [];

  if (parsed.secondary) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    secondaryLines = doc.splitTextToSize(parsed.secondary, textWidth);
    height += secondaryLines.length * 13 + 6;
  }

  const tagline = resolveSectionTagline(parsed.secondary, parsed.tagline);
  let taglineLines: string[] = [];
  if (tagline) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    taglineLines = doc.splitTextToSize(tagline, textWidth);
    height += taglineLines.length * 11 + 4;
  }

  return {
    totalHeight: Math.max(34, height + 6),
    secondaryLines,
    taglineLines,
  };
}

function drawPdfSectionHeader(
  doc: JsPdfDocument,
  parsed: ParsedPdfSectionHeader,
  layout: PdfSectionHeaderLayout,
  x: number,
  y: number,
  width: number,
  pageRight: number,
  brand: typeof VEDISA_BRAND,
): number {
  const titleX = x + PDF_LAYOUT.accentWidth + 10;
  const textWidth = width - PDF_LAYOUT.accentWidth - 96;

  doc.setDrawColor(...brand.cyan);
  doc.setLineWidth(PDF_LAYOUT.accentWidth);
  doc.line(x, y + 2, x, y + layout.totalHeight - 2);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...brand.navy);
  doc.text(parsed.primary, titleX, y + 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...brand.slateMuted);
  doc.text(`${parsed.count} vehiculos`, pageRight, y + 16, { align: "right" });

  let cursor = y + 30;
  if (layout.secondaryLines.length > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(...brand.indigo);
    doc.text(layout.secondaryLines, titleX, cursor);
    cursor += layout.secondaryLines.length * 13 + 4;
  }

  if (layout.taglineLines.length > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...brand.slateMuted);
    doc.text(layout.taglineLines, titleX, cursor);
  }

  return layout.totalHeight;
}

/** jsPDF (Helvetica) no renderiza bien Unicode ni maxWidth estrecho en la misma línea. */
function sanitizeTextForPdf(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/→/g, " a ")
    .replace(/[·•]/g, "-")
    .replace(/[^\x20-\x7E]/g, (char) => {
      const map: Record<string, string> = {
        á: "a",
        é: "e",
        í: "i",
        ó: "o",
        ú: "u",
        ñ: "n",
        Á: "A",
        É: "E",
        Í: "I",
        Ó: "O",
        Ú: "U",
        Ñ: "N",
      };
      return map[char] ?? "";
    })
    .replace(/\s+/g, " ")
    .trim();
}

function isPdfDateOrRangeText(value: string): boolean {
  const text = sanitizeTextForPdf(value);
  if (!text) return true;
  if (/\d{2}[-/]\d{2}[-/]\d{4}/.test(text)) return true;
  if (/\d{1,2}:\d{2}/.test(text) && /\ba\b/.test(text)) return true;
  if (/->| a /.test(text) && /\d/.test(text)) return true;
  return false;
}

function dedupeSectionEventName(primary: string, secondary: string): string {
  const p = sanitizeTextForPdf(primary).toLowerCase();
  let s = sanitizeTextForPdf(secondary);
  if (!s) return "";
  const sl = s.toLowerCase();
  if (sl === p) return "";
  if (sl.startsWith(`${p} - `)) s = s.slice(p.length + 3).trim();
  if (sl.startsWith(`${p} · `)) s = s.slice(p.length + 3).trim();
  return s;
}

type ParsedPdfSectionHeader = {
  primary: string;
  secondary: string;
  tagline: string;
  count: number;
};

function parsePdfSectionHeader(section: CatalogPdfSection): ParsedPdfSectionHeader {
  const rawTitle = sanitizeTextForPdf(section.categoryTitle);
  const rematePrefix = "Remates disponibles - ";
  const ventaPrefix = "Ventas directas - ";

  let primary = rawTitle;
  let secondary = "";

  if (rawTitle.startsWith(rematePrefix)) {
    primary = "Remates disponibles";
    secondary = rawTitle.slice(rematePrefix.length).trim();
  } else if (rawTitle.startsWith(ventaPrefix)) {
    primary = "Ventas directas";
    secondary = rawTitle.slice(ventaPrefix.length).trim();
  }

  secondary = dedupeSectionEventName(primary, secondary);
  const rawTagline = sanitizeTextForPdf(section.categorySubtitle);
  const tagline = isPdfDateOrRangeText(rawTagline) ? "" : rawTagline;

  return {
    primary,
    secondary,
    tagline,
    count: section.rows.length,
  };
}

function normalizeLookupKey(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]/g, "");
}

function buildVehicleLookup(
  source: unknown,
  lookup: Map<string, unknown> = new Map(),
  path = "",
): Map<string, unknown> {
  if (!source || typeof source !== "object") return lookup;

  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    const currentPath = path ? `${path}.${key}` : key;
    const normalizedPath = normalizeLookupKey(currentPath);
    const normalizedLeaf = normalizeLookupKey(key);

    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      buildVehicleLookup(value, lookup, currentPath);
      continue;
    }

    if (!lookup.has(normalizedPath)) lookup.set(normalizedPath, value);
    if (!lookup.has(normalizedLeaf)) lookup.set(normalizedLeaf, value);
  }

  return lookup;
}

function getLookupValue(lookup: Map<string, unknown>, aliases: string[]): unknown {
  for (const alias of aliases) {
    const value = lookup.get(normalizeLookupKey(alias));
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return undefined;
}

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function normalizePdfImageUrl(value?: string | null): string | null {
  if (!value || typeof value !== "string") return null;
  let url = value.trim();
  if (!url) return null;
  if (url.startsWith("//")) url = `https:${url}`;
  if (url.startsWith("/")) url = `https://glo3d.net${url}`;
  if (!url.startsWith("http")) return null;
  return url.replace(/\$.*$/, "");
}

function isLikelyPdfImageUrl(url: string): boolean {
  const normalized = url.toLowerCase();
  if (normalized.includes("glo3d.net/iframe") || normalized.includes("<iframe")) return false;
  if (/\.(jpg|jpeg|png|webp|gif|bmp|avif)(\?|$)/i.test(normalized)) return true;
  return /cdn\.|cloudfront|amazonaws|supabase|cloudinary|img|image|media|glo3d|foto|photo|thumb|vedisa/i.test(
    normalized,
  );
}

export function collectVehicleImageCandidates(item: CatalogItem): string[] {
  const raw = item.raw as Record<string, unknown>;
  const lookup = buildVehicleLookup(raw);
  const glo3dRaw = raw.glo3d as Record<string, unknown> | undefined;
  const glo3dLookup = glo3dRaw ? buildVehicleLookup(glo3dRaw) : null;
  const staticCandidates = [
    item.thumbnail,
    ...item.images,
    getLookupValue(lookup, [
      "thumbnail",
      "thumb",
      "thumbnail_url",
      "image",
      "image_url",
      "foto",
      "imagen_principal",
      "foto_portada",
    ]),
    getLookupValue(lookup, ["src_with_params", "src"]),
    glo3dLookup
      ? getLookupValue(glo3dLookup, [
          "thumbnail",
          "thumb",
          "thumbnail_url",
          "image",
          "image_url",
          "src_with_params",
          "src",
        ])
      : null,
    typeof raw.thumbnail === "string" ? raw.thumbnail : null,
    typeof raw.thumb === "string" ? raw.thumb : null,
    typeof raw.image_url === "string" ? raw.image_url : null,
    typeof raw.foto === "string" ? raw.foto : null,
  ];

  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of staticCandidates) {
    if (typeof candidate !== "string") continue;
    const normalized = normalizePdfImageUrl(candidate);
    if (!normalized || seen.has(normalized)) continue;
    if (!isLikelyPdfImageUrl(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result.slice(0, PDF_THUMBNAIL_CANDIDATES_PER_VEHICLE);
}

export function getPdfVehicleDisplay(item: CatalogItem): { primary: string; secondary: string } {
  const subtitle = item.subtitle?.trim();
  const rawTitle = item.title?.trim() || "Vehículo sin título";
  const cleaned = rawTitle.replace(/^vedisa\s+remates\s*-\s*/i, "").trim();
  const commaParts = cleaned.split(",").map((part) => part.trim()).filter(Boolean);

  if (commaParts.length >= 2) {
    return {
      primary: commaParts[0] ?? rawTitle,
      secondary: commaParts.slice(1).join(", "),
    };
  }

  const raw = item.raw as Record<string, unknown>;
  const lookup = buildVehicleLookup(raw);
  const brand = String(
    getLookupValue(lookup, ["marca", "brand", "make", "glo3d.make"]) ?? raw.marca ?? raw.brand ?? "",
  ).trim();
  const model = String(
    getLookupValue(lookup, ["modelo", "model", "model2", "glo3d.model2"]) ?? raw.modelo ?? raw.model ?? "",
  ).trim();
  const year = String(
    getLookupValue(lookup, ["ano", "anio", "year", "glo3d.year"]) ?? raw.ano ?? raw.anio ?? raw.year ?? "",
  ).trim();
  const composed = [brand, model].filter(Boolean).join(" ");
  const primary = composed ? `${composed}${year ? ` · ${year}` : ""}`.trim() : cleaned;

  return {
    primary,
    secondary: subtitle && normalizeText(subtitle) !== normalizeText(primary) ? sanitizeTextForPdf(subtitle) : "",
  };
}

function getImageDimensionsFromDataUrl(dataUrl: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = document.createElement("img");
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
        return;
      }
      resolve(null);
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function fitDimensionsByAspect(
  aspectRatio: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  let width = maxWidth;
  let height = width / aspectRatio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspectRatio;
  }
  return { width, height };
}

async function convertImageDataUrlToJpegAsset(
  dataUrl: string,
  maxEdge = MAX_PDF_IMAGE_EDGE,
): Promise<PdfImageAsset | null> {
  return new Promise((resolve) => {
    const img = document.createElement("img");
    img.onload = () => {
      if (img.naturalWidth <= 0 || img.naturalHeight <= 0) {
        resolve(null);
        return;
      }
      const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
      const width = Math.max(1, Math.round(img.naturalWidth * scale));
      const height = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      try {
        resolve({
          dataUrl: canvas.toDataURL("image/jpeg", 0.82),
          format: "JPEG",
          aspectRatio: width / height,
        });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

async function normalizePdfImageAsset(
  dataUrl: string,
  format: "PNG" | "JPEG",
  aspectRatio: number,
): Promise<PdfImageAsset | null> {
  const dimensions = await getImageDimensionsFromDataUrl(dataUrl);
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) return null;
  const maxEdge = Math.max(dimensions.width, dimensions.height);
  if (format === "JPEG" && maxEdge <= MAX_PDF_IMAGE_EDGE) {
    return { dataUrl, format, aspectRatio };
  }
  return convertImageDataUrlToJpegAsset(dataUrl);
}

async function buildPdfImageAsset(dataUrl: string, contentType = ""): Promise<PdfImageAsset | null> {
  const dimensions = await getImageDimensionsFromDataUrl(dataUrl);
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) return null;

  const mime = contentType.toLowerCase();
  const isJpeg = mime.includes("jpeg") || mime.includes("jpg") || dataUrl.startsWith("data:image/jp");
  const isPng = mime.includes("png") || dataUrl.startsWith("data:image/png");
  if (isJpeg) {
    return normalizePdfImageAsset(dataUrl, "JPEG", dimensions.width / dimensions.height);
  }
  if (isPng) {
    return normalizePdfImageAsset(dataUrl, "PNG", dimensions.width / dimensions.height);
  }
  return convertImageDataUrlToJpegAsset(dataUrl);
}

async function fetchWithPdfTimeout(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), PDF_IMAGE_FETCH_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("No se pudo convertir la imagen a DataURL."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Error leyendo imagen."));
    reader.readAsDataURL(blob);
  });
}

async function fetchPdfImageDirect(url: string): Promise<PdfImageAsset | null> {
  try {
    const response = await fetchWithPdfTimeout(url, { cache: "no-store", mode: "cors" });
    if (!response.ok) return null;
    const blob = await response.blob();
    const dataUrl = await blobToDataUrl(blob);
    return buildPdfImageAsset(dataUrl, blob.type);
  } catch {
    return null;
  }
}

async function fetchPdfImageViaProxy(url: string): Promise<PdfImageAsset | null> {
  try {
    const response = await fetchWithPdfTimeout(`/api/pdf-image?url=${encodeURIComponent(url)}`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { dataUrl?: string; contentType?: string };
    if (!payload.dataUrl) return null;
    return buildPdfImageAsset(payload.dataUrl, payload.contentType ?? "");
  } catch {
    return null;
  }
}

async function loadImageForPdfAsDataUrl(url: string): Promise<PdfImageAsset | null> {
  const normalizedUrl = normalizePdfImageUrl(url);
  if (!normalizedUrl) return null;
  const proxyAsset = await fetchPdfImageViaProxy(normalizedUrl);
  if (proxyAsset) return proxyAsset;
  return fetchPdfImageDirect(normalizedUrl);
}

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index] as T);
    }
  });
  await Promise.all(runners);
}

export async function loadLogoForPdfAsDataUrl(): Promise<string | null> {
  const candidates = ["/vedisa-logo.png", "https://vedisaremates.vercel.app/vedisa-logo.png"];
  for (const url of candidates) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) continue;
      const blob = await response.blob();
      return await blobToDataUrl(blob);
    } catch {
      // intenta la siguiente URL
    }
  }
  return null;
}

export async function generateCatalogPdfDocument(
  sections: CatalogPdfSection[],
  logoDataUrl: string | null,
  options?: { showPatents?: boolean },
): Promise<{ doc: JsPdfDocument; exportFileName: string; totalRows: number }> {
  const showPatents = options?.showPatents !== false;
  const { jsPDF } = await import("jspdf");
  const logoDimensions = logoDataUrl ? await getImageDimensionsFromDataUrl(logoDataUrl) : null;
  const logoAspectRatio =
    logoDimensions && logoDimensions.width > 0 && logoDimensions.height > 0
      ? logoDimensions.width / logoDimensions.height
      : 3.6;

  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true }) as unknown as JsPdfDocument;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = PDF_LAYOUT.marginX;
  const usableWidth = pageWidth - marginX * 2;
  const pageRight = pageWidth - marginX;
  const now = new Date();
  const y2 = String(now.getFullYear()).slice(-2);
  const m2 = String(now.getMonth() + 1).padStart(2, "0");
  const d2 = String(now.getDate()).padStart(2, "0");
  const exportFileName = `${y2}${m2}${d2}_CatalogoVedisa.pdf`;
  const todayLabel = sanitizeTextForPdf(
    now.toLocaleString("es-CL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  );
  const totalRows = sections.reduce((acc, section) => acc + section.rows.length, 0);
  const BRAND = VEDISA_BRAND;

  // --- Portada minimalista ---
  const heroHeight = Math.round(pageHeight * PDF_LAYOUT.heroRatio);
  doc.setFillColor(...BRAND.navyDeep);
  doc.rect(0, 0, pageWidth, heroHeight, "F");
  drawPdfRule(doc, 0, heroHeight, pageWidth, BRAND.cyanBright);

  if (logoDataUrl) {
    const { width: logoWidth, height: logoHeight } = fitDimensionsByAspect(logoAspectRatio, 240, 60);
    doc.addImage(logoDataUrl, "PNG", (pageWidth - logoWidth) / 2, 56, logoWidth, logoHeight);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(32);
  doc.setTextColor(...BRAND.white);
  doc.text("Catalogo Vedisa", pageWidth / 2, 138, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  doc.setTextColor(191, 219, 254);
  doc.text("Remates y venta directa", pageWidth / 2, 162, { align: "center" });

  const coverDate = sanitizeTextForPdf(
    now.toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" }),
  );
  const coverTime = sanitizeTextForPdf(
    now.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }),
  );
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  doc.text(`Actualizado ${coverDate} - ${coverTime}`, pageWidth / 2, 182, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(46);
  doc.setTextColor(...BRAND.white);
  doc.text(String(totalRows), pageWidth / 2, 228, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(191, 219, 254);
  doc.text("publicaciones disponibles", pageWidth / 2, 248, { align: "center" });
  doc.setFontSize(9);
  doc.text(
    `${sections.length} categoria${sections.length === 1 ? "" : "s"} comerciales`,
    pageWidth / 2,
    264,
    { align: "center" },
  );

  let coverInfoY = heroHeight + 32;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...BRAND.navy);
  doc.text("Visitanos y conoce nuestras unidades", marginX, coverInfoY);
  coverInfoY += 18;

  const coverInfoItems: Array<{ icon: PdfIconKind; value: string }> = [
    { icon: "office", value: VEDISA_CONTACT.offices },
    { icon: "location", value: VEDISA_CONTACT.exhibition },
    { icon: "clock", value: VEDISA_CONTACT.hours },
  ];
  for (const item of coverInfoItems) {
    coverInfoY += drawPdfInfoLine(doc, item.icon, item.value, marginX, coverInfoY, usableWidth, BRAND.cyan);
  }

  coverInfoY += 8;
  drawPdfRule(doc, marginX, coverInfoY, usableWidth);
  coverInfoY += 20;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND.navy);
  doc.text(VEDISA_CONTACT.onlineTitle, marginX, coverInfoY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...BRAND.slateMuted);
  const onlineLines = doc.splitTextToSize(sanitizeTextForPdf(VEDISA_CONTACT.onlineBody), usableWidth);
  doc.text(onlineLines, marginX, coverInfoY + 14);

  drawPdfIcon(doc, "globe", marginX + 7, pageHeight - 50, 13, BRAND.cyan);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...BRAND.cyanBright);
  doc.text(VEDISA_CONTACT.catalogUrl, marginX + 22, pageHeight - 44);
  doc.setDrawColor(...BRAND.cyanBright);
  doc.setLineWidth(0.5);
  const coverUrlWidth = doc.getTextWidth(VEDISA_CONTACT.catalogUrl);
  doc.line(marginX + 22, pageHeight - 41, marginX + 22 + coverUrlWidth, pageHeight - 41);

  // --- Detalle comercial ---
  doc.addPage();
  let y = 42;

  const drawPageHeader = () => {
    if (logoDataUrl) {
      const { width: headerLogoWidth, height: headerLogoHeight } = fitDimensionsByAspect(
        logoAspectRatio,
        78,
        20,
      );
      doc.addImage(logoDataUrl, "PNG", marginX, 12, headerLogoWidth, headerLogoHeight);
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...BRAND.navy);
    doc.text("Oferta comercial vigente", marginX + (logoDataUrl ? 90 : 0), 22);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.slateMuted);
    doc.text(`${totalRows} vehiculos`, pageRight, 18, { align: "right" });
    doc.text(todayLabel, pageRight, 30, { align: "right" });
    drawPdfRule(doc, marginX, PDF_LAYOUT.pageHeaderHeight, usableWidth);
    y = PDF_LAYOUT.pageHeaderHeight + 14;
  };

  const cellPaddingX = 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  let maxPriceTextWidth = doc.getTextWidth("$99.999.999");
  for (const section of sections) {
    for (const row of section.rows) {
      if (!isPdfPriceMissing(row.priceLabel)) {
        maxPriceTextWidth = Math.max(maxPriceTextWidth, doc.getTextWidth(row.priceLabel));
      }
    }
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  const footerWidth = doc.getTextWidth(PDF_PRICE_FOOTER);
  const priceColWidth = Math.max(118, Math.ceil(Math.max(maxPriceTextWidth, footerWidth)) + cellPaddingX * 2 + 12);
  const thumbColWidth = 72;
  const patentColWidth = showPatents ? 58 : 0;
  const modelColWidth = 68;
  const vehicleColWidth = Math.max(
    160,
    usableWidth - priceColWidth - thumbColWidth - patentColWidth - modelColWidth,
  );

  const tableColumns = [
    { key: "vehicle" as const, label: "Vehiculo", width: vehicleColWidth, align: "left" as const },
    ...(showPatents
      ? [{ key: "patent" as const, label: "Patente", width: patentColWidth, align: "center" as const }]
      : []),
    { key: "model" as const, label: "Modelo", width: modelColWidth, align: "left" as const },
    { key: "thumbnail" as const, label: "Foto", width: thumbColWidth, align: "center" as const },
    { key: "priceLabel" as const, label: "Precio", width: priceColWidth, align: "center" as const },
  ];
  const vehicleColIndex = 0;
  const patentColIndex = showPatents ? 1 : -1;
  const modelColIndex = showPatents ? 2 : 1;
  const thumbnailColIndex = showPatents ? 3 : 2;
  const priceColIndex = showPatents ? 4 : 3;
  const thumbMaxWidth = 64;
  const thumbMaxHeight = 44;

  const thumbnailCache = new Map<string, PdfImageAsset>();
  const uniqueThumbnailUrls = [
    ...new Set(sections.flatMap((section) => section.rows.flatMap((row) => row.thumbnailUrls))),
  ];
  await mapWithConcurrency(uniqueThumbnailUrls, PDF_IMAGE_LOAD_CONCURRENCY, async (url) => {
    const asset = await loadImageForPdfAsDataUrl(url);
    if (asset) thumbnailCache.set(url, asset);
  });

  const resolveRowImageAsset = (urls: string[]) => {
    for (const url of urls) {
      const asset = thumbnailCache.get(url);
      if (asset) return asset;
    }
    return null;
  };

  const getColumnX = (columnIndex: number) =>
    marginX + tableColumns.slice(0, columnIndex).reduce((acc, column) => acc + column.width, 0);

  const drawTableHeader = () => {
    let x = marginX;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...BRAND.slateMuted);
    for (const column of tableColumns) {
      const label = column.label.toUpperCase();
      if (column.align === "center") {
        doc.text(label, x + column.width / 2, y + 10, { align: "center" });
      } else {
        doc.text(label, x + cellPaddingX, y + 10);
      }
      x += column.width;
    }
    drawPdfRule(doc, marginX, y + 16, usableWidth);
    y += 22;
  };

  const ensureSpace = (requiredHeight: number, drawHeaderIfNewPage = false) => {
    if (y + requiredHeight <= pageHeight - PDF_LAYOUT.pageFooterReserve) return;
    doc.addPage();
    drawPageHeader();
    if (drawHeaderIfNewPage) drawTableHeader();
  };

  drawPageHeader();
  for (const section of sections) {
    const header = parsePdfSectionHeader(section);
    const headerLayout = measurePdfSectionHeader(
      doc,
      header,
      usableWidth - PDF_LAYOUT.accentWidth - 96,
    );

    ensureSpace(headerLayout.totalHeight + 28);
    if (y > PDF_LAYOUT.pageHeaderHeight + 40) {
      y += PDF_LAYOUT.sectionGap;
    }

    const headerHeight = drawPdfSectionHeader(
      doc,
      header,
      headerLayout,
      marginX,
      y,
      usableWidth,
      pageRight,
      BRAND,
    );
    y += headerHeight + 10;
    drawTableHeader();

    for (const row of section.rows) {
      const linePaddingY = PDF_LAYOUT.rowPadY;
      const lineHeight = PDF_LAYOUT.rowLineH;
      const vehiclePrimary = sanitizeTextForPdf(row.vehiclePrimary);
      const vehicleSecondary = sanitizeTextForPdf(row.vehicleSecondary);
      const patent = sanitizeTextForPdf(row.patent);
      const model = sanitizeTextForPdf(row.model);
      const priceLabel = sanitizeTextForPdf(row.priceLabel);

      const vehicleInnerWidth = Math.max(16, tableColumns[vehicleColIndex].width - cellPaddingX * 2);
      const patentInnerWidth =
        patentColIndex >= 0
          ? Math.max(16, tableColumns[patentColIndex].width - cellPaddingX * 2)
          : 0;
      const modelInnerWidth = Math.max(16, tableColumns[modelColIndex].width - cellPaddingX * 2);
      const priceInnerWidth = Math.max(16, tableColumns[priceColIndex].width - cellPaddingX * 2);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      const vehiclePrimaryLines = doc.splitTextToSize(vehiclePrimary, vehicleInnerWidth);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      const vehicleSecondaryLines = vehicleSecondary
        ? doc.splitTextToSize(vehicleSecondary, vehicleInnerWidth)
        : [];
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      const patentLines =
        showPatents && patentInnerWidth > 0
          ? doc.splitTextToSize(patent, patentInnerWidth)
          : [];
      const modelLines = doc.splitTextToSize(model, modelInnerWidth);
      const hasPrice = !isPdfPriceMissing(priceLabel);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      const priceFooterLines = hasPrice
        ? doc.splitTextToSize(PDF_PRICE_FOOTER, priceInnerWidth)
        : [];
      const priceBlockHeight = hasPrice ? 18 + priceFooterLines.length * 7 + 4 : 14;

      const vehicleLineCount = Math.max(1, vehiclePrimaryLines.length + vehicleSecondaryLines.length);
      const textBlockLines = Math.max(
        vehicleLineCount,
        patentLines.length,
        modelLines.length,
        Math.ceil(priceBlockHeight / lineHeight),
      );
      const rowHeight = Math.max(
        thumbMaxHeight + linePaddingY * 2,
        textBlockLines * lineHeight + linePaddingY * 2 + 4,
      );

      ensureSpace(rowHeight + 4, true);
      const rowMidY = y + rowHeight / 2;

      const vehicleX = getColumnX(vehicleColIndex) + cellPaddingX;
      const vehicleBlockH = vehicleLineCount * lineHeight;
      let textY = rowMidY - vehicleBlockH / 2 + 8;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...BRAND.slateText);
      doc.text(vehiclePrimaryLines, vehicleX, textY);
      textY += vehiclePrimaryLines.length * lineHeight;
      if (vehicleSecondaryLines.length > 0) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...BRAND.slateMuted);
        doc.text(vehicleSecondaryLines, vehicleX, textY);
      }

      if (showPatents && patentColIndex >= 0) {
        const patentColX = getColumnX(patentColIndex);
        const patentColW = tableColumns[patentColIndex].width;
        const patentBlockH = patentLines.length * lineHeight;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(...BRAND.navy);
        doc.text(
          patentLines,
          patentColX + patentColW / 2,
          rowMidY - patentBlockH / 2 + 8,
          { align: "center" },
        );
      }

      const modelBlockH = modelLines.length * lineHeight;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...BRAND.slateText);
      doc.text(
        modelLines,
        getColumnX(modelColIndex) + cellPaddingX,
        rowMidY - modelBlockH / 2 + 8,
      );

      const priceColX = getColumnX(priceColIndex);
      const priceColW = tableColumns[priceColIndex].width;
      const priceCenterX = priceColX + priceColW / 2;
      if (hasPrice) {
        const priceTopY = rowMidY - priceBlockHeight / 2 + 10;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(...BRAND.navy);
        doc.text(priceLabel, priceCenterX, priceTopY, { align: "center" });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(5.5);
        doc.setTextColor(100, 116, 139);
        doc.text(priceFooterLines, priceCenterX, priceTopY + 14, { align: "center" });
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(...BRAND.slateMuted);
        doc.text("Sin precio", priceCenterX, rowMidY + 3, { align: "center" });
      }

      const thumbColX = getColumnX(thumbnailColIndex);
      const thumbColWidthValue = tableColumns[thumbnailColIndex].width;
      const imageAsset = resolveRowImageAsset(row.thumbnailUrls);
      if (imageAsset) {
        const { width: thumbWidth, height: thumbHeight } = fitDimensionsByAspect(
          imageAsset.aspectRatio,
          thumbMaxWidth,
          thumbMaxHeight,
        );
        const imgX = thumbColX + (thumbColWidthValue - thumbWidth) / 2;
        const imgY = y + (rowHeight - thumbHeight) / 2;
        doc.addImage(imageAsset.dataUrl, imageAsset.format, imgX, imgY, thumbWidth, thumbHeight);
      } else {
        const placeholderWidth = 44;
        const placeholderHeight = 28;
        const placeholderX = thumbColX + (thumbColWidthValue - placeholderWidth) / 2;
        const placeholderY = y + (rowHeight - placeholderHeight) / 2;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...BRAND.slateMuted);
        doc.text("Sin foto", thumbColX + thumbColWidthValue / 2, placeholderY + placeholderHeight / 2 + 2, {
          align: "center",
        });
      }

      drawPdfRule(doc, marginX, y + rowHeight, usableWidth);
      y += rowHeight;
    }

    y += PDF_LAYOUT.contentGap;
  }

  // --- Cierre minimalista ---
  doc.addPage();
  const closeHeroHeight = Math.round(pageHeight * PDF_LAYOUT.heroRatio);
  doc.setFillColor(...BRAND.navyDeep);
  doc.rect(0, 0, pageWidth, closeHeroHeight, "F");
  drawPdfRule(doc, 0, closeHeroHeight, pageWidth, BRAND.cyanBright);

  if (logoDataUrl) {
    const { width: closeLogoW, height: closeLogoH } = fitDimensionsByAspect(logoAspectRatio, 180, 46);
    doc.addImage(logoDataUrl, "PNG", (pageWidth - closeLogoW) / 2, 48, closeLogoW, closeLogoH);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...BRAND.white);
  doc.text("Puedes ver el detalle", pageWidth / 2, 112, { align: "center" });
  doc.text("en nuestro catalogo", pageWidth / 2, 138, { align: "center" });

  drawPdfIcon(doc, "globe", pageWidth / 2, 166, 14, BRAND.cyanBright);
  drawPdfLink(doc, VEDISA_CONTACT.catalogUrl, pageWidth / 2, 192, 13, BRAND.cyanBright);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(191, 219, 254);
  doc.text("o venir a nuestras instalaciones", pageWidth / 2, 206, { align: "center" });

  drawPdfIcon(doc, "location", pageWidth / 2, 232, 14, BRAND.cyanBright);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...BRAND.white);
  doc.text(VEDISA_CONTACT.exhibition, pageWidth / 2, 258, { align: "center" });

  let closeInfoY = closeHeroHeight + 30;
  const closeInfoItems: Array<{ icon: PdfIconKind; value: string }> = [
    { icon: "office", value: VEDISA_CONTACT.offices },
    { icon: "location", value: VEDISA_CONTACT.exhibition },
    { icon: "clock", value: VEDISA_CONTACT.hours },
  ];
  for (const item of closeInfoItems) {
    closeInfoY += drawPdfInfoLine(doc, item.icon, item.value, marginX, closeInfoY, usableWidth, BRAND.indigo);
  }

  closeInfoY += 10;
  drawPdfRule(doc, marginX, closeInfoY, usableWidth);
  closeInfoY += 24;

  drawPdfIcon(doc, "phone", pageWidth / 2, closeInfoY + 4, 16, BRAND.green);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...BRAND.navy);
  doc.text(VEDISA_CONTACT.whatsapp, pageWidth / 2, closeInfoY + 28, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...BRAND.slateMuted);
  doc.text("WhatsApp - Contact Center", pageWidth / 2, closeInfoY + 44, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...BRAND.indigo);
  doc.text(VEDISA_CONTACT.onlineTitle, pageWidth / 2, pageHeight - 40, { align: "center" });

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    if (page === 1) continue;
    drawPdfRule(doc, marginX, pageHeight - PDF_LAYOUT.pageFooterReserve + 8, usableWidth);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...BRAND.slateMuted);
    doc.text(`Pagina ${page} de ${totalPages}`, pageWidth / 2, pageHeight - 18, { align: "center" });
    if (page > 1 && page < totalPages) {
      drawPdfIcon(doc, "globe", marginX + 6, pageHeight - 20, 8, BRAND.cyan);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...BRAND.cyan);
      doc.text(VEDISA_CONTACT.catalogUrl, marginX + 16, pageHeight - 16);
    }
  }

  return { doc, exportFileName, totalRows };
}

export function saveCatalogPdfDocument(doc: JsPdfDocument, exportFileName: string): void {
  doc.save(exportFileName);
}
