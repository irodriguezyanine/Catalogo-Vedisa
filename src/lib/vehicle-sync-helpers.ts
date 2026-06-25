import type { CatalogItem } from "@/types/catalog";
import type { EditorConfig, EditorVehicleDetails } from "@/types/editor";
import { getPatentFromItem } from "@/lib/catalog-keys";
import {
  isAutoredGenericModelImageUrl,
  isGlo3dCatalogImageUrl,
  isTasacionesInventoryPhotoUrl,
} from "@/lib/catalog-sync-images";
import { getEditorOverrideForItem } from "@/lib/catalog-public-inventory";
import { isPlaceholderVehicleIdentity } from "@/lib/vehicle-identity";

function resolveVehicleDetailsOverride(
  item: CatalogItem,
  vehicleKey: string,
  editorConfig: EditorConfig,
): EditorVehicleDetails | undefined {
  return (
    getEditorOverrideForItem(item, editorConfig.vehicleDetails ?? {}) ??
    editorConfig.vehicleDetails?.[vehicleKey]
  );
}

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

function thumbnailLooksLikeGlo3d(url: string): boolean {
  return isGlo3dCatalogImageUrl(url);
}

function thumbnailLooksLikeAutoredGeneric(url: string): boolean {
  return isAutoredGenericModelImageUrl(url);
}

export function hasRealVehicleThumbnail(
  item: CatalogItem,
  vehicleKey: string,
  editorConfig: EditorConfig,
): boolean {
  const details = resolveVehicleDetailsOverride(item, vehicleKey, editorConfig);
  const raw = item.raw as Record<string, unknown>;
  const candidate =
    details?.thumbnail ??
    item.thumbnail ??
    item.images.find((url) => url.startsWith("http")) ??
    (typeof raw.thumbnail === "string" ? raw.thumbnail : undefined) ??
    (typeof raw.imagen_principal === "string" ? raw.imagen_principal : undefined) ??
    (typeof raw.foto_portada === "string" ? raw.foto_portada : undefined);
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
  const details = resolveVehicleDetailsOverride(item, vehicleKey, editorConfig);
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

  const details = resolveVehicleDetailsOverride(item, vehicleKey, editorConfig);
  const raw = item.raw as Record<string, unknown>;
  const view3dUrl =
    details?.view3dUrl ??
    (typeof raw.glo3d_url === "string" ? raw.glo3d_url : undefined) ??
    (typeof raw.url_3d === "string" ? raw.url_3d : undefined);

  const hasThumb = hasRealVehicleThumbnail(item, vehicleKey, editorConfig);
  if (!hasThumb) return true;

  if (view3dUrl?.includes("glo3d")) {
    const thumb =
      details?.thumbnail ??
      item.thumbnail ??
      item.images.find((url) => url.startsWith("http")) ??
      (typeof raw.thumbnail === "string" ? raw.thumbnail : undefined);
    if (!thumb) return true;
    if (thumbnailLooksLikeAutoredGeneric(thumb)) return true;
    if (!thumbnailLooksLikeGlo3d(thumb)) {
      const isUploadedPhoto =
        isTasacionesInventoryPhotoUrl(thumb) ||
        (/supabase\.co|cloudinary|storage/i.test(thumb) &&
          !thumbnailLooksLikeAutoredGeneric(thumb) &&
          !isGlo3dCatalogImageUrl(thumb));
      if (!isUploadedPhoto) return true;
    }
  }

  return vehicleTitleNeedsSync(item, vehicleKey, editorConfig, isStaleTitle);
}

export function resolveVehicleThumbnailSrc(
  item: CatalogItem,
  vehicleKey?: string,
  editorConfig?: EditorConfig,
): string {
  const details =
    editorConfig && vehicleKey
      ? resolveVehicleDetailsOverride(item, vehicleKey, editorConfig)
      : undefined;
  const raw = item.raw as Record<string, unknown>;
  const candidate =
    details?.thumbnail?.trim() ||
    item.thumbnail?.trim() ||
    item.images.find((url) => url.startsWith("http") && !url.includes("placeholder")) ||
    (typeof raw.thumbnail === "string" ? raw.thumbnail : undefined) ||
    (typeof raw.imagen_principal === "string" ? raw.imagen_principal : undefined) ||
    (typeof raw.foto_portada === "string" ? raw.foto_portada : undefined);
  if (candidate?.startsWith("http") && !candidate.includes("placeholder")) return candidate;
  return "/placeholder-car.svg";
}
