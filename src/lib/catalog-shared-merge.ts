import { createClient } from "@supabase/supabase-js";
import { clearHiddenBlocksForVehicleKeys } from "@/lib/editor-publication-unblock";
import {
  DEFAULT_VENTA_DIRECTA_EVENT_ID,
  applySharedRemateEstadoToHiddenCategories,
  ensureDefaultVentaDirectaAuction,
  ESTADO_RETIRO_VENTA_DIRECTA,
  isVentaDirectaAuctionActive,
  resolveCommercialEventType,
} from "@/lib/catalog-shared-constants";
import type { EditorConfig, UpcomingAuction } from "@/types/editor";

export type SharedRemateRow = {
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

export type SharedRemateItemRow = {
  remate_id: string | null;
  patente?: string | null;
  extra_fields?: Record<string, unknown> | null;
};

const INVENTARIO_TABLE = process.env.CATALOG_SYNC_INVENTARIO_TABLE ?? "inventario";
const REMATES_TABLE = process.env.CATALOG_SYNC_REMATES_TABLE ?? "remates";
const REMATES_ITEMS_TABLE = process.env.CATALOG_SYNC_REMATES_ITEMS_TABLE ?? "remates_items";

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

export function inferOriginFromSources(
  sources: Set<string>,
): "subastas" | "catalogo" | "tasaciones" | "mixto" | "desconocido" {
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

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function fetchInventoryVehicleKeyAliases(): Promise<Map<string, string>> {
  const supabase = getServerSupabase();
  if (!supabase) return new Map();

  const { data, error } = await supabase
    .from(INVENTARIO_TABLE)
    .select("id, patente, stock_number")
    .limit(10000);
  if (error) {
    console.warn("No se pudo leer inventario para cruce de patentes:", error);
    return new Map();
  }

  const aliasToPreferredKey = new Map<string, string>();
  for (const row of (data ?? []) as Array<{
    id?: string | null;
    patente?: string | null;
    stock_number?: string | null;
  }>) {
    const patentKey = normalizePatentKey(row.patente);
    const stockKey = normalizePatentKey(row.stock_number);
    const preferredKey = patentKey || stockKey || String(row.id ?? "").trim();
    if (!preferredKey) continue;

    const aliases = [patentKey, stockKey, String(row.id ?? "").trim()].filter(Boolean);
    for (const alias of aliases) {
      aliasToPreferredKey.set(alias, preferredKey);
    }
  }
  return aliasToPreferredKey;
}

function resolveCatalogVehicleKeys(
  aliasToPreferredKey: Map<string, string>,
  ...rawKeys: Array<string | null | undefined>
): string[] {
  const resolved = new Set<string>();
  for (const raw of rawKeys) {
    const normalized = normalizePatentKey(raw);
    if (!normalized) continue;
    const preferred = aliasToPreferredKey.get(normalized) ?? normalized;
    resolved.add(preferred);
    if (preferred !== normalized) resolved.add(normalized);
  }
  return [...resolved];
}

function vehicleStillInRematePatentes(
  vehicleKey: string,
  allowed: Set<string>,
  inventoryAliases: Map<string, string>,
  config: EditorConfig,
): boolean {
  const candidatePatentes = new Set<string>();
  for (const alias of resolveCatalogVehicleKeys(inventoryAliases, vehicleKey)) {
    const norm = normalizePatentKey(alias);
    if (norm) candidatePatentes.add(norm);
  }
  const detailPatente = normalizePatentKey(config.vehicleDetails?.[vehicleKey]?.patente);
  if (detailPatente) candidatePatentes.add(detailPatente);

  if ([...candidatePatentes].some((patente) => allowed.has(patente))) return true;

  for (const patente of allowed) {
    for (const aliasKey of resolveCatalogVehicleKeys(inventoryAliases, patente)) {
      if (aliasKey === vehicleKey) return true;
      const norm = normalizePatentKey(aliasKey);
      if (norm && candidatePatentes.has(norm)) return true;
    }
  }

  return false;
}

function assignVehicleToAuction(
  assignments: Record<string, string>,
  section: Set<string>,
  vehicleKeys: string[],
  auctionId: string,
) {
  for (const vehicleKey of vehicleKeys) {
    if (!vehicleKey) continue;
    assignments[vehicleKey] = auctionId;
    section.add(vehicleKey);
  }
}

function isActiveSharedEvent(row: SharedRemateRow, nowMs: number) {
  const estado = String(row.estado ?? "").trim().toLowerCase();
  if (estado === "cerrado") return false;
  if (inferEventType(row) === "venta_directa") {
    if (estado === "abierto") return true;
    const endAt = row.fecha_hora_cierre ?? row.fecha_hora_remate;
    if (!endAt?.trim()) return true;
    const endMs = Date.parse(endAt);
    if (!Number.isFinite(endMs)) return true;
    return endMs >= nowMs;
  }
  const endAt = inferEventEndAt(row);
  if (!endAt) return true;
  const endMs = Date.parse(endAt);
  if (!Number.isFinite(endMs)) return true;
  return endMs >= nowMs;
}

function resolveEditorAuctionEventType(auction: UpcomingAuction): "remate" | "venta_directa" {
  return resolveCommercialEventType(auction);
}

function isEditorAuctionStillActive(auction: UpcomingAuction, nowMs: number): boolean {
  if (resolveEditorAuctionEventType(auction) === "venta_directa") {
    return isVentaDirectaAuctionActive(auction, nowMs);
  }
  const endAt = auction.endAt ?? auction.date;
  if (!endAt) return true;
  const endMs = Date.parse(endAt);
  if (!Number.isFinite(endMs)) return true;
  return endMs >= nowMs;
}

async function fetchVentaDirectaInventoryRawKeys(): Promise<string[]> {
  const supabase = getServerSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from(INVENTARIO_TABLE)
    .select("patente, stock_number, id")
    .eq("estado_retiro", ESTADO_RETIRO_VENTA_DIRECTA)
    .limit(10000);

  if (error) {
    console.warn("No se pudo leer inventario en venta directa:", error);
    return [];
  }

  const rawKeys: string[] = [];
  for (const row of (data ?? []) as Array<{
    patente?: string | null;
    stock_number?: string | null;
    id?: string | null;
  }>) {
    if (row.patente) rawKeys.push(String(row.patente));
    if (row.stock_number) rawKeys.push(String(row.stock_number));
    if (row.id) rawKeys.push(String(row.id));
  }
  return rawKeys;
}

function isMissingColumnError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const message = String((error as { message?: unknown }).message ?? "").toLowerCase();
  const code = String((error as { code?: unknown }).code ?? "");
  return code === "42703" || (message.includes("column") && message.includes("does not exist"));
}

export async function fetchSharedRematesRows(): Promise<SharedRemateRow[]> {
  const supabase = getServerSupabase();
  if (!supabase) return [];

  const runSelect = async (selectColumns: string) =>
    supabase
      .from(REMATES_TABLE)
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
    return [];
  }

  const fallback = await runSelect(baseSelect);
  if (fallback.error) {
    console.warn("No se pudo leer remates compartidos con fallback:", fallback.error);
    return [];
  }
  return (fallback.data ?? []) as unknown as SharedRemateRow[];
}

