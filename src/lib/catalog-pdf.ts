import type { CatalogItem } from "@/types/catalog";

export type CatalogPdfRow = {
  vehiclePrimary: string;
  vehicleSecondary: string;
  patent: string;
  model: string;
  priceLabel: string;
  thumbnailUrls: string[];
  /** Clave publica del vehiculo (patente o id) para enlaces al detalle. */
  vehicleKey: string;
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
  link(x: number, y: number, w: number, h: number, options: { url: string }): void;
};

const MAX_PDF_IMAGE_EDGE = 160;
const PDF_IMAGE_LOAD_CONCURRENCY = 6;
const PDF_IMAGE_FETCH_TIMEOUT_MS = 7_000;
const PDF_THUMBNAIL_CANDIDATES_PER_VEHICLE = 1;

const VEDISA_BRAND = {
  navy: [12, 28, 61] as const,
  navyDeep: [6, 18, 42] as const,
  navyMid: [22, 44, 88] as const,
  indigo: [67, 56, 202] as const,
  cyan: [8, 145, 178] as const,
  cyanBright: [14, 165, 233] as const,
  cyanDeep: [6, 116, 145] as const,
  gold: [245, 158, 11] as const,
  goldSoft: [255, 247, 237] as const,
  goldMuted: [251, 191, 36] as const,
  green: [22, 163, 74] as const,
  greenSoft: [220, 252, 231] as const,
  cyanSoft: [236, 254, 255] as const,
  cyanPale: [224, 242, 254] as const,
  slateText: [30, 41, 59] as const,
  slateMuted: [71, 85, 105] as const,
  slateLight: [148, 163, 184] as const,
  border: [203, 213, 225] as const,
  borderSoft: [226, 232, 240] as const,
  rowAlt: [248, 250, 252] as const,
  rowWhite: [255, 255, 255] as const,
  white: [255, 255, 255] as const,
};

const PDF_CATALOG_BASE_URL = "https://catalogo.vedisaremates.cl";

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

const VEDISA_PORTALS: ReadonlyArray<{ label: string; url: string }> = [
  { label: "www.vedisaremates.cl", url: "https://www.vedisaremates.cl" },
  { label: "catalogo.vedisaremates.cl", url: "https://catalogo.vedisaremates.cl/" },
  { label: "vehiculosdeocasion.cl", url: "https://vehiculosdeocasion.cl/" },
  { label: "vehiculoschocados.cl", url: "https://www.vehiculoschocados.cl" },
  { label: "rematatuauto.com", url: "https://www.rematatuauto.com/" },
];

const VEDISA_SOCIAL: ReadonlyArray<{ label: string; url: string }> = [
  { label: "Instagram", url: "https://www.instagram.com/vedisaremates" },
  { label: "Facebook", url: "https://www.facebook.com/vedisaremates" },
  { label: "TikTok", url: "https://www.tiktok.com/@vedisaremates" },
];

const PDF_SUPPRESSED_TAGLINE_FRAGMENTS = [
  "stock disponible para cierre rapido",
  "unidades disponibles para ofertar en remate",
  "publicaciones activas clasificadas como otros remates",
  "vehiculos activos en proximos remates",
] as const;

const PDF_PRICE_FOOTER = "+ gastos de impuestos y transferencias";

