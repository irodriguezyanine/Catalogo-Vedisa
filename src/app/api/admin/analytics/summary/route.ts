import {
  assertAdminAnalytics,
  loadCommercialAnalytics,
  loadPublishedInventoryContext,
  parseAnalyticsDays,
} from "@/lib/analytics-admin-shared";
import { buildAnalyticsSummary } from "@/lib/analytics-aggregation";

export async function GET(req: Request) {
  const auth = await assertAdminAnalytics();
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.error }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const days = parseAnalyticsDays(searchParams);
  const compare = searchParams.get("compare") !== "0";

  const loaded = await loadCommercialAnalytics(days);
  if (!loaded.ok) {
    return Response.json({ ok: false, error: loaded.error }, { status: 400 });
  }

  const inventory = await loadPublishedInventoryContext();
  const summary = buildAnalyticsSummary(
    loaded.current,
    compare ? loaded.previous : [],
    loaded.period,
    loaded.previousPeriod,
  );

  return Response.json({
    ok: true,
    days,
    compare,
    publishedVisible: inventory.publishedKeys.length,
    ...summary,
  });
}