export async function fetchSharedRemateItems(remateIds: string[]): Promise<SharedRemateItemRow[]> {
  if (!remateIds.length) return [];
  const supabase = getServerSupabase();
  if (!supabase) return [];
  const remateSet = new Set(remateIds);

  const { data, error } = await supabase
    .from(REMATES_ITEMS_TABLE)
    .select("remate_id, patente, extra_fields")
    .in("remate_id", remateIds)
    .limit(20000);
  if (!error && data) {
    const direct = (data ?? []) as unknown as SharedRemateItemRow[];
    if (direct.length > 0) return direct;
  } else if (error) {
    console.warn("No se pudieron leer items compartidos de remates (direct):", error);
  }

  const { data: fallbackData, error: fallbackError } = await supabase
    .from(REMATES_ITEMS_TABLE)
    .select("remate_id, patente, extra_fields")
    .order("created_at", { ascending: false })
    .limit(20000);
  if (fallbackError) {
    console.warn("No se pudieron leer items compartidos de remates (fallback):", fallbackError);
    return [];
  }
  return ((fallbackData ?? []) as unknown as SharedRemateItemRow[]).filter((row) => {
    const remateId = String(row.remate_id ?? "");
    if (remateId && remateSet.has(remateId)) return true;
    const extra = (row.extra_fields ?? {}) as Record<string, unknown>;
    const linked = readExtraString(extra, ["tasaciones_remate_id", "source_remate_id", "portal_remate_id"]);
    return Boolean(linked && remateSet.has(linked));
  });
}

export function finalizeMergedHiddenCategoryIds(
  hiddenCategoryIds: Set<string>,
  visibleAuctionIds: Set<string>,
): string[] {
  return [...hiddenCategoryIds].filter((value) => {
    if (!value.startsWith("auction:")) return true;
    return visibleAuctionIds.has(value.slice("auction:".length));
  });
}

