export type SessionAttribution = {
  deviceType: string;
  referrerHost: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
};

const ATTRIBUTION_STORAGE_KEY = "vedisa_analytics_attribution";

function detectDeviceType(): string {
  if (typeof window === "undefined") return "unknown";
  const width = window.innerWidth;
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

function parseReferrerHost(): string | null {
  if (typeof document === "undefined") return null;
  try {
    const ref = document.referrer?.trim();
    if (!ref) return null;
    const host = new URL(ref).hostname.replace(/^www\./, "");
    const current = window.location.hostname.replace(/^www\./, "");
    if (host === current) return null;
    return host;
  } catch {
    return null;
  }
}

function parseUtmParams(): Pick<SessionAttribution, "utmSource" | "utmMedium" | "utmCampaign"> {
  if (typeof window === "undefined") {
    return { utmSource: null, utmMedium: null, utmCampaign: null };
  }
  const params = new URLSearchParams(window.location.search);
  return {
    utmSource: params.get("utm_source"),
    utmMedium: params.get("utm_medium"),
    utmCampaign: params.get("utm_campaign"),
  };
}

export function getSessionAttribution(): SessionAttribution {
  if (typeof window === "undefined") {
    return {
      deviceType: "unknown",
      referrerHost: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
    };
  }

  try {
    const cached = window.sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (cached) return JSON.parse(cached) as SessionAttribution;
  } catch {
    // ignore
  }

  const attribution: SessionAttribution = {
    deviceType: detectDeviceType(),
    referrerHost: parseReferrerHost(),
    ...parseUtmParams(),
  };

  try {
    window.sessionStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(attribution));
  } catch {
    // ignore
  }

  return attribution;
}

export function mergeAnalyticsPayload(
  payload?: Record<string, unknown>,
): Record<string, unknown> {
  const attribution = getSessionAttribution();
  return {
    ...attribution,
    ...(payload ?? {}),
  };
}

export type VehicleAnalyticsContext = {
  itemKey: string;
  patent?: string;
  vehicleTitle?: string;
  section?: string;
  auctionId?: string;
  auctionName?: string;
  commercialLane?: string;
  vehicleType?: string;
  priceAmount?: number;
  has3d?: boolean;
  hasPrice?: boolean;
};
