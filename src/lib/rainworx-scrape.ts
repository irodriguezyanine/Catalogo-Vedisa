import { load, type CheerioAPI } from "cheerio";

/** Dominio por defecto (configurable con RAINWORX_BASE_URL). */
export function getRainworxOrigin(): string {
  const raw = process.env.RAINWORX_BASE_URL ?? "https://vehiculoschocados.cl";
  return raw.replace(/\/$/, "");
}

const LOT_DETAILS_RE = /\/Event\/LotDetails\/(\d+)/i;

export function toAbsoluteUrl(origin: string, href: string): string {
  try {
    return new URL(href, origin).toString();
  } catch {
    return href;
  }
}

export function extractLotIdFromUrl(url: string): string | undefined {
  try {
    const u = new URL(url);
    const m = u.pathname.match(LOT_DETAILS_RE);
    return m?.[1];
  } catch {
    const m = url.match(LOT_DETAILS_RE);
    return m?.[1];
  }
}

/** Enlaces únicos a fichas de lote desde HTML de `/Event/Details/...`. */
export function extractLotDetailUrls(html: string, origin: string): string[] {
  const $ = load(html);
  const seen = new Set<string>();
  const out: string[] = [];
  $('a[href*="/Event/LotDetails/"]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const abs = toAbsoluteUrl(origin, href);
    const id = extractLotIdFromUrl(abs);
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(abs);
  });
  return out;
}

function normalizeDetailKey(label: string): string {
  return label
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function parseClpFromNumberParts($: CheerioAPI): number | undefined {
  const parts = $(".Bidding_Current_Price .NumberPart, .awe-rt-CurrentPrice .NumberPart")
    .first()
    .text()
    .trim();
  if (!parts) return undefined;
  const digits = parts.replace(/\./g, "").replace(/\s/g, "");
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) ? n : undefined;
}