/**
 * Fusiona eventos comerciales activos desde Tasaciones/Subastas (tablas compartidas)
 * con la configuración del editor del catálogo, sin perder eventos creados localmente
 * que aún no se replicaron.
 */
async function fetchExcludedPatentesByRemate(): Promise<Map<string, Set<string>>> {
  const supabase = getServerSupabase();
  if (!supabase) return new Map();

  const { data, error } = await supabase
    .from("remates_items_exclusiones")
    .select("remate_id, patente_norm");

  if (error) {
    console.warn("No se pudieron leer exclusiones de remates:", error);
    return new Map();
  }

  const map = new Map<string, Set<string>>();
  for (const row of (data ?? []) as Array<{ remate_id?: string | null; patente_norm?: string | null }>) {
    const remateId = String(row.remate_id ?? "");
    const patente = normalizePatentKey(row.patente_norm);
    if (!remateId || !patente) continue;
    if (!map.has(remateId)) map.set(remateId, new Set());
    map.get(remateId)?.add(patente);
  }
  return map;
}

export type MergeSharedEventsOptions = {
  /**
   * Si es false, no elimina asignaciones del catálogo solo porque aún no aparecen en
   * remates_items compartidos (p. ej. lectura admin o guardado antes del push).
   */
  pruneOrphanCatalogAssignments?: boolean;
};

