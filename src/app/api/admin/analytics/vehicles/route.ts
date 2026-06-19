import {
  assertAdminAnalytics,
  loadCommercialAnalytics,
  loadPublishedInventoryContext,
  parseAnalyticsDays,
} from "@/lib/analytics-admin-shared";
import { buildVehicleRankings } from "@/lib/analytics-aggregation";

export async function GET(req: Request) {
  const auth = await assertAdminAnalytics();
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.error }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const days = parseAnalyticsDays(searchParams);
  const limit = Math.max(5, Math.min(Number(searchParams.get("limit") ?? "20"), 50));

  const loaded = await loadCommercialAnalytics(days);
  if (!loaded.ok) {
    return Response.json({ ok: false, error: loaded.error }, { status: 400 });
  }

  const inventory = await loadPublishedInventoryContext();
  const vehicles = buildVehicleRankings(
    loaded.current,
    loaded.previous,
    inventory.vehicleMeta,
    limit,
  );

  return Response.json({ ok: true, days, vehicles });
}
