import { describe, expect, it } from "vitest";
import type { CatalogFeed } from "@/types/catalog";
import type { EditorConfig } from "@/types/editor";
import { getVisibleCatalogItems } from "@/lib/catalog-public-inventory";

const auctionId = "remate-test";

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
  vehiclePrices: { ABC123: "$1.000.000" },
  vehicleDetails: {
    ABC123: {
      patente: "ABC123",
      brand: "KIA",
      model: "RIO",
      title: "KIA RIO 2016",
      thumbnail: "https://example.com/a.jpg",
    },
    XYZ789: {
      patente: "XYZ789",
      brand: "MAZDA",
      model: "3",
      title: "MAZDA 3 2018",
    },
  },
  vehicleUpcomingAuctionIds: {
    ABC123: auctionId,
    XYZ789: auctionId,
  },
  upcomingAuctions: [{ id: auctionId, name: "Remate test", date: "2026-06-30", eventType: "remate" }],
  hiddenCategoryIds: [],
  soldVehicleIds: [],
  hiddenVehicleIds: [],
  managedCategories: [],
  manualPublications: [],
};

describe("getVisibleCatalogItems", () => {
  it("incluye patentes asignadas al remate aunque no estén en el feed", () => {
    const feed: CatalogFeed = {
      items: [
        {
          id: "ABC123",
          title: "KIA RIO",
          images: [],
          raw: { patente: "ABC123", estado_retiro: "en_bodega_a_remate" },
        },
      ],
      fetchedAt: new Date().toISOString(),
    };

    const visible = getVisibleCatalogItems(feed, baseConfig);
    const patentes = visible.map((item) => (item.raw as Record<string, string>).patente).sort();

    expect(patentes).toEqual(["ABC123", "XYZ789"]);
  });
});
