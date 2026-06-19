import {
  assertAdminAnalytics,
  buildAnalyticsDashboardPayload,
  parseAnalyticsDays,
} from "@/lib/analytics-admin-shared";

export async function GET(req: Request) {
  const auth = await assertAdminAnalytics();
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.error }, { status: 401 });
  }

  const days = parseAnalyticsDays(new URL(req.url).searchParams);
  const payload = await buildAnalyticsDashboardPayload(days);
  if (!payload.ok) {
    return Response.json({ ok: false, error: payload.error }, { status: 400 });
  }

  return Response.json(payload);
}
