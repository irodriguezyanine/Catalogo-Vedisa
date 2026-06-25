import { describe, expect, it } from "vitest";
import { hydrateCatalogItemsWithEditorConfig } from "@/lib/catalog-feed-hydrate";
import type { CatalogItem } from "@/types/catalog";
import type { EditorConfig } from "@/types/editor";
import { DEFAULT_EDITOR_CONFIG } from "@/types/editor";

const baseItem: CatalogItem = {
  id: "GXLB21",
  title: "Sin modelo",
  subtitle: "",
  status: "",
  location: "",
  lot: "",
  auctionDate: "",
  thumbnail: undefined,
  images: [],
  view3dUrl: undefined,
  raw: { patente: "GXLB21", marca: "SSANGYONG", modelo: "KORANDO" },
};

describe("hydrateCatalogItemsWithEditorConfig", () => {
  it("aplica miniatura Glo3D persistida tras F5", () => {
    const glo3dThumb = "https://firebasestorage.googleapis.com/v0/b/glo3d/example.jpg";
    const config: EditorConfig = {
      ...DEFAULT_EDITOR_CONFIG,
      vehicleDetails: {
        GXLB21: {
          title: "SSANGYONG KORANDO 2015",
          patente: "GXLB21",
          brand: "SSANGYONG",
          model: "KORANDO",
          year: "2015",
          thumbnail: glo3dThumb,
          view3dUrl: "https://glo3d.net/embed/abc123",
        },
      },
    };

    const [hydrated] = hydrateCatalogItemsWithEditorConfig([baseItem], config);
    expect(hydrated?.thumbnail).toBe(glo3dThumb);
    expect(hydrated?.title).toContain("KORANDO");
  });
});
