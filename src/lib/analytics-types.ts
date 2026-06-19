export type NormalizedAnalyticsEvent = {
  event: string;
  timestamp: string;
  itemKey?: string;
  section?: string;
  sessionId?: string;
  visitorId?: string;
  patent?: string;
  vehicleTitle?: string;
  auctionId?: string;
  auctionName?: string;
  commercialLane?: string;
  vehicleType?: string;
  priceAmount?: number;
  has3d?: boolean;
  hasPrice?: boolean;
  deviceType?: string;
  referrerHost?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  query?: string;
  filterId?: string;
  sort?: string;
  offerAmount?: number;
  channel?: string;
  [key: string]: unknown;
};

export type MetricWithDelta = {
  value: number;
  previous: number;
  deltaPct: number | null;
  deltaPp?: number | null;
};

export type AnalyticsPeriod = {
  days: number;
  from: string;
  to: string;
};

export type AnalyticsSummaryKpis = {
  visits: MetricWithDelta;
  uniqueVisitors: MetricWithDelta;
  uniqueVehiclesViewed: MetricWithDelta;
  avgDepthPerSession: MetricWithDelta;
  bounceRate: MetricWithDelta;
  avgVisitsPerDay: MetricWithDelta;
  detailOpens: MetricWithDelta;
  whatsappClicks: MetricWithDelta;
  whatsappCard: MetricWithDelta;
  whatsappModal: MetricWithDelta;
  whatsappFloating: MetricWithDelta;
  leads: MetricWithDelta;
  offersSent: MetricWithDelta;
  offerModalsOpened: MetricWithDelta;
  shares: MetricWithDelta;
  pdfDownloads: MetricWithDelta;
  viewer3dOpens: MetricWithDelta;
  globalConversionRate: MetricWithDelta;
  detailPerVisitRate: MetricWithDelta;
  whatsappPerDetailRate: MetricWithDelta;
  offerPerDetailRate: MetricWithDelta;
  leadPerDetailRate: MetricWithDelta;
  eventCount: MetricWithDelta;
  eventsPerVisit: MetricWithDelta;
  dominantWhatsappChannel: string | null;
};

export type AnalyticsFunnelStep = {
  id: string;
  label: string;
  count: number;
  rateFromPrevious: number | null;
  rateFromStart: number | null;
};

export type AnalyticsVehicleRow = {
  itemKey: string;
  patent: string;
  model: string;
  sectionLabel: string;
  auctionName?: string;
  detailOpens: number;
  whatsappClicks: number;
  offersSent: number;
  shares: number;
  score: number;
  deltaScorePct: number | null;
  status: "star" | "sleeping" | "high_interest_no_contact" | "normal";
};

export type AnalyticsSectionRow = {
  key: string;
  label: string;
  detailOpens: number;
  whatsappClicks: number;
  offersSent: number;
  leads: number;
  score: number;
};

export type AnalyticsSearchRow = {
  term: string;
  count: number;
  noResultsCount: number;
};

export type AnalyticsFilterRow = {
  filterId: string;
  label: string;
  count: number;
};

export type AnalyticsInventoryInsight = {
  publishedVisible: number;
  zeroInteractions: number;
  sleeping: number;
  highInterestNoContact: number;
  stars: number;
};

export const ADMIN_ANALYTICS_EVENTS = new Set([
  "admin_login_attempt",
  "admin_login_failed",
  "admin_login_success",
  "admin_logout",
]);

export const WHATSAPP_EVENTS = [
  "whatsapp_click_card",
  "whatsapp_click_modal",
  "whatsapp_click_modal_mobile",
  "whatsapp_click_floating",
] as const;

export const EVENT_INTEREST_WEIGHTS: Record<string, number> = {
  vehicle_detail_open: 1,
  card_open: 1,
  vehicle_share: 2,
  offer_modal_open: 4,
  whatsapp_click_card: 5,
  whatsapp_click_modal: 5,
  whatsapp_click_modal_mobile: 5,
  whatsapp_click_floating: 5,
  lead_form_submit: 6,
  offer_submit_success: 8,
  viewer_3d_open: 3,
};
