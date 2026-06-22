import { createClient } from "@supabase/supabase-js";
import type { CatalogSyncEvent } from "@/types/catalog-sync-contract";

const OUTBOX_TABLE = process.env.CATALOG_SYNC_OUTBOX_TABLE?.trim() || "catalog_sync_outbox";

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function enqueueCatalogSyncOutbox(
  event: CatalogSyncEvent,
  errorMessage: string,
  source = "catalog-sync",
): Promise<void> {
  const supabase = getServerSupabase();
  if (!supabase) {
    console.warn("[catalog-sync-outbox] Sin service role:", errorMessage);
    return;
  }

  const idempotencyKey =
    event.idempotencyKey ??
    `${event.type}:${JSON.stringify(event).slice(0, 240)}:${Date.now()}`;

  const { error } = await supabase.from(OUTBOX_TABLE).upsert(
    {
      idempotency_key: idempotencyKey,
      event_type: event.type,
      payload: event,
      last_error: errorMessage.slice(0, 2000),
      source,
      status: "pending",
      attempts: 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "idempotency_key" },
  );

  if (error) {
    console.warn("[catalog-sync-outbox] No se pudo encolar:", error.message);
  }
}

export async function markCatalogSyncOutboxDone(idempotencyKey: string): Promise<void> {
  const supabase = getServerSupabase();
  if (!supabase || !idempotencyKey) return;
  await supabase
    .from(OUTBOX_TABLE)
    .update({ status: "done", updated_at: new Date().toISOString() })
    .eq("idempotency_key", idempotencyKey);
}
