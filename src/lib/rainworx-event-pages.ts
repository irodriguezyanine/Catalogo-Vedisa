import { load } from "cheerio";
import {
  extractLotIdFromUrl,
  fetchRainworxHtml,
  getRainworxOrigin,
  toAbsoluteUrl,
} from "@/lib/rainworx-scrape";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Asegura listado activo (coincide con badges de categoría en Rainworx). */
export function ensureActiveOnlyEventListUrl(eventPageUrl: string): string {
  const origin = getRainworxOrigin();
  const abs = toAbsoluteUrl(origin, eventPageUrl);
  try {
    const u = new URL(abs);
    if (!u.searchParams.has("StatusFilter")) {
      u.searchParams.set("StatusFilter", "active_only");
    }
    if (!u.searchParams.has("ViewStyle")) {
      u.searchParams.set("ViewStyle", "list");
    }
    return u.toString().split("#")[0]!;
  } catch {
    return abs;
  }
}

/** IDs de evento Rainworx desde `/Event/Details/{eventId}/...`. */
export function extractRainworxEventId(eventUrl: string): string | undefined {
  try {
    const pathname = new URL(eventUrl, getRainworxOrigin()).pathname;
    return pathname.match(/\/Event\/Details\/(\d+)/i)?.[1];
  } catch {
    return eventUrl.match(/\/Event\/Details\/(\d+)/i)?.[1];
  }
}

/** URLs de lotes desde secciones de listado (evita enlaces del menú). */
export function extractEventListingLotUrls(html: string, origin: string): string[] {
  const $ = load(html);
  const seen = new Set<string>();
  const out: string[] = [];

  const pushHref = (href: string | undefined) => {
    if (!href?.trim()) return;
    const abs = toAbsoluteUrl(origin, href.trim());
    const id = extractLotIdFromUrl(abs);
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(abs);
  };

  $("section[data-listingid]").each((_, section) => {
    $(section)
      .find('a[href*="/Event/LotDetails/"]')
      .each((__, el) => {
        pushHref($(el).attr("href"));
      });
  });

  if (out.length === 0) {
    $('a[href*="/Event/LotDetails/"]').each((_, el) => {
      pushHref($(el).attr("href"));
    });
  }

  return out;
}

/** Páginas paginadas del mismo evento (`?page=0`, `?page=1`, …). */
export function extractEventPaginationUrls(html: string, eventPageUrl: string): string[] {
  const origin = getRainworxOrigin();
  const eventUrlAbs = ensureActiveOnlyEventListUrl(eventPageUrl);
  const eventId = extractRainworxEventId(eventUrlAbs);
  if (!eventId) return [eventUrlAbs];

  const $ = load(html);
  const pages = new Set<string>();
  pages.add(eventUrlAbs);

  $("ul.pagination a[href]").each((_, el) => {
    const href = $(el).attr("href")?.trim();
    if (!href || href === "#") return;
    const abs = ensureActiveOnlyEventListUrl(toAbsoluteUrl(origin, href));
    if (!abs.includes(`/Event/Details/${eventId}`)) return;
    pages.add(abs.split("#")[0]!);
  });

  return [...pages].sort((a, b) => a.localeCompare(b));
}

/** Sub-rutas de categoría dentro del evento (`.../C173241/LIVIANOS`). */
export function extractEventCategoryPageUrls(html: string, eventPageUrl: string): string[] {
  const origin = getRainworxOrigin();
  const eventUrlAbs = ensureActiveOnlyEventListUrl(eventPageUrl);
  const eventId = extractRainworxEventId(eventUrlAbs);
  if (!eventId) return [];

  const $ = load(html);
  const categories = new Set<string>();
  const eventPathPrefix = `/Event/Details/${eventId}/`;

  $("a[href*='/Event/Details/']").each((_, el) => {
    const href = $(el).attr("href")?.trim();
    if (!href) return;
    const abs = ensureActiveOnlyEventListUrl(toAbsoluteUrl(origin, href)).split("#")[0]!;
    if (!abs.includes(eventPathPrefix)) return;
    if (!/\/C\d+\//i.test(abs)) return;
    categories.add(abs);
  });

  return [...categories].sort((a, b) => a.localeCompare(b));
}

function readExpectedLotCountFromBadges(html: string): number | undefined {
  const $ = load(html);
  const seenPaths = new Set<string>();
  let total = 0;
  $("a[href*='/Event/Details/']").each((_, el) => {
    const href = $(el).attr("href")?.trim();
    if (!href || !/\/C\d+\//i.test(href)) return;
    const path = href.split("?")[0]!;
    if (seenPaths.has(path)) return;
    const badgeText = $(el).find(".category-badge__container .badge").first().text().trim();
    const count = Number.parseInt(badgeText, 10);
    if (!Number.isFinite(count) || count <= 0) return;
    seenPaths.add(path);
    total += count;
  });
  return total > 0 ? total : undefined;
}

async function collectLotUrlsForEventPages(
  pageUrls: string[],
  origin: string,
  firstHtml: string | null,
  firstPageUrl: string,
  delayMs: number,
): Promise<Map<string, string>> {
  const lotUrlById = new Map<string, string>();
  const firstKey = firstPageUrl.split("?")[0]!;

  for (let index = 0; index < pageUrls.length; index += 1) {
    const pageUrl = pageUrls[index]!;
    const html =
      index === 0 && firstHtml && pageUrl.split("?")[0] === firstKey
        ? firstHtml
        : await fetchRainworxHtml(pageUrl);
    for (const lotUrl of extractEventListingLotUrls(html, origin)) {
      const id = extractLotIdFromUrl(lotUrl);
      if (!id) continue;
      lotUrlById.set(id, lotUrl);
    }
    if (index + 1 < pageUrls.length && delayMs > 0) await sleep(delayMs);
  }

  return lotUrlById;
}

export async function collectAllEventLotDetailUrls(
  eventPageUrl: string,
  delayMs = 150,
): Promise<{ lotUrls: string[]; pagesFetched: number; expectedFromBadges?: number }> {
  const origin = getRainworxOrigin();
  const eventUrlAbs = ensureActiveOnlyEventListUrl(eventPageUrl);
  const firstHtml = await fetchRainworxHtml(eventUrlAbs);
  const categoryRoots = extractEventCategoryPageUrls(firstHtml, eventUrlAbs);
  const expectedFromBadges = readExpectedLotCountFromBadges(firstHtml);

  const lotUrlById = new Map<string, string>();
  let pagesFetched = 0;

  const eventPathBase = eventUrlAbs.split("?")[0]!;
  const rootsToWalk =
    categoryRoots.length > 0 ? categoryRoots : [eventPathBase];

  for (const rootUrl of rootsToWalk) {
    const rootKey = rootUrl.split("?")[0]!;
    const eventKey = eventPathBase;
    const rootHtml = rootKey === eventKey ? firstHtml : await fetchRainworxHtml(rootUrl);
    const pageUrls = extractEventPaginationUrls(rootHtml, rootUrl);
    pagesFetched += pageUrls.length;
    const collected = await collectLotUrlsForEventPages(
      pageUrls,
      origin,
      rootKey === eventKey ? firstHtml : rootHtml,
      rootUrl,
      delayMs,
    );
    for (const [id, url] of collected) lotUrlById.set(id, url);
    if (delayMs > 0) await sleep(delayMs);
  }

  return {
    lotUrls: [...lotUrlById.values()],
    pagesFetched,
    expectedFromBadges,
  };
}