const PDF_LAYOUT = {
  marginX: 42,
  contentGap: 14,
  sectionGap: 28,
  pageFooterReserve: 50,
  pageHeaderHeight: 38,
  rowPadY: 12,
  rowLineH: 10.5,
  ruleWeight: 0.25,
  heroRatio: 0.4,
  iconColumn: 30,
  iconTextGap: 12,
  iconSize: 15,
  accentWidth: 3,
  tableHeaderHeight: 26,
  thumbRadius: 5,
  cardRadius: 10,
  coverLogoTop: 54,
  coverLogoToTitle: 52,
  coverTitleToStats: 28,
  closeLogoTop: 48,
  closeLogoToHeadline: 102,
  closeHeroRatio: 0.48,
  closeIconToLink: 22,
  closeLinkToSub: 18,
  linkPillPadX: 14,
  linkPillPadY: 8,
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

export function buildPdfVehicleDetailUrl(
  vehicleKey: string,
  baseUrl: string = PDF_CATALOG_BASE_URL,
): string {
  const key = vehicleKey.trim();
  if (!key) return "";
  return `${baseUrl.replace(/\/$/, "")}/vehiculos/${encodeURIComponent(key)}`;
}

/** Area clickeable transparente: no altera el diseno visual del PDF. */
function drawPdfInvisibleLink(
  doc: JsPdfDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  url: string,
) {
  const target = url.trim();
  if (!target || width <= 0 || height <= 0) return;
  doc.link(x, y, width, height, { url: target });
}

function drawPdfSoftCard(
  doc: JsPdfDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: readonly [number, number, number],
  border: readonly [number, number, number] = VEDISA_BRAND.borderSoft,
) {
  doc.setFillColor(...fill);
  doc.setDrawColor(...border);
  doc.setLineWidth(0.6);
  doc.roundedRect(x, y, width, height, PDF_LAYOUT.cardRadius, PDF_LAYOUT.cardRadius, "FD");
}

function drawPdfAccentDot(
  doc: JsPdfDocument,
  x: number,
  y: number,
  color: readonly [number, number, number] = VEDISA_BRAND.gold,
) {
  doc.setFillColor(...color);
  doc.circle(x, y, 2.2, "F");
}

function drawPdfHeroGradient(
  doc: JsPdfDocument,
  pageWidth: number,
  height: number,
  brand: typeof VEDISA_BRAND,
) {
  doc.setFillColor(...brand.navyDeep);
  doc.rect(0, 0, pageWidth, height, "F");
  doc.setFillColor(...brand.navyMid);
  doc.rect(0, height * 0.55, pageWidth, height * 0.45, "F");
  doc.setFillColor(...brand.cyanDeep);
  doc.setDrawColor(...brand.cyanBright);
  doc.setLineWidth(2.5);
  doc.line(0, height, pageWidth, height);
  doc.setFillColor(...brand.goldMuted);
  doc.circle(pageWidth * 0.12, height * 0.22, 42, "F");
  doc.setFillColor(...brand.navyDeep);
  doc.circle(pageWidth * 0.12, height * 0.22, 42, "F");
  doc.setFillColor(...brand.cyanBright);
  doc.circle(pageWidth - 36, height * 0.38, 18, "F");
  doc.setFillColor(...brand.navyDeep);
  doc.circle(pageWidth - 36, height * 0.38, 18, "F");
}

function extractPdfYear(...sources: string[]): string {
  for (const source of sources) {
    const match = sanitizeTextForPdf(source).match(/\b(19|20)\d{2}\b/);
    if (match) return match[0];
  }
  return "";
}

function shortenPdfText(text: string, maxLen: number): string {
  const clean = sanitizeTextForPdf(text);
  if (!clean) return "";
  if (clean.length <= maxLen) return clean;
  const slice = clean.slice(0, maxLen - 1).trim();
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace > maxLen * 0.55) return `${slice.slice(0, lastSpace)}...`;
  return `${slice}...`;
}

function resolvePdfModelCell(
  model: string,
  vehiclePrimary: string,
  vehicleSecondary: string,
): { year: string; lines: string[] } {
  const year = extractPdfYear(model, vehiclePrimary, vehicleSecondary);
  const primaryNorm = normalizeText(vehiclePrimary);
  let descriptor = sanitizeTextForPdf(model);

  if (year) descriptor = descriptor.replace(new RegExp(`\\b${year}\\b`, "g"), "").trim();
  descriptor = descriptor.replace(/\s+/g, " ").trim();

  if (descriptor) {
    const descriptorNorm = normalizeText(descriptor);
    if (descriptorNorm === primaryNorm || primaryNorm.includes(descriptorNorm)) {
      descriptor = "";
    }
  }

  if (!descriptor && vehicleSecondary) {
    const secondaryNorm = normalizeText(vehicleSecondary);
    if (secondaryNorm !== primaryNorm) {
      descriptor = shortenPdfText(vehicleSecondary, 28);
    }
  } else if (descriptor) {
    descriptor = shortenPdfText(descriptor, 28);
  }

  return { year, lines: descriptor ? [descriptor] : [] };
}

function measurePdfModelCell(
  doc: JsPdfDocument,
  cell: { year: string; lines: string[] },
  innerWidth: number,
): number {
  let height = 8;
  if (cell.year) height += 18;
  if (cell.lines.length > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    height += doc.splitTextToSize(cell.lines[0] ?? "", innerWidth).length * 9 + 4;
  }
  return Math.max(22, height);
}

function drawPdfModelCell(
  doc: JsPdfDocument,
  cell: { year: string; lines: string[] },
  x: number,
  y: number,
  width: number,
  brand: typeof VEDISA_BRAND,
) {
  const innerX = x + 6;
  const innerWidth = Math.max(12, width - 12);
  const centerX = x + width / 2;
  let cursorY = y + 12;

  if (cell.year) {
    const badgeW = 34;
    const badgeH = 15;
    doc.setFillColor(...brand.cyanPale);
    doc.setDrawColor(...brand.cyan);
    doc.setLineWidth(0.5);
    doc.roundedRect(centerX - badgeW / 2, cursorY - 10, badgeW, badgeH, 4, 4, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...brand.cyanDeep);
    doc.text(cell.year, centerX, cursorY, { align: "center" });
    cursorY += 16;
  }

  if (cell.lines.length > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...brand.slateMuted);
    const lines = doc.splitTextToSize(cell.lines[0] ?? "", innerWidth);
    doc.text(lines, innerX, cursorY);
  } else if (!cell.year) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...brand.slateLight);
    doc.text("-", centerX, cursorY, { align: "center" });
  }
}

