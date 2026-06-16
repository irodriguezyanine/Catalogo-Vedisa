import { trackAnalyticsEvent } from "@/lib/analytics";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const limited = checkRateLimit(`analytics:${ip}`, 120, 60_000);
  if (!limited.ok) {
    return Response.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    event?: string;
    timestamp?: string;
    itemKey?: string;
    section?: string;
    payload?: Record<string, unknown>;
  };

  const event = (body.event ?? "").trim();
  if (!event) {
    return Response.json({ ok: false, error: "event es requerido." }, { status: 400 });
  }

  const timestamp = body.timestamp ?? new Date().toISOString();
  const result = await trackAnalyticsEvent({
    event,
    timestamp,
    itemKey: body.itemKey,
    section: body.section,
    payload: body.payload,
  });

  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: 400 });
  }

  return Response.json({ ok: true });
}