export async function mergeSharedEventsIntoConfig(
  config: EditorConfig,
  options: MergeSharedEventsOptions = {},
): Promise<EditorConfig> {
  const pruneOrphanCatalogAssignments = options.pruneOrphanCatalogAssignments !== false;
  const nowMs = Date.now();
  const soldVehicleKeys = new Set(config.soldVehicleIds ?? []);
  const rematesSection = new Set(config.sectionVehicleIds["proximos-remates"] ?? []);
  const ventaDirectaSection = new Set(config.sectionVehicleIds["ventas-directas"] ?? []);
  for (const soldKey of soldVehicleKeys) {
    rematesSection.delete(soldKey);
    ventaDirectaSection.delete(soldKey);
  }
  const byId = new Map<string, UpcomingAuction>();

  for (const auction of config.upcomingAuctions ?? []) {
    if (!auction?.id) continue;
    if (isEditorAuctionStillActive(auction, nowMs)) {
      byId.set(auction.id, { ...auction });
    }
  }

  const data = await fetchSharedRematesRows();
  const activeRows = data.filter((row) => isActiveSharedEvent(row, nowMs));

  const hiddenCategoryIds = new Set(
    (config.hiddenCategoryIds ?? []).filter((value) => {
      if (!value.startsWith("auction:")) return true;
      const auctionId = value.slice("auction:".length);
      return activeRows.some((row) => row.id === auctionId) || data.some((row) => row.id === auctionId);
    }),
  );
  applySharedRemateEstadoToHiddenCategories(hiddenCategoryIds, data);

  for (const row of activeRows) {
    const current = byId.get(row.id) ?? (config.upcomingAuctions ?? []).find((event) => event.id === row.id);
    const currentName = sanitizeEventTitle(current?.name ?? row.descripcion ?? row.numero_remate ?? "");
    const fallbackName = sanitizeEventTitle(inferEventName(row));
    byId.set(row.id, {
      id: row.id,
      name: currentName && currentName !== "Sin título" ? currentName : fallbackName,
      date: current?.date || inferEventDate(row),
      startAt: current?.startAt ?? row.fecha_hora_inicio ?? undefined,
      endAt: current?.endAt ?? inferEventEndAt(row),
      eventType: row.tipo ?? current?.eventType ?? inferEventType(row),
      eventOrigin: current?.eventOrigin,
    });
  }

  const inventoryAliases = await fetchInventoryVehicleKeyAliases();
  const excludedPatentesByRemate = await fetchExcludedPatentesByRemate();
  const nextVehicleUpcomingAuctionIds: Record<string, string> = {
    ...(config.vehicleUpcomingAuctionIds ?? {}),
  };

  const sourcesByAuction = new Map<string, Set<string>>();
  const reassignedVehicleKeys = new Set<string>();
  const visibleAuctionIdsFromRows = new Set(
    Array.from(byId.values())
      .filter((auction) => isEditorAuctionStillActive(auction, nowMs))
      .map((auction) => auction.id),
  );

  let patentesByRemate = new Map<string, Set<string>>();

  if (activeRows.length > 0) {
    const remateIds = activeRows.map((row) => row.id).filter(Boolean);
    const sharedItems = await fetchSharedRemateItems(remateIds);
    patentesByRemate = new Map<string, Set<string>>();

    for (const item of sharedItems) {
      const remateId = String(item.remate_id ?? "");
      const extra = (item.extra_fields ?? {}) as Record<string, unknown>;
      const linkedId = readExtraString(extra, ["tasaciones_remate_id", "source_remate_id", "portal_remate_id"]);
      const auctionId =
        remateId && visibleAuctionIdsFromRows.has(remateId) ? remateId : linkedId;
      if (!auctionId || !visibleAuctionIdsFromRows.has(auctionId)) continue;
      const patenteNorm = normalizePatentKey(item.patente);
      if (patenteNorm) {
        const excluded = excludedPatentesByRemate.get(auctionId);
        if (excluded?.has(patenteNorm)) continue;
        if (!patentesByRemate.has(auctionId)) patentesByRemate.set(auctionId, new Set());
        patentesByRemate.get(auctionId)?.add(patenteNorm);
      }
      const source = readExtraString(extra, ["source_system", "origin_system"]).toLowerCase();
      if (!sourcesByAuction.has(auctionId)) sourcesByAuction.set(auctionId, new Set<string>());
      if (source) sourcesByAuction.get(auctionId)?.add(source);

      const vehicleKeys = resolveCatalogVehicleKeys(
        inventoryAliases,
        item.patente,
        readExtraString(extra, ["inventario_id", "inventory_id", "vehicle_id", "catalog_vehicle_id"]),
      ).filter((vehicleKey) => !soldVehicleKeys.has(vehicleKey));
      if (!vehicleKeys.length) continue;

      const auction = byId.get(auctionId);
      const eventType = auction?.eventType ?? "remate";
      hiddenCategoryIds.delete(`auction:${auctionId}`);
      const targetSection = eventType === "venta_directa" ? ventaDirectaSection : rematesSection;
      assignVehicleToAuction(nextVehicleUpcomingAuctionIds, targetSection, vehicleKeys, auctionId);
      for (const vehicleKey of vehicleKeys) reassignedVehicleKeys.add(vehicleKey);
    }

    if (pruneOrphanCatalogAssignments) {
      // Quita asignaciones huérfanas que ya no existen en remates_items compartidos.
      for (const vehicleKey of Object.keys(nextVehicleUpcomingAuctionIds)) {
        const auctionId = nextVehicleUpcomingAuctionIds[vehicleKey];
        if (!auctionId || !visibleAuctionIdsFromRows.has(auctionId)) continue;
        const auction = byId.get(auctionId);
        if (!auction || resolveEditorAuctionEventType(auction) === "venta_directa") continue;
        const allowed = patentesByRemate.get(auctionId);
        if (!allowed || allowed.size === 0) continue;

        const stillInRemate = vehicleStillInRematePatentes(
          vehicleKey,
          allowed,
          inventoryAliases,
          config,
        );
        if (!stillInRemate) {
          delete nextVehicleUpcomingAuctionIds[vehicleKey];
          rematesSection.delete(vehicleKey);
        }
      }

      for (const remateId of remateIds) {
        const allowed = patentesByRemate.get(remateId) ?? new Set<string>();
        if (allowed.size > 0) continue;
        for (const vehicleKey of Object.keys(nextVehicleUpcomingAuctionIds)) {
          if (nextVehicleUpcomingAuctionIds[vehicleKey] !== remateId) continue;
          delete nextVehicleUpcomingAuctionIds[vehicleKey];
          rematesSection.delete(vehicleKey);
        }
      }

      for (const [vehicleKey, auctionId] of Object.entries(nextVehicleUpcomingAuctionIds)) {
        const excluded = excludedPatentesByRemate.get(auctionId);
        if (!excluded?.size) continue;
        const candidatePatentes = new Set<string>();
        for (const alias of resolveCatalogVehicleKeys(inventoryAliases, vehicleKey)) {
          const norm = normalizePatentKey(alias);
          if (norm) candidatePatentes.add(norm);
        }
        const detailPatente = normalizePatentKey(config.vehicleDetails?.[vehicleKey]?.patente);
        if (detailPatente) candidatePatentes.add(detailPatente);
        const isExcluded = [...candidatePatentes].some((patente) => excluded.has(patente));
        if (isExcluded) {
          delete nextVehicleUpcomingAuctionIds[vehicleKey];
          rematesSection.delete(vehicleKey);
        }
      }
    }
  }

  const ventaDirectaInventoryRaw = await fetchVentaDirectaInventoryRawKeys();
  for (const raw of ventaDirectaInventoryRaw) {
    const vehicleKeys = resolveCatalogVehicleKeys(inventoryAliases, raw).filter(
      (vehicleKey) => !soldVehicleKeys.has(vehicleKey),
    );
    for (const vehicleKey of vehicleKeys) {
      ventaDirectaSection.add(vehicleKey);
      reassignedVehicleKeys.add(vehicleKey);
      const assignedId = nextVehicleUpcomingAuctionIds[vehicleKey];
      if (!assignedId) {
        nextVehicleUpcomingAuctionIds[vehicleKey] = DEFAULT_VENTA_DIRECTA_EVENT_ID;
        continue;
      }
      const assignedAuction = byId.get(assignedId);
      if (assignedAuction && resolveEditorAuctionEventType(assignedAuction) === "venta_directa") {
        ventaDirectaSection.add(vehicleKey);
      }
    }
  }

  ensureDefaultVentaDirectaAuction(byId, ventaDirectaSection);

  const ventaDirectaPoolKeys = new Set<string>();
  for (const raw of ventaDirectaInventoryRaw) {
    for (const key of resolveCatalogVehicleKeys(inventoryAliases, raw)) {
      ventaDirectaPoolKeys.add(key);
      const norm = normalizePatentKey(key);
      if (norm) ventaDirectaPoolKeys.add(norm);
    }
  }
  if (pruneOrphanCatalogAssignments) {
    for (const vehicleKey of Object.keys(nextVehicleUpcomingAuctionIds)) {
      if (nextVehicleUpcomingAuctionIds[vehicleKey] !== DEFAULT_VENTA_DIRECTA_EVENT_ID) continue;
      const candidateKeys = resolveCatalogVehicleKeys(inventoryAliases, vehicleKey);
      const inPool = candidateKeys.some((key) => ventaDirectaPoolKeys.has(key));
      const allowed = patentesByRemate.get(DEFAULT_VENTA_DIRECTA_EVENT_ID);
      const detailPatente = normalizePatentKey(config.vehicleDetails?.[vehicleKey]?.patente);
      const inItems =
        Boolean(allowed?.size) &&
        [...candidateKeys, detailPatente]
          .map((value) => normalizePatentKey(value))
          .filter(Boolean)
          .some((patente) => allowed?.has(patente));
      if (!inPool && !inItems) {
        delete nextVehicleUpcomingAuctionIds[vehicleKey];
        ventaDirectaSection.delete(vehicleKey);
      }
    }
  }

  const upcomingAuctions = Array.from(byId.values()).filter((auction) =>
    isEditorAuctionStillActive(auction, nowMs),
  );
  const visibleAuctionIds = new Set(upcomingAuctions.map((auction) => auction.id));
  const filteredVehicleUpcomingAuctionIds = Object.fromEntries(
    Object.entries(nextVehicleUpcomingAuctionIds).filter(
      ([vehicleKey, auctionId]) =>
        visibleAuctionIds.has(auctionId) && !soldVehicleKeys.has(vehicleKey),
    ),
  );
  const staleAssignedKeys = new Set(
    Object.keys(config.vehicleUpcomingAuctionIds ?? {}).filter(
      (vehicleKey) => !(vehicleKey in filteredVehicleUpcomingAuctionIds),
    ),
  );
  for (const vehicleKey of staleAssignedKeys) {
    rematesSection.delete(vehicleKey);
    if (!ventaDirectaInventoryRaw.some((raw) => resolveCatalogVehicleKeys(inventoryAliases, raw).includes(vehicleKey))) {
      ventaDirectaSection.delete(vehicleKey);
    }
  }

  const filteredHiddenCategoryIds = finalizeMergedHiddenCategoryIds(hiddenCategoryIds, visibleAuctionIds);

  const unblockedPublication = clearHiddenBlocksForVehicleKeys(config, reassignedVehicleKeys);

  return {
    ...config,
    ...unblockedPublication,
    upcomingAuctions: upcomingAuctions
      .sort((a, b) => {
        const tA = Date.parse(a.date || "");
        const tB = Date.parse(b.date || "");
        if (!Number.isFinite(tA) || !Number.isFinite(tB)) return 0;
        return tA - tB;
      })
      .map((auction) => ({
        ...auction,
        eventOrigin:
          auction.eventOrigin ??
          inferOriginFromSources(sourcesByAuction.get(auction.id) ?? new Set<string>()),
      })),
    vehicleUpcomingAuctionIds: filteredVehicleUpcomingAuctionIds,
    sectionVehicleIds: {
      ...config.sectionVehicleIds,
      "proximos-remates": Array.from(rematesSection),
      "ventas-directas": Array.from(ventaDirectaSection),
    },
    hiddenCategoryIds: filteredHiddenCategoryIds,
  };
}