function drawPdfPricePill(
  doc: JsPdfDocument,
  priceLabel: string,
  footerLines: string[],
  centerX: number,
  midY: number,
  maxWidth: number,
  brand: typeof VEDISA_BRAND,
) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.5);
  const priceWidth = doc.getTextWidth(priceLabel);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.5);
  const footerWidth = footerLines.length > 0 ? doc.getTextWidth(footerLines[0] ?? "") : 0;
  const pillW = Math.min(maxWidth - 8, Math.max(priceWidth, footerWidth) + 18);
  const pillH = footerLines.length > 0 ? 34 : 24;
  const pillX = centerX - pillW / 2;
  const pillY = midY - pillH / 2;

  doc.setFillColor(...brand.cyanSoft);
  doc.setDrawColor(...brand.cyanPale);
  doc.setLineWidth(0.5);
  doc.roundedRect(pillX, pillY, pillW, pillH, 8, 8, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.5);
  doc.setTextColor(...brand.navy);
  doc.text(priceLabel, centerX, pillY + 14, { align: "center" });

  if (footerLines.length > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(...brand.slateMuted);
    doc.text(footerLines, centerX, pillY + 26, { align: "center" });
  }
}

function drawPdfThumbnailFrame(
  doc: JsPdfDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  brand: typeof VEDISA_BRAND,
) {
  doc.setFillColor(...brand.rowWhite);
  doc.setDrawColor(...brand.border);
  doc.setLineWidth(0.7);
  doc.roundedRect(x - 2, y - 2, width + 4, height + 4, PDF_LAYOUT.thumbRadius + 1, PDF_LAYOUT.thumbRadius + 1, "FD");
}

function drawPdfLinkPill(
  doc: JsPdfDocument,
  label: string,
  centerX: number,
  y: number,
  fontSize: number,
  brand: typeof VEDISA_BRAND,
  linkUrl?: string,
) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(fontSize);
  const textWidth = doc.getTextWidth(label);
  const pillW = textWidth + PDF_LAYOUT.linkPillPadX * 2;
  const pillH = fontSize + PDF_LAYOUT.linkPillPadY * 2;
  const pillX = centerX - pillW / 2;
  const pillY = y - fontSize - PDF_LAYOUT.linkPillPadY + 2;

  doc.setFillColor(...brand.cyanSoft);
  doc.setDrawColor(...brand.cyan);
  doc.setLineWidth(0.7);
  doc.roundedRect(pillX, pillY, pillW, pillH, pillH / 2, pillH / 2, "FD");

  doc.setTextColor(...brand.cyanDeep);
  doc.text(label, centerX, y, { align: "center" });
  doc.setDrawColor(...brand.cyan);
  doc.setLineWidth(0.6);
  doc.line(centerX - textWidth / 2, y + 3, centerX + textWidth / 2, y + 3);

  if (linkUrl) {
    drawPdfInvisibleLink(doc, pillX, pillY, pillW, pillH, linkUrl);
  }
}

function drawPdfFooterTextLink(
  doc: JsPdfDocument,
  label: string,
  x: number,
  y: number,
  maxWidth: number,
  brand: typeof VEDISA_BRAND,
  url: string,
  align: "left" | "center" = "left",
) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...brand.cyanBright);
  const anchorX = align === "center" ? x + maxWidth / 2 : x;
  doc.text(label, anchorX, y, { align });
  const textWidth = doc.getTextWidth(label);
  const linkX = align === "center" ? anchorX - textWidth / 2 : x;
  drawPdfInvisibleLink(doc, linkX, y - 9, textWidth, 12, url);
}

function drawPdfSocialChip(
  doc: JsPdfDocument,
  label: string,
  centerX: number,
  y: number,
  brand: typeof VEDISA_BRAND,
  url: string,
) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  const textWidth = doc.getTextWidth(label);
  const chipW = textWidth + 16;
  const chipH = 18;
  const chipX = centerX - chipW / 2;
  const chipY = y - 12;
  doc.setFillColor(...brand.navyMid);
  doc.setDrawColor(...brand.cyan);
  doc.setLineWidth(0.6);
  doc.roundedRect(chipX, chipY, chipW, chipH, 9, 9, "FD");
  doc.setTextColor(...brand.white);
  doc.text(label, centerX, y, { align: "center" });
  drawPdfInvisibleLink(doc, chipX, chipY, chipW, chipH, url);
}

