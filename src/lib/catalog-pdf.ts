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
  indigo: [67, 56, 202] as const,
  cyan: [8, 145, 178] as const,
  cyanSoft: [236, 254, 255] as const,
  cyanPale: [224, 242, 254] as const,
  slateText: [30, 41, 59] as const,
  slateMuted: [71, 85, 105] as const,
  border: [203, 213, 225] as const,
  borderSoft: [226, 232, 240] as const,
  white: [255, 255, 255] as const,
};

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
): Promise<{ doc: JsPdfDocument; exportFileName: string; totalRows: number }> {
  const { jsPDF } = await import("jspdf");
  const logoDimensions = logoDataUrl ? await getImageDimensionsFromDataUrl(logoDataUrl) : null;
  const logoAspectRatio =
    logoDimensions && logoDimensions.width > 0 && logoDimensions.height > 0
      ? logoDimensions.width / logoDimensions.height
      : 3.6;

  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true }) as unknown as JsPdfDocument;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 40;
  const usableWidth = pageWidth - marginX * 2;
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

  // Portada elegante
  doc.setFillColor(...BRAND.navy);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
  doc.setFillColor(...BRAND.cyan);
  doc.rect(0, 0, pageWidth, 8, "F");
  doc.setFillColor(...BRAND.indigo);
  doc.rect(0, pageHeight - 8, pageWidth, 8, "F");

  doc.setFillColor(18, 38, 78);
  doc.roundedRect(marginX + 4, 48, usableWidth - 8, pageHeight - 96, 18, 18, "F");
  doc.setFillColor(...BRAND.white);
  doc.roundedRect(marginX, 44, usableWidth, pageHeight - 104, 18, 18, "F");

  if (logoDataUrl) {
    const { width: logoWidth, height: logoHeight } = fitDimensionsByAspect(logoAspectRatio, 240, 64);
    doc.addImage(logoDataUrl, "PNG", (pageWidth - logoWidth) / 2, 88, logoWidth, logoHeight);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(34);
  doc.setTextColor(...BRAND.navy);
  doc.text("Catalogo Vedisa", pageWidth / 2, 200, { align: "center" });
  doc.setFontSize(14);
  doc.setTextColor(...BRAND.cyan);
  doc.text("Remates y venta directa", pageWidth / 2, 228, { align: "center" });

  const coverDate = sanitizeTextForPdf(
    now.toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" }),
  );
  const coverTime = sanitizeTextForPdf(
    now.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }),
  );
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...BRAND.slateMuted);
  doc.text(`Actualizado ${coverDate} - ${coverTime}`, pageWidth / 2, 254, { align: "center" });

  const statsCardY = 290;
  const statsCardW = Math.min(usableWidth - 80, 360);
  const statsCardX = (pageWidth - statsCardW) / 2;
  doc.setFillColor(...BRAND.cyanSoft);
  doc.setDrawColor(...BRAND.border);
  doc.setLineWidth(0.8);
  doc.roundedRect(statsCardX, statsCardY, statsCardW, 88, 12, 12, "FD");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND.slateMuted);
  doc.text("Publicaciones incluidas", pageWidth / 2, statsCardY + 28, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(...BRAND.indigo);
  doc.text(String(totalRows), pageWidth / 2, statsCardY + 58, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND.slateMuted);
  doc.text(
    `${sections.length} categoria${sections.length === 1 ? "" : "s"} comerciales`,
    pageWidth / 2,
    statsCardY + 76,
    { align: "center" },
  );

  doc.setFont("helvetica", "italic");
  doc.setFontSize(9.5);
  doc.setTextColor(...BRAND.slateMuted);
  const coverNoteLines = doc.splitTextToSize(
    "Documento comercial con fotos, patentes y precios visibles en el catalogo web.",
    usableWidth - 48,
  );
  doc.text(coverNoteLines, pageWidth / 2, pageHeight - 82, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND.indigo);
  doc.text("catalogo.vedisaremates.cl", pageWidth / 2, pageHeight - 48, { align: "center" });

  // Detalle
  doc.addPage();
  let y = 42;

  const drawPageHeader = () => {
    doc.setFillColor(...BRAND.navy);
    doc.rect(0, 0, pageWidth, 64, "F");
    doc.setFillColor(...BRAND.cyan);
    doc.rect(0, 58, pageWidth, 6, "F");
    if (logoDataUrl) {
      const { width: headerLogoWidth, height: headerLogoHeight } = fitDimensionsByAspect(
        logoAspectRatio,
        84,
        22,
      );
      doc.addImage(logoDataUrl, "PNG", marginX, 16, headerLogoWidth, headerLogoHeight);
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...BRAND.white);
    doc.text("Detalle comercial del catalogo", marginX + (logoDataUrl ? 96 : 0), 31);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(191, 219, 254);
    doc.text(todayLabel, pageWidth - marginX, 31, { align: "right" });
    y = 82;
  };

  const cellPaddingX = 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  let maxPriceTextWidth = doc.getTextWidth("Precio");
  for (const section of sections) {
    for (const row of section.rows) {
      maxPriceTextWidth = Math.max(maxPriceTextWidth, doc.getTextWidth(row.priceLabel));
    }
  }
  const priceColWidth = Math.ceil(maxPriceTextWidth) + cellPaddingX * 2 + 4;
  const thumbColWidth = 76;
  const patentColWidth = 62;
  const modelColWidth = 78;
  const vehicleColWidth = Math.max(
    160,
    usableWidth - priceColWidth - thumbColWidth - patentColWidth - modelColWidth,
  );

  const tableColumns = [
    { key: "vehicle" as const, label: "Vehiculo", width: vehicleColWidth, align: "left" as const },
    { key: "patent" as const, label: "Patente", width: patentColWidth, align: "center" as const },
    { key: "model" as const, label: "Modelo", width: modelColWidth, align: "left" as const },
    { key: "thumbnail" as const, label: "Foto", width: thumbColWidth, align: "center" as const },
    { key: "priceLabel" as const, label: "Precio", width: priceColWidth, align: "right" as const },
  ];
  const vehicleColIndex = 0;
  const patentColIndex = 1;
  const modelColIndex = 2;
  const thumbnailColIndex = 3;
  const priceColIndex = 4;
  const thumbMaxWidth = 62;
  const thumbMaxHeight = 42;

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
    doc.setFillColor(...BRAND.navy);
    doc.roundedRect(marginX, y, usableWidth, 22, 4, 4, "F");
    let x = marginX;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...BRAND.white);
    for (const column of tableColumns) {
      if (column.align === "right") {
        doc.text(column.label, x + column.width - cellPaddingX, y + 14, { align: "right" });
      } else if (column.align === "center") {
        doc.text(column.label, x + column.width / 2, y + 14, { align: "center" });
      } else {
        doc.text(column.label, x + cellPaddingX, y + 14);
      }
      x += column.width;
    }
    y += 28;
  };

  const ensureSpace = (requiredHeight: number, drawHeaderIfNewPage = false) => {
    if (y + requiredHeight <= pageHeight - 52) return;
    doc.addPage();
    drawPageHeader();
    if (drawHeaderIfNewPage) drawTableHeader();
  };

  drawPageHeader();
  for (const section of sections) {
    const header = parsePdfSectionHeader(section);
    const countLabel = `${header.count} veh.`;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    const countWidth = Math.max(58, doc.getTextWidth(countLabel) + 18);

    const headerBlockHeight = header.secondary ? 54 : 42;
    const taglineLines = header.tagline
      ? doc.splitTextToSize(header.tagline, usableWidth - countWidth - 36)
      : [];
    const taglineBlockHeight = taglineLines.length > 0 ? taglineLines.length * 11 + 8 : 0;
    const totalHeaderHeight = headerBlockHeight + taglineBlockHeight;

    ensureSpace(totalHeaderHeight + 30);
    doc.setFillColor(...BRAND.cyanPale);
    doc.setDrawColor(...BRAND.borderSoft);
    doc.setLineWidth(0.6);
    doc.roundedRect(marginX, y, usableWidth, totalHeaderHeight, 8, 8, "FD");
    doc.setFillColor(...BRAND.cyan);
    doc.roundedRect(marginX, y, 5, totalHeaderHeight, 2, 2, "F");

    const countX = marginX + usableWidth - countWidth - 10;
    doc.setFillColor(...BRAND.indigo);
    doc.roundedRect(countX, y + 10, countWidth, 20, 6, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.white);
    doc.text(countLabel, countX + countWidth / 2, y + 24, { align: "center" });

    const titleX = marginX + 16;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...BRAND.navy);
    doc.text(header.primary, titleX, y + 22);

    if (header.secondary) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...BRAND.indigo);
      doc.text(header.secondary, titleX, y + 40);
    }

    if (taglineLines.length > 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...BRAND.slateMuted);
      doc.text(taglineLines, titleX, y + headerBlockHeight - 2);
    }

    y += totalHeaderHeight + 10;

    const tableTopY = y;
    drawTableHeader();

    for (const [rowIndex, row] of section.rows.entries()) {
      const linePaddingY = 7;
      const lineHeight = 10;
      const vehiclePrimary = sanitizeTextForPdf(row.vehiclePrimary);
      const vehicleSecondary = sanitizeTextForPdf(row.vehicleSecondary);
      const patent = sanitizeTextForPdf(row.patent);
      const model = sanitizeTextForPdf(row.model);
      const priceLabel = sanitizeTextForPdf(row.priceLabel);

      const vehicleInnerWidth = Math.max(16, tableColumns[vehicleColIndex].width - cellPaddingX * 2);
      const patentInnerWidth = Math.max(16, tableColumns[patentColIndex].width - cellPaddingX * 2);
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
      const patentLines = doc.splitTextToSize(patent, patentInnerWidth);
      const modelLines = doc.splitTextToSize(model, modelInnerWidth);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      const priceLines = doc.splitTextToSize(priceLabel, priceInnerWidth);

      const vehicleLineCount = Math.max(1, vehiclePrimaryLines.length + vehicleSecondaryLines.length);
      const textBlockLines = Math.max(
        vehicleLineCount,
        patentLines.length,
        modelLines.length,
        priceLines.length,
      );
      const rowHeight = Math.max(thumbMaxHeight + linePaddingY * 2, textBlockLines * lineHeight + linePaddingY * 2);

      ensureSpace(rowHeight + 2, true);
      const rowFill = rowIndex % 2 === 0 ? BRAND.white : BRAND.cyanSoft;
      doc.setFillColor(rowFill[0], rowFill[1], rowFill[2]);
      doc.rect(marginX, y, usableWidth, rowHeight, "F");
      doc.setDrawColor(...BRAND.borderSoft);
      doc.rect(marginX, y, usableWidth, rowHeight);

      for (let columnIndex = 1; columnIndex < tableColumns.length; columnIndex += 1) {
        doc.line(getColumnX(columnIndex), y, getColumnX(columnIndex), y + rowHeight);
      }

      const vehicleX = getColumnX(vehicleColIndex) + cellPaddingX;
      let textY = y + linePaddingY + 8;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...BRAND.slateText);
      doc.text(vehiclePrimaryLines, vehicleX, textY);
      textY += vehiclePrimaryLines.length * lineHeight;
      if (vehicleSecondaryLines.length > 0) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...BRAND.slateMuted);
        doc.text(vehicleSecondaryLines, vehicleX, textY);
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...BRAND.navy);
      doc.text(
        patentLines,
        getColumnX(patentColIndex) + tableColumns[patentColIndex].width / 2,
        y + linePaddingY + 8,
        { align: "center" },
      );
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...BRAND.slateText);
      doc.text(modelLines, getColumnX(modelColIndex) + cellPaddingX, y + linePaddingY + 8);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...BRAND.indigo);
      doc.text(
        priceLines,
        getColumnX(priceColIndex) + tableColumns[priceColIndex].width - cellPaddingX,
        y + linePaddingY + 8,
        { align: "right" },
      );

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
        doc.setDrawColor(...BRAND.borderSoft);
        doc.setFillColor(...BRAND.white);
        doc.roundedRect(imgX - 2, imgY - 2, thumbWidth + 4, thumbHeight + 4, 3, 3, "FD");
        doc.addImage(imageAsset.dataUrl, imageAsset.format, imgX, imgY, thumbWidth, thumbHeight);
      } else {
        const placeholderWidth = 44;
        const placeholderHeight = 28;
        const placeholderX = thumbColX + (thumbColWidthValue - placeholderWidth) / 2;
        const placeholderY = y + (rowHeight - placeholderHeight) / 2;
        doc.setFillColor(...BRAND.cyanSoft);
        doc.setDrawColor(...BRAND.borderSoft);
        doc.roundedRect(placeholderX, placeholderY, placeholderWidth, placeholderHeight, 3, 3, "FD");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...BRAND.slateMuted);
        doc.text("Sin foto", thumbColX + thumbColWidthValue / 2, placeholderY + placeholderHeight / 2 + 2, {
          align: "center",
        });
      }

      y += rowHeight;
    }

    const tableHeight = y - tableTopY;
    doc.setDrawColor(...BRAND.border);
    doc.setLineWidth(0.8);
    doc.roundedRect(marginX, tableTopY - 4, usableWidth, tableHeight + 4, 6, 6, "S");

    y += 20;
  }

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.slateMuted);
    doc.text(`Catalogo Vedisa | Pagina ${page} de ${totalPages}`, pageWidth / 2, pageHeight - 18, {
      align: "center",
    });
  }

  return { doc, exportFileName, totalRows };
}

export function saveCatalogPdfDocument(doc: JsPdfDocument, exportFileName: string): void {
  doc.save(exportFileName);
}