function parsePrecioPromedioModelo($: CheerioAPI): number | undefined {
  const box = $("div[style*='background:#ffe9b3']").first().text();
  const m = box.match(/\$\s*([\d.]+)/);
  if (m) {
    const n = Number.parseInt(m[1].replace(/\./g, ""), 10);
    if (Number.isFinite(n)) return n;
  }
  const og = $('meta[property="og:description"]').attr("content") ?? "";
  const m2 = og.match(/Precio\s+Promedio[^$]*\$\s*([\d.]+)/i);
  if (m2) {
    const n = Number.parseInt(m2[1].replace(/\./g, ""), 10);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function extractOgImage($: CheerioAPI): string | undefined {
  const href = $('meta[property="og:image"]').attr("content");
  return href?.trim() || undefined;
}

function extractTitle($: CheerioAPI): string | undefined {
  const t = $("title").first().text().trim();
  if (t) {
    const cleaned = t.replace(/^[^:]+:\s*/, "").trim();
    return cleaned || t;
  }
  return $('meta[property="og:title"]').attr("content")?.trim();
}

/** URLs de galería (full size) si existen. */
function extractGalleryFullUrls($: CheerioAPI): string[] {
  const urls = new Set<string>();
  $("img[data-full-size-src]").each((_, el) => {
    const u = $(el).attr("data-full-size-src")?.trim();
    if (u?.startsWith("http")) urls.add(u);
  });
  return [...urls];
}

function extractDocumentos($: CheerioAPI, origin: string): RainworxDocumento[] {
  const out: RainworxDocumento[] = [];
  const seen = new Set<string>();
  $(".detail__documents__container a[href]").each((_, el) => {
    const href = $(el).attr("href")?.trim();
    if (!href) return;
    const abs = toAbsoluteUrl(origin, href);
    if (seen.has(abs)) return;
    seen.add(abs);
    const label = $(el).text().replace(/\s+/g, " ").trim() || abs.split("/").pop() || "Documento";
    out.push({ url: abs, label });
  });
  return out;
}

function extractDescripcionHtml($: CheerioAPI): string | undefined {
  const html = $(".detail__description-panel .panel-body.description").html();
  const trimmed = html?.trim();
  return trimmed || undefined;
}

function extractSubtitle($: CheerioAPI): string | undefined {
  const t = $(".detail__subtitle").first().text().replace(/\s+/g, " ").trim();
  return t || undefined;
}

function extractLoteDisplay($: CheerioAPI): string | undefined {
  const panelText = $(".detail__data-panel").text();
  const m = panelText.match(/Lote\s*#\s*(\d+)/i);
  return m?.[1]?.trim();
}

export type RainworxDocumento = {
  url: string;
  label: string;
};

export type RainworxLotScraped = {
  lotId: string;
  sourceUrl: string;
  title?: string;
  /** Subtítulo comercial bajo el título (p. ej. condición resumida). */
  subtitle?: string;
  /** Texto del lote visible en ficha (p. ej. "005"). */
  loteDisplay?: string;
  imagenPrincipal?: string;
  imagenes: string[];
  precioActualClp?: number;
  precioPromedioModeloClp?: number;
  /** PDFs y enlaces en "Documentos adicionales". */
  documentos: RainworxDocumento[];
  /** HTML del panel "Descripción" (columna derecha). */
  descripcionHtml?: string;
  /** Claves tal como aparecen en el sitio (ej. PATENTE, MARCA). */
  detalles: Record<string, string>;
  /** Misma información, claves normalizadas (snake_case ASCII). */
  detallesNormalizados: Record<string, string>;
};

/**
 * Parsea el HTML de una página `/Event/LotDetails/{id}/...`.
 */
export function parseLotDetailsHtml(html: string, sourceUrl: string): RainworxLotScraped {
  const $ = load(html);
  const lotId = extractLotIdFromUrl(sourceUrl) ?? "unknown";
  const origin = getRainworxOrigin();

  const detalles: Record<string, string> = {};
  $(".detail__data-panel .panel-body.description .row").each((_, row) => {
    const name = $(row).find(".detail__field-name").first().text().trim();
    const value = $(row).find(".detail__field-value").first().text().trim();
    if (name && value) {
      detalles[name] = value;
    }
  });

  const detallesNormalizados: Record<string, string> = {};
  for (const [k, v] of Object.entries(detalles)) {
    const nk = normalizeDetailKey(k);
    if (nk) detallesNormalizados[nk] = v;
  }

  const og = extractOgImage($);
  const gallery = extractGalleryFullUrls($);
  const imagenes = [...new Set([...(og ? [og] : []), ...gallery])];

  return {
    lotId,
    sourceUrl,
    title: extractTitle($),
    subtitle: extractSubtitle($),
    loteDisplay: extractLoteDisplay($),
    imagenPrincipal: og,
    imagenes,
    precioActualClp: parseClpFromNumberParts($),
    precioPromedioModeloClp: parsePrecioPromedioModelo($),
    documentos: extractDocumentos($, origin),
    descripcionHtml: extractDescripcionHtml($),
    detalles,
    detallesNormalizados,
  };
}

export async function fetchRainworxHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; VedisaCatalogBot/1.0; +https://vedisaremates.cl)",
      Accept: "text/html,application/xhtml+xml",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Rainworx HTTP ${res.status} al obtener ${url}`);
  }
  return res.text();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizePatenteKeyLocal(patente: string | undefined): string {
  if (!patente?.trim()) return "";
  return patente.toUpperCase().replace(/\s+/g, "").replace(/-/g, "");
}

export type ScrapeEventOptions = {
  eventPageUrl: string;
  /** Filtrar por patente normalizada (sin guiones, mayúsculas). */
  patente?: string;
  /** Solo incluye lotes cuya patente esté en este listado (p. ej. inventario del catálogo). */
  matchPatentes?: string[];
  maxLots?: number;
  delayMs?: number;
};

/**
 * Descarga la página del evento y luego cada ficha de lote (con pausa entre solicitudes).
 */
export async function scrapeEventLots(options: ScrapeEventOptions): Promise<RainworxLotScraped[]> {
  const origin = getRainworxOrigin();
  const eventUrl = toAbsoluteUrl(origin, options.eventPageUrl);
  const html = await fetchRainworxHtml(eventUrl);
  let urls = extractLotDetailUrls(html, origin);

  const wantPatente = normalizePatenteKeyLocal(options.patente);
  const matchSet =
    options.matchPatentes && options.matchPatentes.length > 0
      ? new Set(
          options.matchPatentes.map((p) => normalizePatenteKeyLocal(p)).filter(Boolean),
        )
      : null;
  const maxLots = options.maxLots ?? 80;
  const delayMs = options.delayMs ?? 200;

  const results: RainworxLotScraped[] = [];

  for (const lotUrl of urls) {
    if (results.length >= maxLots) break;
    const detailHtml = await fetchRainworxHtml(lotUrl);
    const parsed = parseLotDetailsHtml(detailHtml, lotUrl);
    const p = normalizePatenteKeyLocal(
      parsed.detalles.PATENTE ?? parsed.detallesNormalizados.patente,
    );

    if (wantPatente) {
      if (p !== wantPatente) {
        await sleep(delayMs);
        continue;
      }
    } else if (matchSet && matchSet.size > 0) {
      if (!p || !matchSet.has(p)) {
        await sleep(delayMs);
        continue;
      }
    }

    results.push(parsed);
    if (wantPatente && results.length > 0) break;
    await sleep(delayMs);
  }

  return results;
}
