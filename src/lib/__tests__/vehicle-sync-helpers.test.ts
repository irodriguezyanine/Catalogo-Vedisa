import { describe, expect, it } from "vitest";
import type { CatalogItem } from "@/types/catalog";
import type { EditorConfig } from "@/types/editor";
import { vehicleNeedsQuickSync } from "@/lib/vehicle-sync-helpers";

const baseItem: CatalogItem = {
  id: "1",
  title: "Toyota Corolla 2018",
  subtitle: "RHCP68",
  thumbnail: "",
  images: [],
  location: "Santiago",
  raw: { marca: "Toyota", modelo: "Corolla", ano: "2018" },
};

const baseConfig: EditorConfig = {
  sectionVehicleIds: {
    "proximos-remates": [],
    "ventas-directas": [],
    novedades: [],
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
  vehicleDetails: {},
};

describe("vehicleNeedsQuickSync", () => {
  it("detecta falta de miniatura", () => {
    expect(vehicleNeedsQuickSync(baseItem, "RHCP68", baseConfig)).toBe(true);
  });

  it("no requiere sync con miniatura real", () => {
    const item = { ...baseItem, thumbnail: "https://cdn.example.com/car.jpg" };
    expect(vehicleNeedsQuickSync(item, "RHCP68", baseConfig)).toBe(false);
  });

  it("omite publicaciones manuales", () => {
    expect(vehicleNeedsQuickSync(baseItem, "manual-abc", baseConfig)).toBe(false);
  });
});
