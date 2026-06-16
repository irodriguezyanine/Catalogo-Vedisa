import { describe, expect, it } from "vitest";
import { DEFAULT_EDITOR_CONFIG } from "@/types/editor";
import {
  applyExclusiveCommercialAssignment,
  enforceCommercialExclusivityInConfig,
  resolveVehicleCommercialLane,
} from "@/lib/commercial-category-exclusivity";

describe("commercial-category-exclusivity", () => {
  it("prioriza asignación a remate sobre venta directa manual", () => {
    const config = {
      ...DEFAULT_EDITOR_CONFIG,
      sectionVehicleIds: {
        ...DEFAULT_EDITOR_CONFIG.sectionVehicleIds,
        "proximos-remates": ["ABC123"],
        "ventas-directas": ["ABC123"],
      },
      vehicleUpcomingAuctionIds: { ABC123: "remate-1" },
      upcomingAuctions: [{ id: "remate-1", name: "Remate 1084", date: "2026-06-15", eventType: "remate" }],
    };

    expect(resolveVehicleCommercialLane("ABC123", config)).toBe("proximos-remates");
    const normalized = enforceCommercialExclusivityInConfig(config);
    expect(normalized.sectionVehicleIds["ventas-directas"]).not.toContain("ABC123");
    expect(normalized.sectionVehicleIds["proximos-remates"]).toContain("ABC123");
  });

  it("al asignar venta directa elimina remate previo", () => {
    const config = {
      ...DEFAULT_EDITOR_CONFIG,
      sectionVehicleIds: {
        ...DEFAULT_EDITOR_CONFIG.sectionVehicleIds,
        "proximos-remates": ["XYZ789"],
      },
      vehicleUpcomingAuctionIds: { XYZ789: "remate-1" },
      upcomingAuctions: [{ id: "remate-1", name: "Remate", date: "2026-06-15", eventType: "remate" }],
    };

    const next = applyExclusiveCommercialAssignment(
      config,
      ["XYZ789"],
      { lane: "ventas-directas" },
      config.upcomingAuctions,
    );

    expect(next.vehicleUpcomingAuctionIds.XYZ789).toBeUndefined();
    expect(next.sectionVehicleIds["proximos-remates"]).not.toContain("XYZ789");
    expect(next.sectionVehicleIds["ventas-directas"]).toContain("XYZ789");
  });
});
