import { describe, expect, it } from "vitest";
import {
  applyRemateIdMappingsToEditorConfig,
  resolveCanonicalRemateIdForSync,
} from "@/lib/catalog-shared-remate-id";
import type { EditorConfig } from "@/types/editor";

describe("resolveCanonicalRemateIdForSync", () => {
  const catalogDuplicateId = "11111111-1111-4111-8111-111111111111";
  const subastasCanonicalId = "22222222-2222-4222-8222-222222222222";

  it("prefiere el remate de Subastas/Tasaciones aunque el UUID del catálogo exista en la base", () => {
    const remates = [
      { id: catalogDuplicateId, numero_remate: "1085", descripcion: "REMATE 1085" },
      { id: subastasCanonicalId, numero_remate: "1085", descripcion: "REMATE 1085" },
    ];

    expect(
      resolveCanonicalRemateIdForSync(catalogDuplicateId, "REMATE 1085", remates),
    ).toBe(subastasCanonicalId);
  });

  it("matchea por numero_correlativo aunque numero_remate sea Remate #01085", () => {
    const remates = [
      {
        id: subastasCanonicalId,
        numero_remate: "Remate #01085",
        numero_correlativo: 1085,
        descripcion: "REMATE 1085",
      },
    ];

    expect(
      resolveCanonicalRemateIdForSync(catalogDuplicateId, "REMATE 1085", remates),
    ).toBe(subastasCanonicalId);
  });
});

describe("applyRemateIdMappingsToEditorConfig", () => {
  it("remapea asignaciones y deduplica remates", () => {
    const catalogId = "11111111-1111-4111-8111-111111111111";
    const canonicalId = "22222222-2222-4222-8222-222222222222";
    const config: EditorConfig = {
      sectionVehicleIds: { "proximos-remates": ["VHWC96"], "ventas-directas": [], novedades: [], catalogo: [] },
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
        { id: catalogId, name: "REMATE 1085", date: "2026-06-23" },
        { id: canonicalId, name: "REMATE 1085", date: "2026-06-23" },
      ],
      vehicleUpcomingAuctionIds: { VHWC96: catalogId },
      hiddenCategoryIds: [`auction:${catalogId}`],
    };

    const next = applyRemateIdMappingsToEditorConfig(config, { [catalogId]: canonicalId });

    expect(next.upcomingAuctions).toHaveLength(1);
    expect(next.upcomingAuctions?.[0]?.id).toBe(canonicalId);
    expect(next.vehicleUpcomingAuctionIds?.VHWC96).toBe(canonicalId);
    expect(next.hiddenCategoryIds).toEqual([`auction:${canonicalId}`]);
  });
});
