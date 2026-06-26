import { describe, expect, it } from "vitest";
import type { EditorConfig } from "@/types/editor";
import {
  assignPatentesToTargetAuction,
  collectPatentesAssignedToAuction,
  resolveVehicleKeysForAuctionPatente,
} from "@/lib/rainworx-auction-scope";

function baseConfig(): EditorConfig {
  return {
    sectionVehicleIds: {
      "proximos-remates": ["ABC123"],
      "ventas-directas": ["XYZ789"],
      novedades: [],
      catalogo: [],
    },
    vehicleUpcomingAuctionIds: {
      ABC123: "remate-a",
      XYZ789: "vd-b",
    },
    vehicleDetails: {
      ABC123: { patente: "ABC123", title: "Remate A" },
      XYZ789: { patente: "XYZ789", title: "Venta directa B" },
    },
    hiddenVehicleIds: [],
    hiddenCategoryIds: [],
    soldVehicleIds: [],
    soldVehicleHistory: [],
    vehiclePrices: {},
    upcomingAuctions: [
      { id: "remate-a", name: "Remate A", date: "2026-06-30", eventType: "remate" },
      { id: "vd-b", name: "VD B", date: "2026-06-30", eventType: "venta_directa" },
    ],
    managedCategories: [],
    manualPublications: [],
    homeLayout: {
      heroTitle: "",
      heroDescription: "",
      heroKicker: "",
      heroPrimaryCtaLabel: "",
      heroPrimaryCtaHref: "",
      heroSecondaryCtaLabel: "",
      heroSecondaryCtaHref: "",
      heroAlignment: "left",
      heroTheme: "cyan",
      heroMaxWidth: "xl",
      showHeroChips: true,
      showHeroCtas: true,
      showFeaturedStrip: true,
      showRecentPublications: true,
      showFavoritesSection: true,
      showHowToSection: true,
      showSearchBar: true,
    },
    sectionTexts: {
      "proximos-remates": { title: "", subtitle: "" },
      "ventas-directas": { title: "", subtitle: "" },
      novedades: { title: "", subtitle: "" },
      catalogo: { title: "", subtitle: "" },
    },
  };
}

describe("rainworx-auction-scope", () => {
  it("colecciona patentes solo del remate indicado", () => {
    const config = baseConfig();
    expect([...collectPatentesAssignedToAuction(config, "remate-a")]).toEqual(["ABC123"]);
    expect([...collectPatentesAssignedToAuction(config, "vd-b")]).toEqual(["XYZ789"]);
  });

  it("actualiza fichas solo en claves del remate target", () => {
    const config = baseConfig();
    const keys = resolveVehicleKeysForAuctionPatente(config, "remate-a", "ABC123");
    expect([...keys]).toEqual(["ABC123"]);
    expect([...resolveVehicleKeysForAuctionPatente(config, "remate-a", "XYZ789")]).toEqual(["XYZ789"]);
  });

  it("asigna patentes nuevas al remate sin tocar otras patentes del otro evento", () => {
    const config = baseConfig();
    const next = assignPatentesToTargetAuction(config, ["NEW111"], {
      lane: "proximos-remates",
      auctionId: "remate-a",
    });
    expect(next.vehicleUpcomingAuctionIds.NEW111).toBe("remate-a");
    expect(next.vehicleUpcomingAuctionIds.XYZ789).toBe("vd-b");
    expect(next.sectionVehicleIds["ventas-directas"]).toContain("XYZ789");
  });
});
