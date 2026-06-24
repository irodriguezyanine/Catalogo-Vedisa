import { describe, expect, it } from "vitest";
import {
  extractGlo3dImagesFromSources,
  normalizeCatalogImageUrl,
  pickImageUrlFromValue,
} from "@/lib/glo3d-images";

describe("glo3d-images", () => {
  it("normaliza URLs relativas de glo3d.net", () => {
    expect(normalizeCatalogImageUrl("/media/thumb.jpg")).toBe("https://glo3d.net/media/thumb.jpg");
    expect(normalizeCatalogImageUrl("//cdn.example.com/a.png")).toBe("https://cdn.example.com/a.png");
  });

  it("extrae thumbnail desde main_frame como objeto", () => {
    const images = extractGlo3dImagesFromSources({
      stock_number: "TSTZ49",
      main_frame: { url: "https://cdn.example.com/frame.jpg" },
      frames: [{ thumbnail: "https://cdn.example.com/frame-2.jpg" }],
    });
    expect(images).toContain("https://cdn.example.com/frame.jpg");
    expect(images).toContain("https://cdn.example.com/frame-2.jpg");
  });

  it("pickImageUrlFromValue lee objetos anidados", () => {
    expect(pickImageUrlFromValue({ thumb: "https://cdn.example.com/x.webp" })).toBe(
      "https://cdn.example.com/x.webp",
    );
  });
});
