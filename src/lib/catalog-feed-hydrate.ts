import { applyCatalogDetailsOverride } from "@/lib/catalog-details-override";
import { getEditorOverrideForItem } from "@/lib/catalog-public-inventory";
import { isGlo3dCatalogImageUrl } from "@/lib/catalog-sync-images";
import type { CatalogItem } from "@/types/catalog";
import type { EditorConfig, EditorVehicleDetails } from "@/types/editor";

function isUsableThumbnail(url?: string | null): boolean {
  return Boolean(url?.startsWith("http") && !url.includes("placeholder"));
}

function pickRicherVehicleDetails(
  a?: EditorVehicleDetails,
  b?: EditorVehicleDetails,
): EditorVehicleDetails | undefined {
  if (!a && !b) return undefined;
  if (!a) return b;
  if (!b) return a;

  const thumbA = a.thumbnail?.trim();
  const thumbB = b.thumbnail?.trim();
  const aGlo3d = thumbA && isGlo3dCatalogImageUrl(thumbA);
  const bGlo3d = thumbB && isGlo3dCatalogImageUrl(thumbB);

  let thumbnail = thumbA;
  if (bGlo3d && !aGlo3d) thumbnail = thumbB;
  else if (bGlo3d && aGlo3d) thumbnail = thumbB ?? thumbA;
  else if (!isUsableThumbnail(thumbA) && isUsableThumbnail(thumbB)) thumbnail = thumbB;

  const view3dUrl = b.view3dUrl?.includes("glo3d")
    ? b.view3dUrl
    : a.view3dUrl?.includes("glo3d")
      ? a.view3dUrl
      : b.view3dUrl ?? a.view3dUrl;

  return {
    ...a,
    ...b,
    thumbnail: thumbnail ?? b.thumbnail ?? a.thumbnail,
    view3dUrl,
    title: b.title?.trim() && b.title !== "Sin modelo" ? b.title : a.title,
    brand: b.brand?.trim() && b.brand !== "Sin Marca" ? b.brand : a.brand,
    model: b.model?.trim() && b.model !== "Sin Modelo" ? b.model : a.model,
    imagesCsv: b.imagesCsv?.trim() ? b.imagesCsv : a.imagesCsv,
  };
}

/** Aplica vehicleDetails persistidos sobre el feed (sobrevive F5 y recargas del inventario). */
export function hydrateCatalogItemsWithEditorConfig(
  items: CatalogItem[],
  config?: EditorConfig | null,
): CatalogItem[] {
  const vehicleDetails = config?.vehicleDetails;
  if (!vehicleDetails || Object.keys(vehicleDetails).length === 0) return items;

  return items.map((item) => {
    const override = getEditorOverrideForItem(item, vehicleDetails);
    if (!override) return item;
    return applyCatalogDetailsOverride(item, override);
  });
}

/** Fusiona configs priorizando vehicleDetails más completos (evita pisar sync reciente en bootstrap). */
export function mergeEditorConfigsPreferVehicleDetails(
  base: EditorConfig,
  incoming: EditorConfig,
): EditorConfig {
  const mergedDetails: Record<string, EditorVehicleDetails> = {
    ...(incoming.vehicleDetails ?? {}),
  };

  for (const [key, details] of Object.entries(base.vehicleDetails ?? {})) {
    mergedDetails[key] = pickRicherVehicleDetails(details, mergedDetails[key]) ?? details;
  }

  return {
    ...incoming,
    ...base,
    vehicleDetails: mergedDetails,
    sectionVehicleIds: {
      ...incoming.sectionVehicleIds,
      ...base.sectionVehicleIds,
    },
    vehicleUpcomingAuctionIds: {
      ...incoming.vehicleUpcomingAuctionIds,
      ...base.vehicleUpcomingAuctionIds,
    },
  };
}
