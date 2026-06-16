import type { CatalogItem } from "@/types/catalog";

/** Clave estable de vehículo (patente normalizada o id). Fuente única para todo el proyecto. */
export function getVehicleKey(item: CatalogItem): string {
  const patent = getPatentFromItem(item);
  if (patent && patent !== "—") return patent;
  return item.id;
}

export function getPatentFromItem(item: CatalogItem): string {
  const raw = item.raw as Record<string, unknown>;
  const patent = [raw.patente, raw.PATENTE, raw.PPU, raw.stock_number].find(
    (value) => typeof value === "string" && value.trim().length > 0,
  ) as string | undefined;
  if (!patent?.trim()) return "—";
  return patent.trim().toUpperCase().replace(/\s+/g, "").replace(/-/g, "");
}

export function normalizePatentToken(value?: string | null): string {
  if (!value?.trim()) return "";
  return value.trim().toUpperCase().replace(/\s+/g, "").replace(/-/g, "");
}
