import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/admin-session";
import { getEditorConfig, saveEditorConfig } from "@/lib/editor-config";
import { syncEditorConfigToSharedTables } from "@/lib/catalog-shared-sync";
import { DEFAULT_EDITOR_CONFIG, type EditorConfig } from "@/types/editor";

type SharedRemateRow = {
  id: string;
  numero_remate: string | null;
  descripcion: string | null;
  tipo?: "remate" | "venta_directa" | null;
  fecha_hora_inicio?: string | null;
  fecha_hora_cierre?: string | null;
  fecha_hora_remate?: string | null;
  created_at?: string | null;
};

function normalizeText(value?: string | null) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function inferEventType(row: SharedRemateRow): "remate" | "venta_directa" {
  if (row.tipo === "venta_directa" || row.tipo === "remate") {
    return row.tipo;
  }
  const text = normalizeText(`${row.numero_remate ?? ""} ${row.descripcion ?? ""}`);
  if (
    text.includes("ventadirecta") ||
    text.includes("vtadirecta") ||
    text.includes("vtdirecta") ||
    text.includes("ventadir")
  ) {
    return "venta_directa";
  }
  return "remate";
}

function inferEventDate(row: SharedRemateRow) {
  const source =
    row.fecha_hora_cierre ??
    row.fecha_hora_remate ??
    row.fecha_hora_inicio ??
    row.created_at ??
    new Date().toISOString();
  return source.slice(0, 10);
}

function inferEventName(row: SharedRemateRow) {
  const descripcion = String(row.descripcion ?? "").trim();
  if (descripcion) return descripcion;
  const numero = String(row.numero_remate ?? "").trim();
  if (numero) return numero;
  return `Evento ${row.id.slice(0, 8)}`;
}

function isMissingColumnError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const message = String((error as { message?: unknown }).message ?? "").toLowerCase();
  const code = String((error as { code?: unknown }).code ?? "");
  return code === "42703" || message.includes("column") && message.includes("does not exist");
}

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function fetchSharedRematesRows() {
  const supabase = getServerSupabase();
  if (!supabase) return [] as SharedRemateRow[];

  const runSelect = async (selectColumns: string) =>
    supabase
      .from("remates")
      .select(selectColumns)
      .order("created_at", { ascending: false })
      .limit(2000);

  const fullSelect =
    "id, numero_remate, descripcion, tipo, fecha_hora_inicio, fecha_hora_cierre, fecha_hora_remate, created_at";
  const baseSelect = "id, numero_remate, descripcion, fecha_hora_remate, created_at";

  const first = await runSelect(fullSelect);
  if (!first.error) {
    return (first.data ?? []) as unknown as SharedRemateRow[];
  }
  if (!isMissingColumnError(first.error)) {
    console.warn("No se pudo leer remates compartidos en Catálogo:", first.error);
    return [] as SharedRemateRow[];
  }

  const fallback = await runSelect(baseSelect);
  if (fallback.error) {
    console.warn("No se pudo leer remates compartidos con fallback:", fallback.error);
    return [] as SharedRemateRow[];
  }
  return (fallback.data ?? []) as unknown as SharedRemateRow[];
}

async function mergeSharedEventsIntoConfig(config: EditorConfig): Promise<EditorConfig> {
  const data = await fetchSharedRematesRows();
  if (!data.length) return config;

  const byId = new Map(config.upcomingAuctions.map((event) => [event.id, event]));
  for (const row of data as SharedRemateRow[]) {
    const current = byId.get(row.id);
    const merged = {
      id: row.id,
      name: current?.name && current.name.trim().length > 0 ? current.name : inferEventName(row),
      date: current?.date || inferEventDate(row),
      startAt: current?.startAt ?? row.fecha_hora_inicio ?? undefined,
      endAt: current?.endAt ?? row.fecha_hora_cierre ?? row.fecha_hora_remate ?? undefined,
      eventType: current?.eventType ?? inferEventType(row),
    };
    byId.set(row.id, merged);
  }

  return {
    ...config,
    upcomingAuctions: Array.from(byId.values()).sort((a, b) => {
      const tA = Date.parse(a.date || "");
      const tB = Date.parse(b.date || "");
      if (!Number.isFinite(tA) || !Number.isFinite(tB)) return 0;
      return tA - tB;
    }),
  };
}

export async function GET() {
  const result = await getEditorConfig();
  const mergedConfig = await mergeSharedEventsIntoConfig(result.config);
  return Response.json({ ok: true, config: mergedConfig, persisted: result.persisted });
}

export async function PUT(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const session = verifyAdminSessionToken(token);
  if (!session.valid || !session.email) {
    return Response.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { config?: EditorConfig };
  const config = body.config ?? DEFAULT_EDITOR_CONFIG;
  const result = await saveEditorConfig(config, session.email);
  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: 400 });
  }
  const normalizedConfig = result.normalizedConfig ?? config;
  const mergedConfig = await mergeSharedEventsIntoConfig(normalizedConfig);

  try {
    const sync = await syncEditorConfigToSharedTables(normalizedConfig);
    return Response.json({ ok: true, sync, config: mergedConfig, syncOk: true });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Se guardó la configuración, pero falló la sincronización compartida.";
    return Response.json({ ok: false, error: message, config: mergedConfig, syncOk: false }, { status: 500 });
  }
}
