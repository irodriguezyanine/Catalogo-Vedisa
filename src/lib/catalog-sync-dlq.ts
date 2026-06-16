import type { SharedSyncDlqEntry } from "@/types/shared-sync";

const DLQ_TABLE = process.env.CATALOG_SYNC_DLQ_TABLE?.trim() || "catalog_sync_dlq";
const MAX_MESSAGE_LENGTH = 2000;

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl?.trim() || !serviceRoleKey?.trim()) return null;
  return { supabaseUrl, serviceRoleKey, table: DLQ_TABLE };
}

export async function recordSharedSyncDlqEntries(
  messages: string[],
  context: { source: string; skippedCount?: number },
): Promise<void> {
  const unique = Array.from(
    new Set(messages.map((message) => message.trim()).filter((message) => message.length > 0)),
  );
  if (unique.length === 0) return;

  const admin = getSupabaseAdmin();
  if (!admin) {
    console.warn(
      `[catalog-sync-dlq] ${unique.length} fallo(s) en ${context.source}:`,
      unique.slice(0, 5),
    );
    return;
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(admin.supabaseUrl, admin.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const rows = unique.map((message) => ({
    source: context.source,
    message: message.slice(0, MAX_MESSAGE_LENGTH),
    skipped_count: context.skippedCount ?? unique.length,
  }));

  const { error } = await supabase.from(admin.table).insert(rows);
  if (error) {
    console.warn(`[catalog-sync-dlq] No se pudo persistir DLQ: ${error.message}`);
  }
}

export async function listRecentSharedSyncDlqEntries(limit = 50): Promise<SharedSyncDlqEntry[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(admin.supabaseUrl, admin.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from(admin.table)
    .select("id, source, message, skipped_count, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map((row) => ({
    id: String(row.id),
    source: String(row.source ?? ""),
    message: String(row.message ?? ""),
    skippedCount: Number(row.skipped_count ?? 0),
    createdAt: String(row.created_at ?? ""),
  }));
}
