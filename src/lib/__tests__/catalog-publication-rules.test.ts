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

  it("sigue publicando venta directa por estado de inventario", () => {
    const item = itemWithEstado("en_bodega_a_venta_directa", "ABCD12");
    expect(isCatalogPublishedVehicle(item, baseConfig)).toBe(true);
  });
});
