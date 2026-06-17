import { describe, expect, it } from "vitest";
import { finalizeMergedHiddenCategoryIds } from "@/lib/catalog-shared-merge";

describe("finalizeMergedHiddenCategoryIds", () => {
  it("preserva secciones base ocultas por el admin", () => {
    const hidden = new Set(["section:ventas-directas", "managed:cat-1"]);
    expect(finalizeMergedHiddenCategoryIds(hidden, new Set())).toEqual([
      "section:ventas-directas",
      "managed:cat-1",
    ]);
  });

  it("preserva secciones base visibles cuando no estan en hidden", () => {
    const hidden = new Set(["managed:cat-1"]);
    expect(finalizeMergedHiddenCategoryIds(hidden, new Set())).toEqual(["managed:cat-1"]);
  });

  it("elimina remates ocultos que ya no estan activos", () => {
    const hidden = new Set(["auction:old", "section:proximos-remates"]);
    expect(finalizeMergedHiddenCategoryIds(hidden, new Set(["auction:live"]))).toEqual([
      "section:proximos-remates",
    ]);
  });
});
