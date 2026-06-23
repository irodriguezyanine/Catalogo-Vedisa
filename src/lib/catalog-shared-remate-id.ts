import type { EditorConfig } from "@/types/editor";
import {
  DEFAULT_VENTA_DIRECTA_EVENT_ID,
  DEFAULT_VENTA_DIRECTA_EVENT_NAME,
} from "@/lib/catalog-shared-constants";

export type SharedRemateLookupRow = {
  id: string;
  numero_remate?: string | null;
  numero_correlativo?: number | null;
  descripcion?: string | null;
};

export function extractRemateNumberFromLabel(label: string): string | null {
  const match = label.match(/REMATE\s*#?\s*(\d+)/i);
  return match?.[1] ?? null;
}

function parseNumericToken(value: string): number | null {
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function numbersEquivalent(left: string, right: string): boolean {
  if (left === right) return true;
  const leftNum = parseNumericToken(left);
  const rightNum = parseNumericToken(right);
  return leftNum != null && rightNum != null && leftNum === rightNum;
}

function remateMatchesNumber(row: SharedRemateLookupRow, numero: string): boolean {
  const targetNum = parseNumericToken(numero);
  if (targetNum != null && row.numero_correlativo != null && row.numero_correlativo === targetNum) {
    return true;
  }

  const rowNumero = String(row.numero_remate ?? "").trim();
  if (numbersEquivalent(rowNumero, numero)) return true;

  const hashMatch = rowNumero.match(/#\s*0*(\d+)\s*$/i);
  if (hashMatch && numbersEquivalent(hashMatch[1], numero)) return true;

  const descripcion = String(row.descripcion ?? "").toUpperCase();
  return (
    descripcion.includes(`REMATE ${numero}`) ||
    descripcion.includes(`REMATE${numero}`) ||
    descripcion.includes(`REMATE #${numero}`)
  );
}

function pickPreferredRemateMatch(
  matches: SharedRemateLookupRow[],
  configAuctionId: string,
): SharedRemateLookupRow {
  const preferred = matches.find((row) => row.id !== configAuctionId);
  return preferred ?? matches[0];
}

/**
 * Usa el UUID del remate que Tasaciones/Subastas ya tienen (p. ej. REMATE 1085),
 * aunque el catálogo haya creado un duplicado con otro UUID en la misma base.
 */
export function resolveCanonicalRemateIdForSync(
  configAuctionId: string,
  auctionName: string,
  remates: SharedRemateLookupRow[],
): string {
  const catalogLabel = DEFAULT_VENTA_DIRECTA_EVENT_NAME.trim().toLowerCase();
  const auctionLabel = auctionName.trim().toLowerCase();
  if (
    configAuctionId === DEFAULT_VENTA_DIRECTA_EVENT_ID ||
    auctionLabel === catalogLabel ||
    (auctionLabel.includes("venta directa") && auctionLabel.includes("catálogo")) ||
    (auctionLabel.includes("venta directa") && auctionLabel.includes("catalogo"))
  ) {
    if (remates.some((row) => row.id === DEFAULT_VENTA_DIRECTA_EVENT_ID)) {
      return DEFAULT_VENTA_DIRECTA_EVENT_ID;
    }
    const byCatalogName = remates.filter((row) =>
      String(row.descripcion ?? "")
        .trim()
        .toLowerCase()
        .includes("venta directa"),
    );
    if (byCatalogName.length >= 1) {
      return pickPreferredRemateMatch(byCatalogName, configAuctionId).id;
    }
  }

  const numero = extractRemateNumberFromLabel(auctionName);
  if (numero) {
    const matches = remates.filter((row) => remateMatchesNumber(row, numero));
    if (matches.length >= 1) return pickPreferredRemateMatch(matches, configAuctionId).id;
  }

  const label = auctionName.trim().toLowerCase();
  if (label) {
    const byDescription = remates.filter((row) =>
      String(row.descripcion ?? "")
        .trim()
        .toLowerCase()
        .includes(label),
    );
    if (byDescription.length >= 1) return pickPreferredRemateMatch(byDescription, configAuctionId).id;
  }

  if (remates.some((row) => row.id === configAuctionId)) return configAuctionId;
  return configAuctionId;
}

export function applyRemateIdMappingsToEditorConfig(
  config: EditorConfig,
  mappings: Record<string, string>,
): EditorConfig {
  const entries = Object.entries(mappings).filter(([from, to]) => from && to && from !== to);
  if (entries.length === 0) return config;

  const mapId = (id: string) => mappings[id] ?? id;
  const seenAuctionIds = new Set<string>();
  const upcomingAuctions = [];

  for (const auction of config.upcomingAuctions ?? []) {
    const id = mapId(auction.id);
    if (!id || seenAuctionIds.has(id)) continue;
    seenAuctionIds.add(id);
    upcomingAuctions.push(id === auction.id ? auction : { ...auction, id });
  }

  const vehicleUpcomingAuctionIds: Record<string, string> = {};
  for (const [vehicleKey, auctionId] of Object.entries(config.vehicleUpcomingAuctionIds ?? {})) {
    if (!auctionId) continue;
    vehicleUpcomingAuctionIds[vehicleKey] = mapId(auctionId);
  }

  const hiddenCategoryIds = (config.hiddenCategoryIds ?? []).map((value) => {
    if (!value.startsWith("auction:")) return value;
    const oldId = value.slice("auction:".length);
    const nextId = mapId(oldId);
    return nextId ? `auction:${nextId}` : value;
  });

  const manualPublications = (config.manualPublications ?? []).map((entry) => {
    if (!entry.upcomingAuctionId) return entry;
    const nextId = mapId(entry.upcomingAuctionId);
    return nextId === entry.upcomingAuctionId ? entry : { ...entry, upcomingAuctionId: nextId };
  });

  const soldVehicleHistory = (config.soldVehicleHistory ?? []).map((entry) => {
    if (!entry.auctionId) return entry;
    const nextId = mapId(entry.auctionId);
    return nextId === entry.auctionId ? entry : { ...entry, auctionId: nextId };
  });

  return {
    ...config,
    upcomingAuctions,
    vehicleUpcomingAuctionIds,
    hiddenCategoryIds,
    manualPublications,
    soldVehicleHistory,
  };
}
