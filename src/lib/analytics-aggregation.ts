import {
  ADMIN_ANALYTICS_EVENTS,
  EVENT_INTEREST_WEIGHTS,
  type AnalyticsFunnelStep,
  type AnalyticsInventoryInsight,
  type AnalyticsPeriod,
  type AnalyticsSectionRow,
  type AnalyticsSummaryKpis,
  type AnalyticsVehicleRow,
  type MetricWithDelta,
  type NormalizedAnalyticsEvent,
} from "@/lib/analytics-types";

const PRICE_BANDS = [
  { key: "under_5m", label: "< $5M", min: 0, max: 5_000_000 },
  { key: "5m_15m", label: "$5M – $15M", min: 5_000_000, max: 15_000_000 },
  { key: "over_15m", label: "> $15M", min: 15_000_000, max: Number.POSITIVE_INFINITY },
] as const;

function parseTimestamp(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isWhatsappEvent(event: string): boolean {
  return event.startsWith("whatsapp_click");
}

function isConversionEvent(event: string): boolean {
  return (
    isWhatsappEvent(event) ||
    event === "lead_form_submit" ||
    event === "offer_submit_success"
  );
}

function metric(current: number, previous: number, asPp = false): MetricWithDelta {
  let deltaPct: number | null = null;
  let deltaPp: number | null = null;
  if (previous === 0) {
    if (current > 0) deltaPct = 100;
  } else {
    deltaPct = Math.round(((current - previous) / previous) * 100);
  }
  if (asPp) {
    deltaPp = Math.round((current - previous) * 10) / 10;
    deltaPct = null;
  }
  return { value: current, previous, deltaPct, deltaPp };
}

function roundRate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function normalizeRawAnalyticsEvent(row: Record<string, unknown>): NormalizedAnalyticsEvent {
  const payload =
    row.payload && typeof row.payload === "object"
      ? (row.payload as Record<string, unknown>)
      : {};
  const merged = { ...payload, ...row };
  return {
    event: String(merged.event ?? ""),
    timestamp: String(merged.timestamp ?? ""),
    itemKey: typeof merged.itemKey === "string" ? merged.itemKey : undefined,
    section: typeof merged.section === "string" ? merged.section : undefined,
    sessionId: typeof merged.sessionId === "string" ? merged.sessionId : undefined,
    visitorId: typeof merged.visitorId === "string" ? merged.visitorId : undefined,
    patent: typeof merged.patent === "string" ? merged.patent : undefined,
    vehicleTitle: typeof merged.vehicleTitle === "string" ? merged.vehicleTitle : undefined,
    auctionId: typeof merged.auctionId === "string" ? merged.auctionId : undefined,
    auctionName: typeof merged.auctionName === "string" ? merged.auctionName : undefined,
    commercialLane: typeof merged.commercialLane === "string" ? merged.commercialLane : undefined,
    vehicleType: typeof merged.vehicleType === "string" ? merged.vehicleType : undefined,
    priceAmount: typeof merged.priceAmount === "number" ? merged.priceAmount : undefined,
    has3d: merged.has3d === true,
    hasPrice: merged.hasPrice === true,
    deviceType: typeof merged.deviceType === "string" ? merged.deviceType : undefined,
    referrerHost: typeof merged.referrerHost === "string" ? merged.referrerHost : undefined,
    utmSource: typeof merged.utmSource === "string" ? merged.utmSource : undefined,
    utmMedium: typeof merged.utmMedium === "string" ? merged.utmMedium : undefined,
    utmCampaign: typeof merged.utmCampaign === "string" ? merged.utmCampaign : undefined,
    query: typeof merged.query === "string" ? merged.query : undefined,
    filterId: typeof merged.filterId === "string" ? merged.filterId : undefined,
    sort: typeof merged.sort === "string" ? merged.sort : undefined,
    offerAmount: typeof merged.offerAmount === "number" ? merged.offerAmount : undefined,
    channel: typeof merged.channel === "string" ? merged.channel : undefined,
  };
}

export function filterCommercialEvents(events: NormalizedAnalyticsEvent[]): NormalizedAnalyticsEvent[] {
  return events.filter((event) => !ADMIN_ANALYTICS_EVENTS.has(event.event));
}

export function splitEventsByPeriod(
  events: NormalizedAnalyticsEvent[],
  days: number,
): {
  current: NormalizedAnalyticsEvent[];
  previous: NormalizedAnalyticsEvent[];
  period: AnalyticsPeriod;
  previousPeriod: AnalyticsPeriod;
} {
  const now = new Date();
  const currentStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const previousStart = new Date(currentStart.getTime() - days * 24 * 60 * 60 * 1000);

  const current: NormalizedAnalyticsEvent[] = [];
  const previous: NormalizedAnalyticsEvent[] = [];

  for (const event of events) {
    const ts = parseTimestamp(event.timestamp);
    if (!ts) continue;
    if (ts >= currentStart) current.push(event);
    else if (ts >= previousStart && ts < currentStart) previous.push(event);
  }

  return {
    current,
    previous,
    period: { days, from: currentStart.toISOString(), to: now.toISOString() },
    previousPeriod: { days, from: previousStart.toISOString(), to: currentStart.toISOString() },
  };
}

function computePeriodMetrics(events: NormalizedAnalyticsEvent[]) {
  const visitSessions = new Set<string>();
  let pageViews = 0;
  const visitors = new Set<string>();
  const vehiclesViewed = new Set<string>();
  const sessionDetails = new Map<string, number>();
  const bouncedSessions = new Set<string>();
  const sessionHasDetail = new Set<string>();

  let detailOpens = 0;
  let whatsappClicks = 0;
  let whatsappCard = 0;
  let whatsappModal = 0;
  let whatsappFloating = 0;
  let leads = 0;
  let offersSent = 0;
  let offerModalsOpened = 0;
  let shares = 0;
  let pdfDownloads = 0;
  let viewer3dOpens = 0;
  const eventCount = events.length;
  const whatsappByChannel = new Map<string, number>();

  for (const event of events) {
    const sessionId = event.sessionId?.trim() ?? "";
    const visitorId = event.visitorId?.trim() ?? "";
    if (visitorId) visitors.add(visitorId);

    if (event.event === "page_view_home") {
      pageViews += 1;
      if (sessionId) {
        visitSessions.add(sessionId);
        if (!sessionHasDetail.has(sessionId)) bouncedSessions.add(sessionId);
      }
    }

    if (event.event === "vehicle_detail_open") {
      detailOpens += 1;
      if (sessionId) {
        sessionHasDetail.add(sessionId);
        bouncedSessions.delete(sessionId);
        sessionDetails.set(sessionId, (sessionDetails.get(sessionId) ?? 0) + 1);
      }
      if (event.itemKey) vehiclesViewed.add(event.itemKey);
    }

    if (isWhatsappEvent(event.event)) {
      whatsappClicks += 1;
      const channel =
        event.event === "whatsapp_click_card"
          ? "tarjeta"
          : event.event === "whatsapp_click_floating"
            ? "flotante"
            : "modal";
      whatsappByChannel.set(channel, (whatsappByChannel.get(channel) ?? 0) + 1);
      if (event.event === "whatsapp_click_card") whatsappCard += 1;
      if (event.event === "whatsapp_click_modal" || event.event === "whatsapp_click_modal_mobile") {
        whatsappModal += 1;
      }
      if (event.event === "whatsapp_click_floating") whatsappFloating += 1;
    }

    if (event.event === "lead_form_submit") leads += 1;
    if (event.event === "offer_submit_success") offersSent += 1;
    if (event.event === "offer_modal_open") offerModalsOpened += 1;
    if (event.event === "vehicle_share") shares += 1;
    if (event.event === "calendar_pdf_download") pdfDownloads += 1;
    if (event.event === "viewer_3d_open") viewer3dOpens += 1;
  }

  const visits = visitSessions.size > 0 ? visitSessions.size : pageViews;
  const depthValues = Array.from(sessionDetails.values());
  const avgDepthPerSession =
    depthValues.length > 0
      ? Math.round((depthValues.reduce((a, b) => a + b, 0) / depthValues.length) * 10) / 10
      : 0;
  const bounceRate = visits > 0 ? roundRate(bouncedSessions.size, visits) : 0;
  const uniqueDays = new Set(
    events.map((e) => parseTimestamp(e.timestamp)?.toISOString().slice(0, 10)).filter(Boolean),
  ).size;
  const avgVisitsPerDay = uniqueDays > 0 ? Math.round((visits / uniqueDays) * 10) / 10 : 0;
  const conversions = whatsappClicks + leads + offersSent;
  const globalConversionRate = roundRate(conversions, visits);

  let dominantWhatsappChannel: string | null = null;
  let dominantCount = 0;
  for (const [channel, count] of whatsappByChannel.entries()) {
    if (count > dominantCount) {
      dominantCount = count;
      dominantWhatsappChannel = channel;
    }
  }

  return {
    visits,
    uniqueVisitors: visitors.size,
    uniqueVehiclesViewed: vehiclesViewed.size,
    avgDepthPerSession,
    bounceRate,
    avgVisitsPerDay,
    detailOpens,
    whatsappClicks,
    whatsappCard,
    whatsappModal,
    whatsappFloating,
    leads,
    offersSent,
    offerModalsOpened,
    shares,
    pdfDownloads,
    viewer3dOpens,
    globalConversionRate,
    detailPerVisitRate: roundRate(detailOpens, visits),
    whatsappPerDetailRate: roundRate(whatsappClicks, detailOpens),
    offerPerDetailRate: roundRate(offersSent, detailOpens),
    leadPerDetailRate: roundRate(leads, detailOpens),
    eventCount,
    eventsPerVisit: visits > 0 ? Math.round((eventCount / visits) * 10) / 10 : 0,
    dominantWhatsappChannel,
  };
}

export function buildAnalyticsSummary(
  current: NormalizedAnalyticsEvent[],
  previous: NormalizedAnalyticsEvent[],
  period: AnalyticsPeriod,
  previousPeriod: AnalyticsPeriod,
): { period: AnalyticsPeriod; previousPeriod: AnalyticsPeriod; kpis: AnalyticsSummaryKpis } {
  const cur = computePeriodMetrics(current);
  const prev = computePeriodMetrics(previous);

  const kpis: AnalyticsSummaryKpis = {
    visits: metric(cur.visits, prev.visits),
    uniqueVisitors: metric(cur.uniqueVisitors, prev.uniqueVisitors),
    uniqueVehiclesViewed: metric(cur.uniqueVehiclesViewed, prev.uniqueVehiclesViewed),
    avgDepthPerSession: metric(cur.avgDepthPerSession, prev.avgDepthPerSession),
    bounceRate: metric(cur.bounceRate, prev.bounceRate),
    avgVisitsPerDay: metric(cur.avgVisitsPerDay, prev.avgVisitsPerDay),
    detailOpens: metric(cur.detailOpens, prev.detailOpens),
    whatsappClicks: metric(cur.whatsappClicks, prev.whatsappClicks),
    whatsappCard: metric(cur.whatsappCard, prev.whatsappCard),
    whatsappModal: metric(cur.whatsappModal, prev.whatsappModal),
    whatsappFloating: metric(cur.whatsappFloating, prev.whatsappFloating),
    leads: metric(cur.leads, prev.leads),
    offersSent: metric(cur.offersSent, prev.offersSent),
    offerModalsOpened: metric(cur.offerModalsOpened, prev.offerModalsOpened),
    shares: metric(cur.shares, prev.shares),
    pdfDownloads: metric(cur.pdfDownloads, prev.pdfDownloads),
    viewer3dOpens: metric(cur.viewer3dOpens, prev.viewer3dOpens),
    globalConversionRate: metric(cur.globalConversionRate, prev.globalConversionRate, true),
    detailPerVisitRate: metric(cur.detailPerVisitRate, prev.detailPerVisitRate, true),
    whatsappPerDetailRate: metric(cur.whatsappPerDetailRate, prev.whatsappPerDetailRate, true),
    offerPerDetailRate: metric(cur.offerPerDetailRate, prev.offerPerDetailRate, true),
    leadPerDetailRate: metric(cur.leadPerDetailRate, prev.leadPerDetailRate, true),
    eventCount: metric(cur.eventCount, prev.eventCount),
    eventsPerVisit: metric(cur.eventsPerVisit, prev.eventsPerVisit),
    dominantWhatsappChannel: cur.dominantWhatsappChannel,
  };

  return { period, previousPeriod, kpis };
}

export function buildAnalyticsFunnel(events: NormalizedAnalyticsEvent[]): AnalyticsFunnelStep[] {
  const m = computePeriodMetrics(events);
  const contactActions = m.whatsappClicks + m.offerModalsOpened;
  const conversions = m.whatsappClicks + m.leads + m.offersSent;

  return [
    { id: "visits", label: "Visitas", count: m.visits, rateFromPrevious: null, rateFromStart: 100 },
    {
      id: "detail",
      label: "Detalle abierto",
      count: m.detailOpens,
      rateFromPrevious: roundRate(m.detailOpens, m.visits),
      rateFromStart: roundRate(m.detailOpens, m.visits),
    },
    {
      id: "interest",
      label: "Interés alto (WA + modal oferta)",
      count: contactActions,
      rateFromPrevious: roundRate(contactActions, m.detailOpens),
      rateFromStart: roundRate(contactActions, m.visits),
    },
    {
      id: "conversion",
      label: "Conversión (WA + leads + ofertas)",
      count: conversions,
      rateFromPrevious: roundRate(conversions, Math.max(contactActions, 1)),
      rateFromStart: roundRate(conversions, m.visits),
    },
  ];
}

function vehicleEventScore(event: string): number {
  return EVENT_INTEREST_WEIGHTS[event] ?? (event === "vehicle_detail_open" ? 1 : 0);
}

export function buildVehicleRankings(
  current: NormalizedAnalyticsEvent[],
  previous: NormalizedAnalyticsEvent[],
  vehicleMeta: Map<string, { patent: string; model: string; sectionLabel: string; auctionName?: string }>,
  limit = 20,
): AnalyticsVehicleRow[] {
  type Acc = {
    detailOpens: number;
    whatsappClicks: number;
    offersSent: number;
    shares: number;
    score: number;
    sectionLabel: string;
    auctionName?: string;
    patent: string;
    model: string;
  };

  const build = (events: NormalizedAnalyticsEvent[]) => {
    const map = new Map<string, Acc>();
    for (const event of events) {
      const key = event.itemKey?.trim();
      if (!key) continue;
      const meta = vehicleMeta.get(key);
      const acc = map.get(key) ?? {
        detailOpens: 0,
        whatsappClicks: 0,
        offersSent: 0,
        shares: 0,
        score: 0,
        sectionLabel: event.commercialLane ?? event.section ?? meta?.sectionLabel ?? "—",
        auctionName: event.auctionName ?? meta?.auctionName,
        patent: event.patent ?? meta?.patent ?? key,
        model: event.vehicleTitle ?? meta?.model ?? key,
      };
      if (event.event === "vehicle_detail_open") acc.detailOpens += 1;
      if (isWhatsappEvent(event.event)) acc.whatsappClicks += 1;
      if (event.event === "offer_submit_success") acc.offersSent += 1;
      if (event.event === "vehicle_share") acc.shares += 1;
      acc.score += vehicleEventScore(event.event);
      map.set(key, acc);
    }
    return map;
  };

  const curMap = build(current);
  const prevMap = build(previous);

  return Array.from(curMap.entries())
    .map(([itemKey, acc]) => {
      const prevScore = prevMap.get(itemKey)?.score ?? 0;
      let deltaScorePct: number | null = null;
      if (prevScore === 0) deltaScorePct = acc.score > 0 ? 100 : 0;
      else deltaScorePct = Math.round(((acc.score - prevScore) / prevScore) * 100);

      let status: AnalyticsVehicleRow["status"] = "normal";
      if (acc.score >= 25) status = "star";
      else if (acc.detailOpens >= 5 && acc.whatsappClicks === 0 && acc.offersSent === 0) {
        status = "high_interest_no_contact";
      } else if (acc.score === 0) status = "sleeping";

      return {
        itemKey,
        patent: acc.patent,
        model: acc.model,
        sectionLabel: acc.sectionLabel,
        auctionName: acc.auctionName,
        detailOpens: acc.detailOpens,
        whatsappClicks: acc.whatsappClicks,
        offersSent: acc.offersSent,
        shares: acc.shares,
        score: acc.score,
        deltaScorePct,
        status,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function sectionLabelFromKey(key: string): string {
  const labels: Record<string, string> = {
    "proximos-remates": "Próximos remates",
    "ventas-directas": "Ventas directas",
    novedades: "Novedades",
    catalogo: "Catálogo",
    remate: "Remate",
    venta_directa: "Venta directa",
  };
  return labels[key] ?? key;
}

export function buildSectionBreakdown(events: NormalizedAnalyticsEvent[]): AnalyticsSectionRow[] {
  const map = new Map<string, AnalyticsSectionRow>();

  const bump = (key: string, label: string, field: keyof AnalyticsSectionRow) => {
    const row = map.get(key) ?? {
      key,
      label,
      detailOpens: 0,
      whatsappClicks: 0,
      offersSent: 0,
      leads: 0,
      score: 0,
    };
    if (field === "detailOpens") row.detailOpens += 1;
    if (field === "whatsappClicks") row.whatsappClicks += 1;
    if (field === "offersSent") row.offersSent += 1;
    if (field === "leads") row.leads += 1;
    map.set(key, row);
  };

  for (const event of events) {
    const sectionKey = event.commercialLane ?? event.section ?? "sin-seccion";
    const key = event.auctionId ? `auction:${event.auctionId}` : sectionKey;
    const label = event.auctionName ?? sectionLabelFromKey(sectionKey);

    if (event.event === "vehicle_detail_open") bump(key, label, "detailOpens");
    if (isWhatsappEvent(event.event)) bump(key, label, "whatsappClicks");
    if (event.event === "offer_submit_success") bump(key, label, "offersSent");
    if (event.event === "lead_form_submit") bump(key, label, "leads");

    if (event.vehicleType) {
      const typeKey = `type:${event.vehicleType}`;
      if (event.event === "vehicle_detail_open") bump(typeKey, event.vehicleType, "detailOpens");
      if (isWhatsappEvent(event.event)) bump(typeKey, event.vehicleType, "whatsappClicks");
    }

    if (typeof event.priceAmount === "number" && event.priceAmount > 0) {
      const band = PRICE_BANDS.find((b) => event.priceAmount! >= b.min && event.priceAmount! < b.max);
      if (band) {
        const priceKey = `price:${band.key}`;
        if (event.event === "vehicle_detail_open") bump(priceKey, band.label, "detailOpens");
        if (isWhatsappEvent(event.event)) bump(priceKey, band.label, "whatsappClicks");
      }
    }
  }

  for (const row of map.values()) {
    row.score = row.detailOpens + row.whatsappClicks * 5 + row.offersSent * 8 + row.leads * 6;
  }

  return Array.from(map.values()).sort((a, b) => b.score - a.score);
}

export function buildSearchAnalytics(events: NormalizedAnalyticsEvent[]) {
  const searchMap = new Map<string, { term: string; count: number; noResultsCount: number }>();
  const filterMap = new Map<string, number>();
  const sortMap = new Map<string, number>();
  const offerAmounts: number[] = [];

  for (const event of events) {
    if (event.event === "home_search_change" && event.query?.trim()) {
      const term = event.query.trim().toLowerCase();
      const row = searchMap.get(term) ?? { term, count: 0, noResultsCount: 0 };
      row.count += 1;
      searchMap.set(term, row);
    }
    if (event.event === "search_no_results" && event.query?.trim()) {
      const term = event.query.trim().toLowerCase();
      const row = searchMap.get(term) ?? { term, count: 0, noResultsCount: 0 };
      row.noResultsCount += 1;
      searchMap.set(term, row);
    }
    if (event.event === "quick_filter_toggle" && event.filterId) {
      filterMap.set(event.filterId, (filterMap.get(event.filterId) ?? 0) + 1);
    }
    if (event.event === "home_siniestro_filter_change" && event.filterId) {
      const id = `siniestro:${event.filterId}`;
      filterMap.set(id, (filterMap.get(id) ?? 0) + 1);
    }
    if (event.event === "home_sort_change" && event.sort) {
      sortMap.set(event.sort, (sortMap.get(event.sort) ?? 0) + 1);
    }
    if (event.event === "offer_submit_success" && typeof event.offerAmount === "number") {
      offerAmounts.push(event.offerAmount);
    }
  }

  return {
    searches: Array.from(searchMap.values()).sort((a, b) => b.count - a.count).slice(0, 20),
    filters: Array.from(filterMap.entries())
      .map(([filterId, count]) => ({ filterId, label: filterId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15),
    sorts: Array.from(sortMap.entries())
      .map(([sort, count]) => ({ sort, count }))
      .sort((a, b) => b.count - a.count),
    avgOfferAmount:
      offerAmounts.length > 0
        ? Math.round(offerAmounts.reduce((a, b) => a + b, 0) / offerAmounts.length)
        : null,
  };
}

export function buildInventoryInsights(
  publishedKeys: string[],
  events: NormalizedAnalyticsEvent[],
): AnalyticsInventoryInsight {
  const interacted = new Set<string>();
  const detailCounts = new Map<string, number>();
  const contactCounts = new Map<string, number>();
  const scoreByKey = new Map<string, number>();

  for (const event of events) {
    const key = event.itemKey?.trim();
    if (!key) continue;
    interacted.add(key);
    if (event.event === "vehicle_detail_open") {
      detailCounts.set(key, (detailCounts.get(key) ?? 0) + 1);
    }
    if (isConversionEvent(event.event)) {
      contactCounts.set(key, (contactCounts.get(key) ?? 0) + 1);
    }
    scoreByKey.set(key, (scoreByKey.get(key) ?? 0) + vehicleEventScore(event.event));
  }

  let zeroInteractions = 0;
  let sleeping = 0;
  let highInterestNoContact = 0;
  let stars = 0;

  for (const key of publishedKeys) {
    if (!interacted.has(key)) {
      zeroInteractions += 1;
      sleeping += 1;
      continue;
    }
    const score = scoreByKey.get(key) ?? 0;
    const details = detailCounts.get(key) ?? 0;
    const contacts = contactCounts.get(key) ?? 0;
    if (score >= 25) stars += 1;
    if (details >= 5 && contacts === 0) highInterestNoContact += 1;
    if (score === 0) sleeping += 1;
  }

  return { publishedVisible: publishedKeys.length, zeroInteractions, sleeping, highInterestNoContact, stars };
}

export function buildDailyTimeline(events: NormalizedAnalyticsEvent[]) {
  const buckets = new Map<
    string,
    {
      total: number;
      visits: number;
      detailOpens: number;
      whatsappClicks: number;
      leads: number;
      offersSent: number;
      sessionIds: Set<string>;
    }
  >();

  for (const event of events) {
    const ts = parseTimestamp(event.timestamp);
    if (!ts) continue;
    const key = ts.toISOString().slice(0, 10);
    const bucket = buckets.get(key) ?? {
      total: 0,
      visits: 0,
      detailOpens: 0,
      whatsappClicks: 0,
      leads: 0,
      offersSent: 0,
      sessionIds: new Set<string>(),
    };
    bucket.total += 1;
    if (event.event === "page_view_home") {
      if (event.sessionId) bucket.sessionIds.add(event.sessionId);
      bucket.visits += 1;
    }
    if (event.event === "vehicle_detail_open") bucket.detailOpens += 1;
    if (isWhatsappEvent(event.event)) bucket.whatsappClicks += 1;
    if (event.event === "lead_form_submit") bucket.leads += 1;
    if (event.event === "offer_submit_success") bucket.offersSent += 1;
    buckets.set(key, bucket);
  }

  return Array.from(buckets.entries())
    .map(([date, row]) => ({
      date,
      total: row.total,
      visits: row.sessionIds.size > 0 ? row.sessionIds.size : row.visits,
      detailOpens: row.detailOpens,
      whatsappClicks: row.whatsappClicks,
      leads: row.leads,
      offersSent: row.offersSent,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function buildTopEvents(events: NormalizedAnalyticsEvent[], limit = 12) {
  const counts = new Map<string, number>();
  for (const event of events) {
    counts.set(event.event, (counts.get(event.event) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([eventName, total]) => ({ eventName, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}
