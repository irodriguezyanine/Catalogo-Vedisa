import { describe, expect, it } from "vitest";
import type { CatalogItem } from "@/types/catalog";
import {
  formatVehicleCardImageAlt,
  formatVehicleCardSpecsLine,
  formatVehicleCardSubtitle,
  formatVehicleCardTitle,
  toSentenceCase,
} from "@/lib/vehicle-card-display";

const sampleItem: CatalogItem = {
  id: "1",
  title: "VEDISA Remates - HYUNDAI SANTA FE - VEDISA Remates - HYUNDAI SANTA FE",
  subtitle: "DIESEL, TOP DE LINEA, UNICO DUEÑO",
  status: "Disponible",
  location: "Pudahuel",
  auctionDate: "",
  images: [],
  thumbnail: "",
  raw: {
    marca: "Hyundai",
    modelo: "Santa Fe",
    ano: "2019",
    kilometraje: "85000",
    combustible: "Diesel",
  },
};

describe("vehicle-card-display", () => {
  it("acorta títulos repetidos de Vedisa", () => {
    expect(formatVehicleCardTitle(sampleItem)).toBe("Hyundai Santa Fe 2019");
  });

  it("arma línea de specs", () => {
    expect(formatVehicleCardSpecsLine(sampleItem)).toBe("2019 · 85.000 km · Diesel");
  });

  it("normaliza subtítulos en mayúsculas", () => {
    expect(formatVehicleCardSubtitle(sampleItem.subtitle)).toContain("Diesel");
    expect(formatVehicleCardSubtitle(sampleItem.subtitle)).not.toBe(sampleItem.subtitle);
  });

  it("genera alt descriptivo", () => {
    expect(formatVehicleCardImageAlt(sampleItem)).toContain("Hyundai Santa Fe 2019");
    expect(formatVehicleCardImageAlt(sampleItem)).toContain("Vedisa Remates");
  });

  it("convierte frases en mayúsculas a sentence case", () => {
    expect(toSentenceCase("TEXTO DE PRUEBA")).toBe("Texto de prueba");
  });
});
