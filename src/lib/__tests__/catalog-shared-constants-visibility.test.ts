import { describe, expect, it } from "vitest";
import {
  applySharedRemateEstadoToHiddenCategories,
  DEFAULT_VENTA_DIRECTA_EVENT_ID,
} from "@/lib/catalog-shared-constants";

describe("applySharedRemateEstadoToHiddenCategories", () => {
  it("oculta remates cerrados y muestra remates abiertos", () => {
    const hidden = new Set<string>(["auction:remate-viejo"]);
    applySharedRemateEstadoToHiddenCategories(hidden, [
      { id: "remate-abierto", estado: "abierto" },
      { id: "remate-cerrado", estado: "cerrado" },
    ]);

    expect(hidden.has("auction:remate-abierto")).toBe(false);
    expect(hidden.has("auction:remate-cerrado")).toBe(true);
    expect(hidden.has("auction:remate-viejo")).toBe(true);
  });

  it("sincroniza venta directa cerrada con section:ventas-directas", () => {
    const hidden = new Set<string>();
    applySharedRemateEstadoToHiddenCategories(hidden, [
      { id: DEFAULT_VENTA_DIRECTA_EVENT_ID, estado: "cerrado" },
    ]);

    expect(hidden.has(`auction:${DEFAULT_VENTA_DIRECTA_EVENT_ID}`)).toBe(true);
    expect(hidden.has("section:ventas-directas")).toBe(true);
  });
});
