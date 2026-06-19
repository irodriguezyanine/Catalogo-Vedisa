import { describe, expect, it } from "vitest";
import {
  applySharedRemateEstadoToHiddenCategories,
  collectDirectSaleVehicleKeys,
  DEFAULT_VENTA_DIRECTA_EVENT_ID,
  preserveEditorBaseSectionVisibility,
  reconcileVisibleRemateAuctionsSectionVisibility,
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

describe("applySharedRemateEstadoToHiddenCategories", () => {
  it("no fuerza ocultar ventas directas del catalogo desde remates compartidos", () => {
    const hidden = new Set(["section:ventas-directas", `auction:${DEFAULT_VENTA_DIRECTA_EVENT_ID}`]);
    applySharedRemateEstadoToHiddenCategories(hidden, [
      { id: DEFAULT_VENTA_DIRECTA_EVENT_ID, estado: "cerrado" },
    ]);
    expect(hidden.has("section:ventas-directas")).toBe(true);
    expect(hidden.has(`auction:${DEFAULT_VENTA_DIRECTA_EVENT_ID}`)).toBe(true);
  });

  it("activa ventas directas en el catalogo cuando Tasaciones marca abierto", () => {
    const hidden = new Set(["section:ventas-directas", `auction:${DEFAULT_VENTA_DIRECTA_EVENT_ID}`]);
    applySharedRemateEstadoToHiddenCategories(hidden, [
      { id: DEFAULT_VENTA_DIRECTA_EVENT_ID, estado: "abierto" },
    ]);
    expect(hidden.has("section:ventas-directas")).toBe(false);
    expect(hidden.has(`auction:${DEFAULT_VENTA_DIRECTA_EVENT_ID}`)).toBe(false);
  });

  it("sincroniza visibilidad de remates externos solo cuando estan abiertos", () => {
    const hidden = new Set([
      "auction:11111111-1111-4111-8111-111111111111",
      "auction:22222222-2222-4222-8222-222222222222",
    ]);
    applySharedRemateEstadoToHiddenCategories(hidden, [
      { id: "11111111-1111-4111-8111-111111111111", estado: "cerrado" },
      { id: "22222222-2222-4222-8222-222222222222", estado: "abierto" },
    ]);
    expect(hidden.has("auction:11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(hidden.has("auction:22222222-2222-4222-8222-222222222222")).toBe(false);
  });

  it("no oculta remates externos cerrados desde supabase", () => {
    const hidden = new Set<string>();
    applySharedRemateEstadoToHiddenCategories(hidden, [
      { id: "11111111-1111-4111-8111-111111111111", estado: "cerrado" },
    ]);
    expect(hidden.size).toBe(0);
  });
});

describe("preserveEditorBaseSectionVisibility", () => {
  it("mantiene ventas directas visibles aunque el merge intente ocultarlas", () => {
    const editorConfig = { hiddenCategoryIds: [] } as EditorConfig;
    const mergedConfig = {
      hiddenCategoryIds: ["section:ventas-directas", `auction:${DEFAULT_VENTA_DIRECTA_EVENT_ID}`],
    } as EditorConfig;
    const result = preserveEditorBaseSectionVisibility(editorConfig, mergedConfig);
    expect(result.hiddenCategoryIds).toEqual([]);
  });

  it("mantiene ventas directas ocultas cuando el editor las oculto", () => {
    const editorConfig = {
      hiddenCategoryIds: ["section:ventas-directas", `auction:${DEFAULT_VENTA_DIRECTA_EVENT_ID}`],
    } as EditorConfig;
    const mergedConfig = { hiddenCategoryIds: [] } as EditorConfig;
    const result = preserveEditorBaseSectionVisibility(editorConfig, mergedConfig);
    expect(result.hiddenCategoryIds).toContain("section:ventas-directas");
    expect(result.hiddenCategoryIds).toContain(`auction:${DEFAULT_VENTA_DIRECTA_EVENT_ID}`);
  });
});

describe("reconcileVisibleRemateAuctionsSectionVisibility", () => {
  it("desoculta proximos-remates cuando hay un remate visible por subgrupo", () => {
    const hidden = reconcileVisibleRemateAuctionsSectionVisibility(
      ["section:proximos-remates", "section:novedades"],
      [{ id: "ad1430b8-9327-42d0-8233-28ce5f93a724", name: "REMATE 1085", date: "2026-06-23", eventType: "remate" }],
    );
    expect(hidden).not.toContain("section:proximos-remates");
    expect(hidden).toContain("section:novedades");
  });
});
