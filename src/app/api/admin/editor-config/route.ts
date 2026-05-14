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
  estado?: string | null;
  fecha_hora_inicio?: string | null;
  fecha_hora_cierre?: string | null;
  fecha_hora_remate?: string | null;
  created_at?: string | null;
};

type SharedRemateItemRow = {
  remate_id: string | null;
  patente?: string | null;
  extra_fields?: Record<string, unknown> | null;
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

function inferEventEndAt(row: SharedRemateRow) {
  return row.fecha_hora_cierre ?? row.fecha_hora_remate ?? undefined;
}

function inferEventName(row: SharedRemateRow) {
  const descripcion = String(row.descripcion ?? "").trim();
  if (descripcion) return descripcion;
  const numero = String(row.numero_remate ?? "").trim();
  if (numero) return numero;
  return `Evento ${row.id.slice(0, 8)}`;
}

function sanitizeEventTitle(value: string | null | undefined): string {
  const raw = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return "Sin título";
  const parts = raw
    .split(/\s*-\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= 1) return raw;
  const seen = new Set<string>();
  const dedup: string[] = [];
  for (const part of parts) {
    const key = normalizeText(part);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    dedup.push(part);
    if (dedup.length >= 8) break;
  }
  return dedup.join(" - ") || raw;
}

function readExtraString(
  extra: Record<string, unknown> | null | undefined,
  keys: string[],
): string {
  for (const key of keys) {
    const value = String(extra?.[key] ?? "").trim();
    if (value) return value;
  }
  return "";
}

function inferOriginFromSources(sources: Set<string>): "subastas" | "catalogo" | "tasaciones" | "mixto" | "desconocido" {
  const hasPortal = sources.has("portal") || sources.has("subastas");
  const hasCatalogo = sources.has("catalogo");
  const hasTasaciones = sources.has("tasaciones");
  const total = Number(hasPortal) + Number(hasCatalogo) + Number(hasTasaciones);
  if (total > 1) return "mixto";
  if (hasPortal) return "subastas";
  if (hasCatalogo) return "catalogo";
  if (hasTasaciones) return "tasaciones";
  return "desconocido";
}

function normalizePatentKey(value?: string | null) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "");
}

