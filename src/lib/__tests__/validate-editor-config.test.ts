import { describe, expect, it } from "vitest";
import { validateEditorConfigPayload } from "@/lib/validate-editor-config";

describe("validateEditorConfigPayload", () => {
  it("rechaza payloads vacíos o no objeto", () => {
    expect(validateEditorConfigPayload(null)).toEqual({
      ok: false,
      error: "Configuración inválida.",
    });
    expect(validateEditorConfigPayload([])).toEqual({
      ok: false,
      error: "Configuración inválida.",
    });
  });

  it("requiere sectionVehicleIds y homeLayout", () => {
    expect(validateEditorConfigPayload({})).toEqual({
      ok: false,
      error: "Falta sectionVehicleIds en la configuración.",
    });
    expect(
      validateEditorConfigPayload({
        sectionVehicleIds: {},
      }),
    ).toEqual({
      ok: false,
      error: "Falta homeLayout en la configuración.",
    });
  });

  it("acepta configuración mínima válida", () => {
    expect(
      validateEditorConfigPayload({
        sectionVehicleIds: {},
        homeLayout: { heroTitle: "Catálogo" },
      }),
    ).toEqual({ ok: true });
  });
});
