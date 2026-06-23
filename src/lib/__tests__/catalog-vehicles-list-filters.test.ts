import { describe, expect, it } from "vitest";
import {
  getFilterableAuctionGroups,
  matchesVehicleListCommercialFilter,
} from "@/lib/catalog-public-inventory";
import type { CatalogItem } from "@/types/catalog";
import type { EditorConfig } from "@/types/editor";

const remateId = "11111111-1111-4111-8111-111111111111";
const vdId = "6f4a7e7a-0c83-4e0a-8a7e-9d60f6797f11";

const config = {
  upcomingAuctions: [
    { id: remateId, name: "REMATE 1085", date: "2026-06-23", eventType: "remate" },
    { id: vdId, name: "Venta Directa - Catálogo", date: "2026-06-23", eventType: "venta_directa" },
  ],
  vehicleUpcomingAuctionIds: {
    ABC123: remateId,
    XYZ789: vdId,
  },
} as EditorConfig;

function itemForKey(key: string): CatalogItem {
  return {
    id: key,
    title: `Vehículo ${key}`,
    images: [],
    raw: { patente: key },
  };
}

describe("catalog vehicles list filters", () => {
  it("agrupa remates y ventas directas para los selectores", () => {
    const groups = getFilterableAuctionGroups(config);
    expect(groups.remates.map((auction) => auction.id)).toEqual([remateId]);
    expect(groups.ventasDirectas.map((auction) => auction.id)).toEqual([vdId]);
  });

  it("filtra por evento específico desde la URL", () => {
    expect(
      matchesVehicleListCommercialFilter(itemForKey("ABC123"), config, {
        tipo: "all",
        eventoId: remateId,
      }),
    ).toBe(true);
    expect(
      matchesVehicleListCommercialFilter(itemForKey("XYZ789"), config, {
        tipo: "all",
        eventoId: remateId,
      }),
    ).toBe(false);
  });

  it("filtra por tipo comercial", () => {
    expect(
      matchesVehicleListCommercialFilter(itemForKey("XYZ789"), config, {
        tipo: "venta_directa",
        eventoId: null,
      }),
    ).toBe(true);
    expect(
      matchesVehicleListCommercialFilter(itemForKey("ABC123"), config, {
        tipo: "venta_directa",
        eventoId: null,
      }),
    ).toBe(false);
  });
});
