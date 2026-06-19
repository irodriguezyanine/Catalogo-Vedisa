import { createClient } from "@supabase/supabase-js";

const ANALYTICS_TABLE = process.env.CATALOG_ANALYTICS_TABLE ?? "catalogo_analytics_events";

export type AnalyticsEventInput = {
  event: string;
  timestamp: string;
  itemKey?: string;
  section?: string;
  payload?: Record<string, unknown>;
};

function getAnalyticsSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function trackAnalyticsEvent(input: AnalyticsEventInput): Promise<{ ok: boolean; error?: string }> {
  const supabase = getAnalyticsSupabase();
  if (!supabase) {
    return {
      ok: false,
      error: "Analytics deshabilitado: faltan variables de Supabase.",
    };
  }

  const { error } = await supabase.from(ANALYTICS_TABLE).insert({
    event_name: input.event,
    event_timestamp: input.timestamp,
    item_key: input.itemKey ?? null,
    section: input.section ?? null,
    payload: input.payload ?? {},
  });

  if (error) {
    return {
      ok: false,
      error:
        `No se pudo registrar evento en '${ANALYTICS_TABLE}'. ` +
        "Verifica columnas: event_name, event_timestamp, item_key, section, payload.",
    };
  }

  return { ok: true };
}

export async function readAnalyticsEvents(options: {
  days?: number;
  limit?: number;
}): Promise<{ ok: boolean; events: Array<Record<string, unknown>>; error?: string }> {
  const supabase = getAnalyticsSupabase();
  if (!supabase) return { ok: false, events: [], error: "Analytics no configurado." };

  const days = Math.max(1, Math.min(options.days ?? 30, 730));
  const limit = Math.max(50, Math.min(options.limit ?? 5000, 20000));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from(ANALYTICS_TABLE)
    .select("event_name,event_timestamp,item_key,section,payload")
    .gte("event_timestamp", since)
    .order("event_timestamp", { ascending: false })
    .limit(limit);

  if (error) {
    return {
      ok: false,
      events: [],
      error:
        `No se pudo leer analytics desde '${ANALYTICS_TABLE}'. ` +
        "Verifica que la tabla exista y tenga permisos para service role.",
    };
  }

  const events = (data ?? []).map((row) => {
    const payload =
      row && typeof row === "object" && "payload" in row && row.payload && typeof row.payload === "object"
        ? (row.payload as Record<string, unknown>)
        : {};
    return {
      event: (row as { event_name?: string }).event_name ?? "",
      timestamp: (row as { event_timestamp?: string }).event_timestamp ?? "",
      itemKey: (row as { item_key?: string | null }).item_key ?? undefined,
      section: (row as { section?: string | null }).section ?? undefined,
      ...payload,
    };
  });

  return { ok: true, events };
}
