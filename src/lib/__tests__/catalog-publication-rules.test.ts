import { describe, expect, it } from "vitest";
import type { CatalogItem } from "@/types/catalog";
import type { EditorConfig } from "@/types/editor";
import { isCatalogPublishedVehicle } from "@/lib/catalog-publication-rules";

const baseConfig: EditorConfig = {
  sectionVehicleIds: {
    "proximos-remates": [],
    "ventas-directas": [],
    novedades: [],
    catalogo: [],
  },
  sectionTexts: {},
  homeLayout: {
    heroTitle: "",
    heroDescription: "",
    heroKicker: "",
    heroPrimaryCtaLabel: "",
    heroPrimaryCtaHref: "",
    heroSecondaryCtaLabel: "",
    heroSecondaryCtaHref: "",
  },
  vehiclePrices: {},
  vehicleDetails: {},
  vehicleUpcomingAuctionIds: {},
  upcomingAuctions: [],
  hiddenCategoryIds: [],
  soldVehicleIds: [],
  hiddenVehicleIds: [],
  managedCategories: [],
  manualPublications: [],
};

function itemWithEstado(estado: string, patente = "RHCP68"): CatalogItem {
  return {
    id: patente,
    title: "LEXUS UX200",
    raw: { patente, estado_retiro: estado },
  } as CatalogItem;
}

describe("isCatalogPublishedVehicle", () => {
  it("no publica en_bodega_a_remate sin asignación activa", () => {
    const item = itemWithEstado("en_bodega_a_remate");
    expect(isCatalogPublishedVehicle(item, baseConfig)).toBe(false);
  });

  it("publica en_bodega_a_remate con asignación a remate", () => {
    const config = {
      ...baseConfig,
      vehicleUpcomingAuctionIds: { RHCP68: "remate-1085" },
    };
    const item = itemWithEstado("en_bodega_a_remate");
    expect(isCatalogPublishedVehicle(item, config)).toBe(true);
  });

  it("no publica en_bodega_a_venta_directa sin asignación activa", () => {
    const item = itemWithEstado("en_bodega_a_venta_directa", "ABCD12");
    expect(isCatalogPublishedVehicle(item, baseConfig)).toBe(false);
  });

  it("publica en_bodega_a_venta_directa con asignación a venta directa", () => {
    const config = {
      ...baseConfig,
      vehicleUpcomingAuctionIds: { ABCD12: "6f4a7e7a-0c83-4e0a-8a7e-9d60f6797f11" },
    };
    const item = itemWithEstado("en_bodega_a_venta_directa", "ABCD12");
    expect(isCatalogPublishedVehicle(item, config)).toBe(true);
  });
});
