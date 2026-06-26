import { describe, expect, it } from "vitest";
import {
  isPatentLikePublicTitle,
  sanitizePublicVehicleTitle,
  stripPatentFromPublicText,
} from "@/lib/catalog-patent-visibility";

describe("catalog-patent-visibility", () => {
  it("oculta patente en subtítulo público", () => {
    expect(stripPatentFromPublicText("TJXK90", "TJXK90", false)).toBeUndefined();
    expect(stripPatentFromPublicText("TJXK90 · 2024", "TJXK90", false)).toBe("2024");
  });

  it("mantiene subtítulo cuando el visitante es admin", () => {
    expect(stripPatentFromPublicText("TJXK90 · 2024", "TJXK90", true)).toBe("TJXK90 · 2024");
  });

  it("reemplaza título que es solo la patente", () => {
    expect(isPatentLikePublicTitle("TJXK90", "TJXK90")).toBe(true);
    expect(
      sanitizePublicVehicleTitle("TJXK90", "TJXK90", false, "Nissan Kicks 2024"),
    ).toBe("Nissan Kicks 2024");
  });
});