function drawPdfCorporateCloseFooter(
  doc: JsPdfDocument,
  startY: number,
  pageWidth: number,
  pageHeight: number,
  marginX: number,
  usableWidth: number,
  pageRight: number,
  brand: typeof VEDISA_BRAND,
  totalPages: number,
) {
  const footerHeight = pageHeight - startY;
  doc.setFillColor(...brand.navyDeep);
  doc.rect(0, startY, pageWidth, footerHeight, "F");
  doc.setDrawColor(...brand.cyanBright);
  doc.setLineWidth(2);
  doc.line(marginX, startY + 6, pageRight, startY + 6);

  let y = startY + 28;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...brand.white);
  doc.text("ECOSISTEMA VEDISA", pageWidth / 2, y, { align: "center" });
  y += 20;

  const colW = usableWidth / 2 - 10;
  const leftX = marginX + 8;
  const rightX = marginX + usableWidth / 2 + 12;
  let leftY = y;
  let rightY = y;
  for (let i = 0; i < VEDISA_PORTALS.length; i += 1) {
    const portal = VEDISA_PORTALS[i];
    if (!portal) continue;
    if (i % 2 === 0) {
      drawPdfFooterTextLink(doc, portal.label, leftX, leftY, colW, brand, portal.url);
      leftY += 17;
    } else {
      drawPdfFooterTextLink(doc, portal.label, rightX, rightY, colW, brand, portal.url);
      rightY += 17;
    }
  }
  y = Math.max(leftY, rightY) + 14;

  doc.setDrawColor(...brand.navyMid);
  doc.setLineWidth(0.6);
  doc.line(marginX + 20, y, pageRight - 20, y);
  y += 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...brand.goldMuted);
  doc.text("Siguenos en:", pageWidth / 2, y, { align: "center" });
  y += 20;

  const chipGap = 96;
  const socialStartX = pageWidth / 2 - ((VEDISA_SOCIAL.length - 1) * chipGap) / 2;
  VEDISA_SOCIAL.forEach((social, index) => {
    drawPdfSocialChip(doc, social.label, socialStartX + index * chipGap, y, brand, social.url);
  });
  y += 30;

  doc.setDrawColor(...brand.navyMid);
  doc.line(marginX + 20, y, pageRight - 20, y);
  y += 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...brand.white);
  doc.text(VEDISA_CONTACT.whatsapp, pageWidth / 2, y, { align: "center" });
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...brand.slateLight);
  doc.text("WhatsApp - Contact Center", pageWidth / 2, y, { align: "center" });
  y += 16;
  doc.text(VEDISA_CONTACT.offices, pageWidth / 2, y, { align: "center" });
  y += 12;
  doc.text(VEDISA_CONTACT.exhibition, pageWidth / 2, y, { align: "center" });
  y += 12;
  doc.text(VEDISA_CONTACT.hours, pageWidth / 2, y, { align: "center" });
  y += 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...brand.goldMuted);
  doc.text(VEDISA_CONTACT.onlineTitle, pageWidth / 2, y, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...brand.slateLight);
  doc.text(`Pagina ${totalPages} de ${totalPages}`, pageWidth / 2, pageHeight - 14, { align: "center" });
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
  const textX = x + PDF_LAYOUT.iconColumn + PDF_LAYOUT.iconTextGap;
  const textWidth = maxWidth - PDF_LAYOUT.iconColumn - PDF_LAYOUT.iconTextGap - 4;
  const lines = doc.splitTextToSize(sanitizeTextForPdf(text), textWidth);
  const blockHeight = Math.max(24, lines.length * 12 + 8);
  const iconY = y + blockHeight / 2;

  doc.setFillColor(...VEDISA_BRAND.cyanSoft);
  doc.setDrawColor(...VEDISA_BRAND.cyanPale);
  doc.setLineWidth(0.5);
  doc.circle(x + PDF_LAYOUT.iconColumn / 2, iconY, 11, "FD");
  drawPdfIcon(doc, icon, x + PDF_LAYOUT.iconColumn / 2, iconY, PDF_LAYOUT.iconSize, iconColor);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...textColor);
  doc.text(lines, textX, y + 12);
  return blockHeight + 8;
}

function isPdfSuppressedTagline(value: string): boolean {
  const norm = normalizeText(sanitizeTextForPdf(value));
  if (!norm) return true;
  return PDF_SUPPRESSED_TAGLINE_FRAGMENTS.some(
    (fragment) => norm === fragment || norm.includes(fragment),
  );
}