function isActiveSharedEvent(row: SharedRemateRow, nowMs: number) {
  const estado = String(row.estado ?? "").trim().toLowerCase();
  if (estado === "cerrado") return false;
  const endAt = inferEventEndAt(row);
  if (!endAt) return true;
  const endMs = Date.parse(endAt);
  if (!Number.isFinite(endMs)) return true;
  return endMs >= nowMs;
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
    "id, numero_remate, descripcion, tipo, estado, fecha_hora_inicio, fecha_hora_cierre, fecha_hora_remate, created_at";
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

async function fetchSharedRemateItems(remateIds: string[]) {
  if (!remateIds.length) return [] as SharedRemateItemRow[];
  const supabase = getServerSupabase();
  if (!supabase) return [] as SharedRemateItemRow[];
  const remateSet = new Set(remateIds);

  const { data, error } = await supabase
    .from("remates_items")
    .select("remate_id, patente, extra_fields")
    .in("remate_id", remateIds)
    .limit(20000);
  if (!error && data) {
    const direct = (data ?? []) as unknown as SharedRemateItemRow[];
    if (direct.length > 0) return direct;
  } else if (error) {
    console.warn("No se pudieron leer items compartidos de remates (direct):", error);
  }

  // Fallback: algunos entornos tienen el vínculo en extra_fields (tasaciones_remate_id/source_remate_id).
  const { data: fallbackData, error: fallbackError } = await supabase
    .from("remates_items")
    .select("remate_id, patente, extra_fields")
    .order("created_at", { ascending: false })
    .limit(20000);
  if (fallbackError) {
    console.warn("No se pudieron leer items compartidos de remates (fallback):", fallbackError);
    return [] as SharedRemateItemRow[];
  }
  const fallbackRows = ((fallbackData ?? []) as unknown as SharedRemateItemRow[]).filter((row) => {
    const remateId = String(row.remate_id ?? "");
    if (remateId && remateSet.has(remateId)) return true;
    const extra = (row.extra_fields ?? {}) as Record<string, unknown>;
    const linked = readExtraString(extra, ["tasaciones_remate_id", "source_remate_id", "portal_remate_id"]);
    return Boolean(linked && remateSet.has(linked));
  });
  return fallbackRows;
}

async function mergeSharedEventsIntoConfig(config: EditorConfig): Promise<EditorConfig> {
  const data = await fetchSharedRematesRows();
  if (!data.length) return config;
  const nowMs = Date.now();
  const activeRows = data.filter((row) => isActiveSharedEvent(row, nowMs));
  if (!activeRows.length) {
    return {
      ...config,
      upcomingAuctions: (config.upcomingAuctions ?? []).filter((auction) => {
        const endAt = auction.endAt;
        if (!endAt) return true;
        const endMs = Date.parse(endAt);
        if (!Number.isFinite(endMs)) return true;
        return endMs >= nowMs;
      }),
    };
  }
  const remateIds = activeRows.map((row) => row.id).filter((id) => id);
  const sharedItems = await fetchSharedRemateItems(remateIds);

  const byId = new Map(config.upcomingAuctions.map((event) => [event.id, event]));
  for (const row of activeRows as SharedRemateRow[]) {
    const current = byId.get(row.id);
    const currentName = sanitizeEventTitle(current?.name ?? "");
    const fallbackName = sanitizeEventTitle(inferEventName(row));
    const merged = {
      id: row.id,
      name: currentName && currentName !== "Sin título" ? currentName : fallbackName,
      date: current?.date || inferEventDate(row),
      startAt: current?.startAt ?? row.fecha_hora_inicio ?? undefined,
      endAt: current?.endAt ?? inferEventEndAt(row),
      eventType: current?.eventType ?? inferEventType(row),
    };
    byId.set(row.id, merged);
  }

  const upcomingAuctions = Array.from(byId.values()).filter((auction) => {
    const endAt = auction.endAt;
    if (!endAt) return true;
    const endMs = Date.parse(endAt);
    if (!Number.isFinite(endMs)) return true;
    return endMs >= nowMs;
  });

  const visibleAuctionIds = new Set(upcomingAuctions.map((auction) => auction.id));
  const nextVehicleUpcomingAuctionIds = { ...config.vehicleUpcomingAuctionIds };
  const rematesSection = new Set(config.sectionVehicleIds["proximos-remates"] ?? []);
  const ventaDirectaSection = new Set(config.sectionVehicleIds["ventas-directas"] ?? []);
  const hiddenCategoryIds = new Set(config.hiddenCategoryIds ?? []);
  const sourcesByAuction = new Map<string, Set<string>>();

  // Mantiene visibles en Home las secciones comerciales sincronizadas.
  hiddenCategoryIds.delete("section:proximos-remates");
  hiddenCategoryIds.delete("section:ventas-directas");

  for (const item of sharedItems) {
    const remateId = String(item.remate_id ?? "");
    const extra = (item.extra_fields ?? {}) as Record<string, unknown>;
    const linkedId = readExtraString(extra, ["tasaciones_remate_id", "source_remate_id", "portal_remate_id"]);
    const auctionId = remateId && visibleAuctionIds.has(remateId) ? remateId : linkedId;
    if (!auctionId || !visibleAuctionIds.has(auctionId)) continue;
    const vehicleKey = normalizePatentKey(item.patente);
    const source = readExtraString(extra, ["source_system", "origin_system"]).toLowerCase();
    if (!sourcesByAuction.has(auctionId)) sourcesByAuction.set(auctionId, new Set<string>());
    if (source) sourcesByAuction.get(auctionId)?.add(source);
    if (!vehicleKey) continue;

    const auction = byId.get(auctionId);
    const eventType = auction?.eventType ?? "remate";
    hiddenCategoryIds.delete(`auction:${auctionId}`);
    nextVehicleUpcomingAuctionIds[vehicleKey] = auctionId;
    if (eventType === "venta_directa") {
      ventaDirectaSection.add(vehicleKey);
    } else {
      rematesSection.add(vehicleKey);
    }
  }

  return {
    ...config,
    upcomingAuctions: upcomingAuctions.sort((a, b) => {
      const tA = Date.parse(a.date || "");
      const tB = Date.parse(b.date || "");
      if (!Number.isFinite(tA) || !Number.isFinite(tB)) return 0;
      return tA - tB;
    }).map((auction) => ({
      ...auction,
      eventOrigin:
        auction.eventOrigin ??
        inferOriginFromSources(sourcesByAuction.get(auction.id) ?? new Set<string>()),
    })),
    vehicleUpcomingAuctionIds: nextVehicleUpcomingAuctionIds,
    sectionVehicleIds: {
      ...config.sectionVehicleIds,
      "proximos-remates": Array.from(rematesSection),
      "ventas-directas": Array.from(ventaDirectaSection),
    },
    hiddenCategoryIds: Array.from(hiddenCategoryIds),
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
