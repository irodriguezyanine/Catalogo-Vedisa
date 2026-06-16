import { createClient } from "@supabase/supabase-js";
import { isGlo3dCircuitOpen, getGlo3dCircuitRetryAfterMs } from "@/lib/glo3d-api";

export const dynamic = "force-dynamic";

function getHealthSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET() {
  const supabase = getHealthSupabase();
  let supabaseOk = false;
  if (supabase) {
    const { error } = await supabase.from("inventario").select("patente").limit(1);
    supabaseOk = !error;
  }

  const tasacionesUrl = process.env.CATALOG_SOURCE_API_URL?.trim();
  let tasacionesOk: boolean | null = null;
  if (tasacionesUrl) {
    try {
      const res = await fetch(tasacionesUrl, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      });
      tasacionesOk = res.ok;
    } catch {
      tasacionesOk = false;
    }
  }

  return Response.json({
    ok: true,
    timestamp: new Date().toISOString(),
    checks: {
      supabase: supabase ? supabaseOk : "not_configured",
      tasacionesApi: tasacionesUrl ? tasacionesOk : "not_configured",
      glo3dCircuitOpen: isGlo3dCircuitOpen(),
      glo3dRetryAfterMs: getGlo3dCircuitRetryAfterMs(),
    },
  });
}
