import {
  DEFAULT_VENTA_DIRECTA_EVENT_ID,
  resolveCommercialEventType,
} from "@/lib/catalog-shared-constants";
import type { EditorConfig } from "@/types/editor";

export type CatalogSharedSyncStatus = {
  checkedAt: string;
  remateAuctions: number;
  ventaDirectaAuctions: number;
  ventaDirectaCatalog: {
    id: string;
    present: boolean;
    vehicleCount: number;
    visible: boolean;
    eventType: string | null;
  };
  assignedVehicles: number;
  ventasDirectasSectionCount: number;
  proximosRematesSectionCount: number;
};

export function buildCatalogSharedSyncStatus(config: EditorConfig): CatalogSharedSyncStatus {
  const hidden = new Set(config.hiddenCategoryIds ?? []);
  const upcoming = config.upcomingAuctions ?? [];
  const remateAuctions = upcoming.filter(
    (auction) => resolveCommercialEventType(auction) === "remate",
  ).length;
  const ventaDirectaAuctions = upcoming.filter(
    (auction) => resolveCommercialEventType(auction) === "venta_directa",
  ).length;
  const catalogAuction = upcoming.find((auction) => auction.id === DEFAULT_VENTA_DIRECTA_EVENT_ID);
  const vehicleCount = Object.values(config.vehicleUpcomingAuctionIds ?? {}).filter(
    (auctionId) => auctionId === DEFAULT_VENTA_DIRECTA_EVENT_ID,
  ).length;

  return {
    checkedAt: new Date().toISOString(),
    remateAuctions,
    ventaDirectaAuctions,
    ventaDirectaCatalog: {
      id: DEFAULT_VENTA_DIRECTA_EVENT_ID,
      present: Boolean(catalogAuction),
      vehicleCount,
      visible:
        Boolean(catalogAuction) &&
        !hidden.has(`auction:${DEFAULT_VENTA_DIRECTA_EVENT_ID}`) &&
        !hidden.has("section:ventas-directas"),
      eventType: catalogAuction?.eventType ?? null,
    },
    assignedVehicles: Object.keys(config.vehicleUpcomingAuctionIds ?? {}).length,
    ventasDirectasSectionCount: config.sectionVehicleIds?.["ventas-directas"]?.length ?? 0,
    proximosRematesSectionCount: config.sectionVehicleIds?.["proximos-remates"]?.length ?? 0,
  };
}
