import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/admin-session";
import {
  buildAnalyticsFunnel,
  buildAnalyticsSummary,
  buildDailyTimeline,
  buildInventoryInsights,
  buildSearchAnalytics,
  buildSectionBreakdown,
  buildTopEvents,
  buildVehicleRankings,
  filterCommercialEvents,
  normalizeRawAnalyticsEvent,
  splitEventsByPeriod,
} from "@/lib/analytics-aggregation";
import { readAnalyticsEvents } from "@/lib/analytics";
import { getCachedCatalogFeed } from "@/lib/catalog-feed-cache";
import {
  buildCommercialEventByVehicleKey,
  getPatent,
  getVehicleKey,
  getVisibleCatalogItems,
} from "@/lib/catalog-public-inventory";
import { getCachedMergedEditorConfig } from "@/lib/editor-config-cache";

export async function assertAdminAnalytics(): Promise<
  { ok: true; email: string } | { ok: false; error: string }
> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const session = verifyAdminSessionToken(token);
  if (!session.valid || !session.email) {
    return { ok: false, error: "No autorizado." };
  }
  return { ok: true, email: session.email };
}

export function parseAnalyticsDays(searchParams: URLSearchParams): number {
  const days = Number(searchParams.get("days") ?? "30");
  if (!Number.isFinite(days)) return 30;
  return Math.max(7, Math.min(Math.round(days), 365));
}

export async function loadCommercialAnalytics(days: number) {
  const result = await readAnalyticsEvents({ days: days * 2, limit: 10000 });
  if (!result.ok) {
    return { ok: false as const, error: result.error ?? "No se pudieron cargar eventos." };
  }

  const normalized = result.events.map((row) => normalizeRawAnalyticsEvent(row));
  const commercial = filterCommercialEvents(normalized);
  const split = splitEventsByPeriod(commercial, days);

  return { ok: true as const, ...split };
}

export async function loadPublishedInventoryContext() {
  const [feed, editorResult] = await Promise.all([getCachedCatalogFeed(), getCachedMergedEditorConfig()]);
  const config = editorResult.config;
  const items = getVisibleCatalogItems(feed, config);
  const badges = buildCommercialEventByVehicleKey(config);
  const vehicleMeta = new Map<
    string,
    { patent: string; model: string; sectionLabel: string; auctionName?: string }
  >();

  for (const item of items) {
    const key = getVehicleKey(item);
    const auctionId = config.vehicleUpcomingAuctionIds?.[key];
    const auction = (config.upcomingAuctions ?? []).find((entry) => entry.id === auctionId);
    const badge = badges[key];
    vehicleMeta.set(key, {
      patent: getPatent(item),
      model: item.title,
      sectionLabel:
        badge?.kind === "venta_directa"
          ? "Venta directa"
          : badge?.kind === "remate"
            ? auction?.name ?? "Remate"
            : "Catálogo",
      auctionName: auction?.name,
    });
  }

  return {
    publishedKeys: items.map((item) => getVehicleKey(item)),
    vehicleMeta,
  };
}

export async function buildAnalyticsDashboardPayload(days: number) {
  const loaded = await loadCommercialAnalytics(days);
  if (!loaded.ok) return loaded;

  const inventory = await loadPublishedInventoryContext();
  const summary = buildAnalyticsSummary(
    loaded.current,
    loaded.previous,
    loaded.period,
    loaded.previousPeriod,
  );
  const funnel = buildAnalyticsFunnel(loaded.current);
  const vehicles = buildVehicleRankings(
    loaded.current,
    loaded.previous,
    inventory.vehicleMeta,
    20,
  );
  const sections = buildSectionBreakdown(loaded.current);
  const searches = buildSearchAnalytics(loaded.current);
  const timeline = buildDailyTimeline(loaded.current);
  const topEvents = buildTopEvents(loaded.current);
  const inventoryInsights = buildInventoryInsights(inventory.publishedKeys, loaded.current);

  return {
    ok: true as const,
    days,
    source: "supabase",
    ...summary,
    funnel,
    vehicles,
    sections,
    searches,
    timeline,
    topEvents,
    inventory: inventoryInsights,
  };
}
