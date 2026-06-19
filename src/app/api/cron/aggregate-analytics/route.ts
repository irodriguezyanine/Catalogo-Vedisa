import { createClient } from "@supabase/supabase-js";
import {
  buildDailyTimeline,
  buildSectionBreakdown,
  buildVehicleRankings,
  filterCommercialEvents,
  normalizeRawAnalyticsEvent,
} from "@/lib/analytics-aggregation";
import { readAnalyticsEvents } from "@/lib/analytics";
import { loadPublishedInventoryContext } from "@/lib/analytics-admin-shared";

const DAILY_TABLE = process.env.CATALOG_ANALYTICS_DAILY_TABLE ?? "catalogo_analytics_daily";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ ok: false, error: "Supabase no configurado." }, { status: 400 });
  }

  const targetDate = new Date();
  targetDate.setUTCDate(targetDate.getUTCDate() - 1);
  const dateKey = targetDate.toISOString().slice(0, 10);

  const result = await readAnalyticsEvents({ days: 3, limit: 20000 });
  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: 400 });
  }

  const events = filterCommercialEvents(result.events.map(normalizeRawAnalyticsEvent)).filter((event) =>
    event.timestamp.startsWith(dateKey),
  );

  const timeline = buildDailyTimeline(events);
  const day = timeline.find((row) => row.date === dateKey) ?? {
    date: dateKey,
    total: 0,
    visits: 0,
    detailOpens: 0,
    whatsappClicks: 0,
    leads: 0,
    offersSent: 0,
  };

  const inventory = await loadPublishedInventoryContext();
  const sections = buildSectionBreakdown(events);
  const vehicles = buildVehicleRankings(events, [], inventory.vehicleMeta, 10);

  const bySection: Record<string, unknown> = {};
  const byAuction: Record<string, unknown> = {};
  for (const section of sections) {
    if (section.key.startsWith("auction:")) byAuction[section.key] = section;
    else bySection[section.key] = section;
  }

  const uniqueVisitors = new Set(
    events.map((event) => event.visitorId).filter((value): value is string => Boolean(value)),
  ).size;

  const conversions = day.whatsappClicks + day.leads + day.offersSent;
  const globalConversionRate =
    day.visits > 0 ? Math.round((conversions / day.visits) * 1000) / 10 : 0;

  const row = {
    date: dateKey,
    visits: day.visits,
    unique_visitors: uniqueVisitors,
    detail_opens: day.detailOpens,
    whatsapp_clicks: day.whatsappClicks,
    leads: day.leads,
    offers_sent: day.offersSent,
    shares: events.filter((event) => event.event === "vehicle_share").length,
    global_conversion_rate: globalConversionRate,
    by_section: bySection,
    by_auction: byAuction,
    top_vehicles: vehicles,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from(DAILY_TABLE).upsert(row, { onConflict: "date" });
  if (error) {
    return Response.json(
      {
        ok: false,
        error: `No se pudo guardar agregación diaria: ${error.message}`,
      },
      { status: 400 },
    );
  }

  return Response.json({ ok: true, date: dateKey, eventsProcessed: events.length });
}
