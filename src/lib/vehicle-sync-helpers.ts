import type { CatalogItem } from "@/types/catalog";
import type { EditorConfig } from "@/types/editor";
import { getPatentFromItem } from "@/lib/catalog-keys";
import { isPlaceholderVehicleIdentity } from "@/lib/vehicle-identity";

export function getCatalogItemPatent(item: CatalogItem): string {
  return getPatentFromItem(item);
}

export function getCatalogItemModel(item: CatalogItem): string {
  const raw = item.raw as Record<string, unknown>;
  const patent = getPatentFromItem(item);
  const candidates = [raw.modelo, raw.model, raw.model2, item.title];
  for (const value of candidates) {
    if (typeof value !== "string" || !value.trim()) continue;
    const trimmed = value.trim();
    if (patent !== "—" && trimmed.toUpperCase().replace(/\s+/g, "") === patent) continue;
    if (isPlaceholderVehicleIdentity(trimmed)) continue;
    return trimmed;
  }
  return item.title?.trim() || "Sin modelo";
}

export function hasRealVehicleThumbnail(
  item: CatalogItem,
  vehicleKey: string,
  editorConfig: EditorConfig,
): boolean {
  const details = editorConfig.vehicleDetails?.[vehicleKey];
  const candidate =
    details?.thumbnail ??
    item.thumbnail ??
    item.images.find((url) => url.startsWith("http"));
  if (!candidate?.trim()) return false;
  if (candidate.includes("placeholder")) return false;
  return candidate.startsWith("http");
}

export function vehicleTitleNeedsSync(
  item: CatalogItem,
  vehicleKey: string,
  editorConfig: EditorConfig,
  isStaleTitle?: (title: string, patente: string) => boolean,
): boolean {
  const details = editorConfig.vehicleDetails?.[vehicleKey];
  const patente = getCatalogItemPatent(item);
  const title = (details?.title ?? item.title ?? "").trim();
  if (!title || isStaleTitle?.(title, patente)) return true;
  const model = getCatalogItemModel(item).trim();
  if (model && title.toUpperCase() === model.toUpperCase()) return true;
  const brand = (details?.brand ?? String((item.raw as Record<string, unknown>).marca ?? "")).trim();
  const year = (details?.year ?? String((item.raw as Record<string, unknown>).ano ?? "")).trim();
  if (brand && !isPlaceholderVehicleIdentity(brand) && !title.toUpperCase().includes(brand.toUpperCase())) {
    return true;
  }
  if (year && !title.includes(year)) return true;
  return false;
}

export function vehicleNeedsQuickSync(
  item: CatalogItem,
  vehicleKey: string,
  editorConfig: EditorConfig,
  isStaleTitle?: (title: string, patente: string) => boolean,
): boolean {
  if (vehicleKey.startsWith("manual-")) return false;
  return (
    !hasRealVehicleThumbnail(item, vehicleKey, editorConfig) ||
    vehicleTitleNeedsSync(item, vehicleKey, editorConfig, isStaleTitle)
  );
}

export function resolveVehicleThumbnailSrc(item: CatalogItem): string {
  const candidate =
    item.thumbnail ?? item.images.find((url) => url.startsWith("http") && !url.includes("placeholder"));
  return candidate ?? "/placeholder-car.svg";
}
