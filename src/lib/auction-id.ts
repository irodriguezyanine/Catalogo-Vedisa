import type { EditorConfig, ManualPublication, SoldVehicleRecord, UpcomingAuction } from "@/types/editor";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toHex32FromString(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5 ^ 0x9e3779b9;
  let h3 = 0x811c9dc5 ^ 0x85ebca6b;
  let h4 = 0x811c9dc5 ^ 0xc2b2ae35;

  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x01000193);
    h3 = Math.imul(h3 ^ c, 0x01000193);
    h4 = Math.imul(h4 ^ c, 0x01000193);
  }

  const p1 = (h1 >>> 0).toString(16).padStart(8, "0");
  const p2 = (h2 >>> 0).toString(16).padStart(8, "0");
  const p3 = (h3 >>> 0).toString(16).padStart(8, "0");
  const p4 = (h4 >>> 0).toString(16).padStart(8, "0");
  return `${p1}${p2}${p3}${p4}`;
}

function toUuidFromHex32(hex32: string): string {
  const hex = hex32.slice(0, 32).toLowerCase();
  const chars = hex.split("");
  chars[12] = "4";
  const variantNibble = Number.parseInt(chars[16], 16);
  chars[16] = ((variantNibble & 0x3) | 0x8).toString(16);
  const normalized = chars.join("");
  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20, 32)}`;
}

function deterministicLegacyUuid(rawId: string): string {
  return toUuidFromHex32(toHex32FromString(`catalog-legacy-remate:${rawId}`));
}

export function normalizeAuctionId(rawId?: string | null): string {
  const id = String(rawId ?? "").trim();
  if (!id) return "";
  if (UUID_RE.test(id)) return id.toLowerCase();

  if (id.startsWith("remate-")) {
    const suffix = id.slice("remate-".length).trim();
    if (UUID_RE.test(suffix)) return suffix.toLowerCase();
  }

  return deterministicLegacyUuid(id);
}

function normalizeUpcomingAuctions(
  auctions: UpcomingAuction[] | undefined,
): { auctions: UpcomingAuction[]; idMap: Map<string, string> } {
  const idMap = new Map<string, string>();
  const byId = new Map<string, UpcomingAuction>();

  for (const auction of auctions ?? []) {
    const nextId = normalizeAuctionId(auction.id);
    if (!nextId) continue;
    if (auction.id !== nextId) idMap.set(auction.id, nextId);
    const existing = byId.get(nextId);
    if (!existing) {
      byId.set(nextId, { ...auction, id: nextId });
      continue;
    }
    byId.set(nextId, {
      id: nextId,
      name: existing.name || auction.name,
      date: existing.date || auction.date,
    });
  }

  return { auctions: Array.from(byId.values()), idMap };
}

function remapAssignments(
  assignments: Record<string, string> | undefined,
  idMap: Map<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [vehicleKey, auctionId] of Object.entries(assignments ?? {})) {
    const normalized = idMap.get(auctionId) ?? normalizeAuctionId(auctionId);
    if (!normalized) continue;
    out[vehicleKey] = normalized;
  }
  return out;
}

function remapManualPublications(
  manuals: ManualPublication[] | undefined,
  idMap: Map<string, string>,
): ManualPublication[] {
  return (manuals ?? []).map((entry) => {
    if (!entry.upcomingAuctionId) return entry;
    const normalized = idMap.get(entry.upcomingAuctionId) ?? normalizeAuctionId(entry.upcomingAuctionId);
    if (!normalized || normalized === entry.upcomingAuctionId) return entry;
    return { ...entry, upcomingAuctionId: normalized };
  });
}

function remapHiddenCategories(
  hiddenCategoryIds: string[] | undefined,
  idMap: Map<string, string>,
): string[] {
  return (hiddenCategoryIds ?? []).map((value) => {
    if (!value.startsWith("auction:")) return value;
    const oldId = value.slice("auction:".length);
    const normalized = idMap.get(oldId) ?? normalizeAuctionId(oldId);
    return normalized ? `auction:${normalized}` : value;
  });
}

function remapSoldHistory(
  soldHistory: SoldVehicleRecord[] | undefined,
  idMap: Map<string, string>,
): SoldVehicleRecord[] {
  return (soldHistory ?? []).map((entry) => {
    if (!entry.auctionId) return entry;
    const normalized = idMap.get(entry.auctionId) ?? normalizeAuctionId(entry.auctionId);
    if (!normalized || normalized === entry.auctionId) return entry;
    return { ...entry, auctionId: normalized };
  });
}

export function migrateEditorAuctionIds(config?: Partial<EditorConfig> | null): Partial<EditorConfig> {
  if (!config) return {};
  const { auctions, idMap } = normalizeUpcomingAuctions(config.upcomingAuctions);

  return {
    ...config,
    upcomingAuctions: auctions,
    vehicleUpcomingAuctionIds: remapAssignments(config.vehicleUpcomingAuctionIds, idMap),
    manualPublications: remapManualPublications(config.manualPublications, idMap),
    hiddenCategoryIds: remapHiddenCategories(config.hiddenCategoryIds, idMap),
    soldVehicleHistory: remapSoldHistory(config.soldVehicleHistory, idMap),
  };
}