function resolveSectionTagline(secondary: string, tagline: string): string {
  const cleanTagline = tagline.trim();
  if (!cleanTagline || isPdfSuppressedTagline(cleanTagline)) return "";
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
  const bandHeight = layout.totalHeight + 8;
  drawPdfSoftCard(doc, x, y, width, bandHeight, brand.goldSoft, brand.borderSoft);
  drawPdfAccentDot(doc, x + 14, y + 14, brand.gold);

  const titleX = x + PDF_LAYOUT.accentWidth + 18;
  const textWidth = width - PDF_LAYOUT.accentWidth - 110;

  doc.setDrawColor(...brand.cyan);
  doc.setLineWidth(PDF_LAYOUT.accentWidth);
  doc.line(x + 8, y + 10, x + 8, y + bandHeight - 10);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14.5);
  doc.setTextColor(...brand.navy);
  doc.text(parsed.primary, titleX, y + 18);

  const countLabel = `${parsed.count} vehiculo${parsed.count === 1 ? "" : "s"}`;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  const badgeW = doc.getTextWidth(countLabel) + 14;
  const badgeX = pageRight - badgeW;
  doc.setFillColor(...brand.cyanPale);
  doc.setDrawColor(...brand.cyan);
  doc.setLineWidth(0.5);
  doc.roundedRect(badgeX, y + 8, badgeW, 16, 8, 8, "FD");
  doc.setTextColor(...brand.cyanDeep);
  doc.text(countLabel, badgeX + badgeW / 2, y + 18, { align: "center" });

  let cursor = y + 32;
  if (layout.secondaryLines.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...brand.indigo);
    doc.text(layout.secondaryLines, titleX, cursor);
    cursor += layout.secondaryLines.length * 12 + 4;
  }

  if (layout.taglineLines.length > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...brand.slateMuted);
    doc.text(layout.taglineLines, titleX, cursor);
  }

  return bandHeight;
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
  options?: { showPatents?: boolean; catalogBaseUrl?: string },
): Promise<{ doc: JsPdfDocument; exportFileName: string; totalRows: number }> {
  const showPatents = options?.showPatents !== false;
  const catalogBaseUrl = options?.catalogBaseUrl?.trim() || PDF_CATALOG_BASE_URL;
  const catalogHomeUrl = catalogBaseUrl.replace(/\/$/, "");
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

  // --- Portada premium ---
  const heroHeight = Math.round(pageHeight * PDF_LAYOUT.heroRatio);
  drawPdfHeroGradient(doc, pageWidth, heroHeight, BRAND);

  let coverCursorY = PDF_LAYOUT.coverLogoTop;
  if (logoDataUrl) {
    const { width: logoWidth, height: logoHeight } = fitDimensionsByAspect(logoAspectRatio, 220, 54);
    doc.addImage(logoDataUrl, "PNG", (pageWidth - logoWidth) / 2, coverCursorY, logoWidth, logoHeight);
    coverCursorY += logoHeight + PDF_LAYOUT.coverLogoToTitle;
  } else {
    coverCursorY += PDF_LAYOUT.coverLogoToTitle;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(30);
  doc.setTextColor(...BRAND.white);
  doc.text("Catalogo Vedisa", pageWidth / 2, coverCursorY, { align: "center" });
  coverCursorY += 24;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12.5);
  doc.setTextColor(191, 219, 254);
  doc.text("Remates y venta directa", pageWidth / 2, coverCursorY, { align: "center" });
  coverCursorY += 18;

  const coverDate = sanitizeTextForPdf(
    now.toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" }),
  );
  const coverTime = sanitizeTextForPdf(
    now.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }),
  );
  doc.setFontSize(8.5);
  doc.setTextColor(...BRAND.slateLight);
  doc.text(`Actualizado ${coverDate} - ${coverTime}`, pageWidth / 2, coverCursorY, { align: "center" });
  coverCursorY += PDF_LAYOUT.coverTitleToStats;

  const statsCardW = 220;
  const statsCardH = 72;
  const statsCardX = (pageWidth - statsCardW) / 2;
  drawPdfSoftCard(doc, statsCardX, coverCursorY, statsCardW, statsCardH, BRAND.navyMid, BRAND.cyan);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(44);
  doc.setTextColor(...BRAND.white);
  doc.text(String(totalRows), pageWidth / 2, coverCursorY + 34, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(191, 219, 254);
  doc.text("publicaciones disponibles", pageWidth / 2, coverCursorY + 52, { align: "center" });
  doc.setFontSize(8);
  doc.text(
    `${sections.length} categoria${sections.length === 1 ? "" : "s"} comerciales`,
    pageWidth / 2,
    coverCursorY + 64,
    { align: "center" },
  );

  let coverInfoY = heroHeight + 28;
  const contactCardH = 148;
  drawPdfSoftCard(doc, marginX, coverInfoY, usableWidth, contactCardH, BRAND.cyanSoft, BRAND.border);
  coverInfoY += 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...BRAND.navy);
  doc.text("Visitanos y conoce nuestras unidades", marginX + 16, coverInfoY);
  coverInfoY += 20;

  const coverInfoItems: Array<{ icon: PdfIconKind; value: string }> = [
    { icon: "office", value: VEDISA_CONTACT.offices },
    { icon: "location", value: VEDISA_CONTACT.exhibition },
    { icon: "clock", value: VEDISA_CONTACT.hours },
  ];
  for (const item of coverInfoItems) {
    coverInfoY += drawPdfInfoLine(
      doc,
      item.icon,
      item.value,
      marginX + 12,
      coverInfoY,
      usableWidth - 24,
      BRAND.cyan,
    );
  }

  coverInfoY = heroHeight + contactCardH + 40;
  const onlineCardH = 62;
  drawPdfSoftCard(doc, marginX, coverInfoY, usableWidth, onlineCardH, BRAND.goldSoft, BRAND.goldMuted);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...BRAND.navy);
  doc.text(VEDISA_CONTACT.onlineTitle, marginX + 16, coverInfoY + 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...BRAND.slateMuted);
  const onlineLines = doc.splitTextToSize(
    sanitizeTextForPdf(VEDISA_CONTACT.onlineBody),
    usableWidth - 32,
  );
  doc.text(onlineLines, marginX + 16, coverInfoY + 32);

  const coverLinkY = pageHeight - 58;
  drawPdfIcon(doc, "globe", pageWidth / 2, coverLinkY - PDF_LAYOUT.closeIconToLink, 16, BRAND.cyan);
  drawPdfLinkPill(
    doc,
    VEDISA_CONTACT.catalogUrl,
    pageWidth / 2,
    coverLinkY,
    11.5,
    BRAND,
    catalogHomeUrl,
  );

  // --- Detalle comercial ---
  doc.addPage();
  let y = 42;

  const drawPageHeader = () => {
    doc.setFillColor(...BRAND.rowAlt);
    doc.rect(0, 0, pageWidth, PDF_LAYOUT.pageHeaderHeight - 2, "F");
    if (logoDataUrl) {
      const { width: headerLogoWidth, height: headerLogoHeight } = fitDimensionsByAspect(
        logoAspectRatio,
        82,
        22,
      );
      doc.addImage(logoDataUrl, "PNG", marginX, 10, headerLogoWidth, headerLogoHeight);
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...BRAND.slateMuted);
    doc.text(todayLabel, pageRight, 22, { align: "right" });
    doc.setDrawColor(...BRAND.cyan);
    doc.setLineWidth(1);
    doc.line(marginX, PDF_LAYOUT.pageHeaderHeight - 1, pageRight, PDF_LAYOUT.pageHeaderHeight - 1);
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
  const patentColWidth = showPatents ? 56 : 0;
  const modelColWidth = 76;
  const vehicleColWidth = Math.max(
    160,
    usableWidth - priceColWidth - thumbColWidth - patentColWidth - modelColWidth,
  );

  const tableColumns = [
    { key: "vehicle" as const, label: "Vehiculo", width: vehicleColWidth, align: "left" as const },
    ...(showPatents
      ? [{ key: "patent" as const, label: "Patente", width: patentColWidth, align: "center" as const }]
      : []),
    { key: "model" as const, label: "Ano / Detalle", width: modelColWidth, align: "center" as const },
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

  let rowStripeIndex = 0;

  const drawTableHeader = () => {
    const headerH = PDF_LAYOUT.tableHeaderHeight;
    doc.setFillColor(...BRAND.navy);
    doc.rect(marginX, y, usableWidth, headerH, "F");
    let x = marginX;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...BRAND.white);
    for (const column of tableColumns) {
      const label = column.label.toUpperCase();
      if (column.align === "center") {
        doc.text(label, x + column.width / 2, y + 16, { align: "center" });
      } else {
        doc.text(label, x + cellPaddingX, y + 16);
      }
      x += column.width;
    }
    y += headerH + 4;
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
    rowStripeIndex = 0;

    for (const row of section.rows) {
      const linePaddingY = PDF_LAYOUT.rowPadY;
      const lineHeight = PDF_LAYOUT.rowLineH;
      const vehiclePrimary = sanitizeTextForPdf(row.vehiclePrimary);
      const vehicleSecondary = sanitizeTextForPdf(row.vehicleSecondary);
      const patent = sanitizeTextForPdf(row.patent);
      const model = sanitizeTextForPdf(row.model);
      const priceLabel = sanitizeTextForPdf(row.priceLabel);
      const modelCell = resolvePdfModelCell(model, vehiclePrimary, vehicleSecondary);

      const vehicleInnerWidth = Math.max(16, tableColumns[vehicleColIndex].width - cellPaddingX * 2);
      const patentInnerWidth =
        patentColIndex >= 0
          ? Math.max(16, tableColumns[patentColIndex].width - cellPaddingX * 2)
          : 0;
      const modelInnerWidth = Math.max(16, tableColumns[modelColIndex].width - 12);
      const priceInnerWidth = Math.max(16, tableColumns[priceColIndex].width - cellPaddingX * 2);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      const vehiclePrimaryLines = doc.splitTextToSize(vehiclePrimary, vehicleInnerWidth);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      const vehicleSecondaryLines = vehicleSecondary
        ? doc.splitTextToSize(vehicleSecondary, vehicleInnerWidth)
        : [];
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      const patentLines =
        showPatents && patentInnerWidth > 0
          ? doc.splitTextToSize(patent, patentInnerWidth)
          : [];
      const modelBlockHeight = measurePdfModelCell(doc, modelCell, modelInnerWidth);
      const hasPrice = !isPdfPriceMissing(priceLabel);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5.5);
      const priceFooterLines = hasPrice
        ? doc.splitTextToSize(PDF_PRICE_FOOTER, priceInnerWidth)
        : [];
      const priceBlockHeight = hasPrice ? 36 : 18;

      const vehicleLineCount = Math.max(1, vehiclePrimaryLines.length + vehicleSecondaryLines.length);
      const textBlockLines = Math.max(
        vehicleLineCount,
        patentLines.length,
        Math.ceil(modelBlockHeight / lineHeight),
        Math.ceil(priceBlockHeight / lineHeight),
      );
      const rowHeight = Math.max(
        thumbMaxHeight + linePaddingY * 2 + 6,
        textBlockLines * lineHeight + linePaddingY * 2 + 6,
      );

      ensureSpace(rowHeight + 6, true);
      const rowMidY = y + rowHeight / 2;
      const rowFill: readonly [number, number, number] =
        rowStripeIndex % 2 === 0 ? BRAND.rowWhite : BRAND.rowAlt;
      rowStripeIndex += 1;

      doc.setFillColor(rowFill[0], rowFill[1], rowFill[2]);
      doc.rect(marginX, y, usableWidth, rowHeight, "F");

      const vehicleX = getColumnX(vehicleColIndex) + cellPaddingX;
      let textY = y + linePaddingY + 10;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...BRAND.navy);
      doc.text(vehiclePrimaryLines, vehicleX, textY);
      textY += vehiclePrimaryLines.length * lineHeight;
      if (vehicleSecondaryLines.length > 0) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7.5);
        doc.setTextColor(...BRAND.slateMuted);
        doc.text(vehicleSecondaryLines, vehicleX, textY);
      }

      if (showPatents && patentColIndex >= 0) {
        const patentColX = getColumnX(patentColIndex);
        const patentColW = tableColumns[patentColIndex].width;
        const patentCenterX = patentColX + patentColW / 2;
        const patentBadgeW = Math.min(patentColW - 8, Math.max(40, doc.getTextWidth(patent) + 12));
        doc.setFillColor(...BRAND.cyanPale);
        doc.setDrawColor(...BRAND.cyan);
        doc.setLineWidth(0.5);
        doc.roundedRect(
          patentCenterX - patentBadgeW / 2,
          rowMidY - 9,
          patentBadgeW,
          16,
          4,
          4,
          "FD",
        );
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...BRAND.navy);
        doc.text(patentLines, patentCenterX, rowMidY + 2, { align: "center" });
      }

      drawPdfModelCell(
        doc,
        modelCell,
        getColumnX(modelColIndex),
        y,
        tableColumns[modelColIndex].width,
        BRAND,
      );

      const priceColX = getColumnX(priceColIndex);
      const priceColW = tableColumns[priceColIndex].width;
      const priceCenterX = priceColX + priceColW / 2;
      if (hasPrice) {
        drawPdfPricePill(
          doc,
          priceLabel,
          priceFooterLines,
          priceCenterX,
          rowMidY,
          priceColW,
          BRAND,
        );
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
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
        drawPdfThumbnailFrame(doc, imgX, imgY, thumbWidth, thumbHeight, BRAND);
        doc.addImage(imageAsset.dataUrl, imageAsset.format, imgX, imgY, thumbWidth, thumbHeight);
      } else {
        const placeholderWidth = 48;
        const placeholderHeight = 32;
        const placeholderX = thumbColX + (thumbColWidthValue - placeholderWidth) / 2;
        const placeholderY = y + (rowHeight - placeholderHeight) / 2;
        drawPdfThumbnailFrame(doc, placeholderX, placeholderY, placeholderWidth, placeholderHeight, BRAND);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(...BRAND.slateMuted);
        doc.text("Sin foto", thumbColX + thumbColWidthValue / 2, placeholderY + placeholderHeight / 2 + 2, {
          align: "center",
        });
      }

      doc.setDrawColor(...BRAND.borderSoft);
      doc.setLineWidth(PDF_LAYOUT.ruleWeight);
      doc.line(marginX, y + rowHeight, marginX + usableWidth, y + rowHeight);

      const detailUrl = buildPdfVehicleDetailUrl(row.vehicleKey, catalogBaseUrl);
      drawPdfInvisibleLink(doc, marginX, y, usableWidth, rowHeight, detailUrl);

      y += rowHeight;
    }

    y += PDF_LAYOUT.contentGap;
  }

  // --- Cierre premium ---
  doc.addPage();
  const closeHeroHeight = Math.round(pageHeight * PDF_LAYOUT.closeHeroRatio);
  const closeFooterStartY = closeHeroHeight;
  drawPdfHeroGradient(doc, pageWidth, closeHeroHeight, BRAND);

  let closeCursorY = PDF_LAYOUT.closeLogoTop;
  if (logoDataUrl) {
    const { width: closeLogoW, height: closeLogoH } = fitDimensionsByAspect(logoAspectRatio, 190, 48);
    doc.addImage(logoDataUrl, "PNG", (pageWidth - closeLogoW) / 2, closeCursorY, closeLogoW, closeLogoH);
    closeCursorY += closeLogoH + PDF_LAYOUT.closeLogoToHeadline;
  } else {
    closeCursorY += PDF_LAYOUT.closeLogoToHeadline;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...BRAND.white);
  doc.text("Puedes ver el detalle", pageWidth / 2, closeCursorY, { align: "center" });
  closeCursorY += 30;
  doc.text("en nuestro catalogo", pageWidth / 2, closeCursorY, { align: "center" });
  closeCursorY += 24;

  doc.setDrawColor(...BRAND.goldMuted);
  doc.setLineWidth(1.5);
  const headlineW = 200;
  doc.line(pageWidth / 2 - headlineW / 2, closeCursorY, pageWidth / 2 + headlineW / 2, closeCursorY);
  closeCursorY += PDF_LAYOUT.closeIconToLink + 12;

  drawPdfIcon(doc, "globe", pageWidth / 2, closeCursorY, 16, BRAND.cyanBright);
  closeCursorY += PDF_LAYOUT.closeIconToLink + 4;
  drawPdfLinkPill(doc, VEDISA_CONTACT.catalogUrl, pageWidth / 2, closeCursorY, 13, BRAND, catalogHomeUrl);
  closeCursorY += PDF_LAYOUT.closeLinkToSub + 14;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(191, 219, 254);
  doc.text("o venir a nuestras instalaciones", pageWidth / 2, closeCursorY, { align: "center" });
  closeCursorY += 26;

  drawPdfIcon(doc, "location", pageWidth / 2, closeCursorY, 14, BRAND.cyanBright);
  closeCursorY += 20;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...BRAND.white);
  doc.text(VEDISA_CONTACT.exhibition, pageWidth / 2, closeCursorY, { align: "center" });

  const totalPages = doc.getNumberOfPages();
  drawPdfCorporateCloseFooter(
    doc,
    closeFooterStartY,
    pageWidth,
    pageHeight,
    marginX,
    usableWidth,
    pageRight,
    BRAND,
    totalPages,
  );

  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    if (page === 1 || page === totalPages) continue;
    doc.setFillColor(...BRAND.rowAlt);
    doc.rect(0, pageHeight - PDF_LAYOUT.pageFooterReserve, pageWidth, PDF_LAYOUT.pageFooterReserve, "F");
    doc.setDrawColor(...BRAND.cyan);
    doc.setLineWidth(0.8);
    doc.line(marginX, pageHeight - PDF_LAYOUT.pageFooterReserve + 6, pageRight, pageHeight - PDF_LAYOUT.pageFooterReserve + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...BRAND.slateMuted);
    doc.text(`Pagina ${page} de ${totalPages}`, pageWidth / 2, pageHeight - 20, { align: "center" });
    if (page > 1 && page < totalPages) {
      drawPdfIcon(doc, "globe", marginX + 14, pageHeight - 22, 9, BRAND.cyan);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...BRAND.cyanDeep);
      doc.text(VEDISA_CONTACT.catalogUrl, marginX + 30, pageHeight - 18);
    }
  }

  return { doc, exportFileName, totalRows };
}

export function saveCatalogPdfDocument(doc: JsPdfDocument, exportFileName: string): void {
  doc.save(exportFileName);
}
