import { assertAdminAnalytics, loadCommercialAnalytics, parseAnalyticsDays } from "@/lib/analytics-admin-shared";
import { buildSectionBreakdown } from "@/lib/analytics-aggregation";

export async function GET(req: Request) {
  const auth = await assertAdminAnalytics();
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.error }, { status: 401 });
  }

  const days = parseAnalyticsDays(new URL(req.url).searchParams);
  const loaded = await loadCommercialAnalytics(days);
  if (!loaded.ok) {
    return Response.json({ ok: false, error: loaded.error }, { status: 400 });
  }

  return Response.json({
    ok: true,
    days,
    sections: buildSectionBreakdown(loaded.current),
  });
}
