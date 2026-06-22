import { handleCatalogSyncEvent } from "@/lib/catalog-sync-event-handler";
import { buildCatalogSyncCorsHeaders, withCatalogSyncCors } from "@/lib/catalog-sync-cors";
import type { CatalogSyncEvent } from "@/types/catalog-sync-contract";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const OUTBOX_TABLE = process.env.CATALOG_SYNC_OUTBOX_TABLE?.trim() || "catalog_sync_outbox";

function isAuthorized(req: Request): boolean {
  const secret = process.env.CATALOG_SYNC_WEBHOOK_SECRET?.trim();
  if (!secret) return true;
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const headerSecret = req.headers.get("x-catalog-sync-secret")?.trim();
  return bearer === secret || headerSecret === secret;
}

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: buildCatalogSyncCorsHeaders(req) });
}

/** Reintenta eventos pendientes en catalog_sync_outbox (cron/webhook). */
export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return withCatalogSyncCors(
      req,
      Response.json({ ok: false, error: "No autorizado." }, { status: 401 }),
    );
  }

  const supabase = getServerSupabase();
  if (!supabase) {
    return withCatalogSyncCors(
      req,
      Response.json({ ok: false, error: "Sin service role." }, { status: 500 }),
    );
  }

  const body = (await req.json().catch(() => ({}))) as { limit?: number };
  const limit = Math.min(Math.max(Number(body.limit ?? 20), 1), 100);

  const { data: rows, error } = await supabase
    .from(OUTBOX_TABLE)
    .select("id, idempotency_key, payload, attempts")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    return withCatalogSyncCors(
      req,
      Response.json({ ok: false, error: error.message }, { status: 500 }),
    );
  }

  const results: Array<{ idempotencyKey: string; ok: boolean; error?: string }> = [];

  for (const row of rows ?? []) {
    const payload = row.payload as CatalogSyncEvent;
    const idempotencyKey = String(row.idempotency_key ?? "");
    await supabase
      .from(OUTBOX_TABLE)
      .update({ status: "processing", attempts: Number(row.attempts ?? 0) + 1 })
      .eq("id", row.id);

    const result = await handleCatalogSyncEvent(
      { ...payload, idempotencyKey },
      "cron@retry-outbox",
    );

    if (!result.ok) {
      await supabase
        .from(OUTBOX_TABLE)
        .update({
          status: "pending",
          last_error: result.error ?? "Falló reintento",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    }

    results.push({ idempotencyKey, ok: result.ok, error: result.error });
  }

  return withCatalogSyncCors(req, Response.json({ ok: true, processed: results.length, results }));
}
