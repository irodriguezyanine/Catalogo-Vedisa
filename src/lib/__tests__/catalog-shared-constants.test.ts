import { describe, expect, it } from "vitest";
import {
  collectDirectSaleVehicleKeys,
  DEFAULT_VENTA_DIRECTA_EVENT_ID,
  resolveCommercialEventType,
} from "@/lib/catalog-shared-constants";
import type { EditorConfig } from "@/types/editor";

const baseConfig: EditorConfig = {
  sectionVehicleIds: {
    "proximos-remates": [],
    "ventas-directas": ["RHCP68"],
    novedades: [],
    catalogo: [],
  },
  homeLayout: {
    heroTitle: "Catálogo",
    heroDescription: "",
    heroKicker: "",
    heroPrimaryCtaLabel: "Ver",
    heroPrimaryCtaHref: "#",
    heroSecondaryCtaLabel: "Info",
    heroSecondaryCtaHref: "#",
  },
  upcomingAuctions: [
    {
      id: DEFAULT_VENTA_DIRECTA_EVENT_ID,
      name: "Venta Directa - Catálogo",
      date: "2026-12-31",
      eventType: "venta_directa",
    },
  ],
  vehicleUpcomingAuctionIds: {
    ABC123: DEFAULT_VENTA_DIRECTA_EVENT_ID,
    REM001: "11111111-1111-4111-8111-111111111111",
  },
};

describe("collectDirectSaleVehicleKeys", () => {
  it("incluye sectionVehicleIds y asignaciones a eventos venta_directa", () => {
    const keys = collectDirectSaleVehicleKeys(baseConfig);
    expect(keys.has("RHCP68")).toBe(true);
    expect(keys.has("ABC123")).toBe(true);
    expect(keys.has("REM001")).toBe(false);
  });
});

describe("resolveCommercialEventType", () => {
  it("detecta venta directa por nombre", () => {
    expect(resolveCommercialEventType({ name: "Venta Directa Q2" })).toBe("venta_directa");
    expect(resolveCommercialEventType({ name: "Remate 1084", eventType: "remate" })).toBe("remate");
  });
});
