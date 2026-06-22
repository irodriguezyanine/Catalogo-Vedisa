import type { EditorConfig } from "@/types/editor";

export type SharedRemateLookupRow = {
  id: string;
  numero_remate?: string | null;
  descripcion?: string | null;
};

export function extractRemateNumberFromLabel(label: string): string | null {
  const match = label.match(/REMATE\s*(\d+)/i);
  return match?.[1] ?? null;
}

function remateMatchesNumber(row: SharedRemateLookupRow, numero: string): boolean {
  const rowNumero = String(row.numero_remate ?? "").trim();
  const descripcion = String(row.descripcion ?? "").toUpperCase();
  return (
    rowNumero === numero ||
    descripcion.includes(`REMATE ${numero}`) ||
    descripcion.includes(`REMATE${numero}`)
  );
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
  const numero = extractRemateNumberFromLabel(auctionName);
  if (numero) {
    const matches = remates.filter((row) => remateMatchesNumber(row, numero));
    if (matches.length === 1) return matches[0].id;
    if (matches.length > 1) {
      const preferred = matches.find((row) => row.id !== configAuctionId);
      return (preferred ?? matches[0]).id;
    }
  }

  const label = auctionName.trim().toLowerCase();
  if (label) {
    const byDescription = remates.filter((row) =>
      String(row.descripcion ?? "")
        .trim()
        .toLowerCase()
        .includes(label),
    );
    if (byDescription.length === 1) return byDescription[0].id;
    if (byDescription.length > 1) {
      const preferred = byDescription.find((row) => row.id !== configAuctionId);
      return (preferred ?? byDescription[0]).id;
    }
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
