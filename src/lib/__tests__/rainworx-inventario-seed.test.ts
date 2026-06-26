import { describe, expect, it } from "vitest";
import {
  editorDetailsToInventarioSeed,
  inventarioSeedHasUsableIdentity,
} from "@/lib/rainworx-inventario-seed";

describe("rainworx-inventario-seed", () => {
  it("convierte ficha editor a seed de inventario", () => {
    const seed = editorDetailsToInventarioSeed("PJSV99", {
      brand: "TOYOTA",
      model: "COROLLA",
      year: "2018",
      imagesCsv: "https://cdn.example/a.jpg, https://cdn.example/b.jpg",
      title: "TOYOTA COROLLA 2018",
    });
    expect(seed.patente).toBe("PJSV99");
    expect(seed.marca).toBe("TOYOTA");
    expect(seed.modelo).toBe("COROLLA");
    expect(seed.imagenes).toEqual(["https://cdn.example/a.jpg", "https://cdn.example/b.jpg"]);
    expect(inventarioSeedHasUsableIdentity(seed, "PJSV99")).toBe(true);
  });

  it("rechaza seed sin identidad ni fotos", () => {
    expect(inventarioSeedHasUsableIdentity({ patente: "ABCD12" }, "ABCD12")).toBe(false);
  });

  it("acepta seed solo con fotos Rainworx", () => {
    const seed = {
      patente: "SDZX79",
      imagenes: ["https://cdn.example/x.jpg"],
    };
    expect(inventarioSeedHasUsableIdentity(seed, "SDZX79")).toBe(true);
  });
});
