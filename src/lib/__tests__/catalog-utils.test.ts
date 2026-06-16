import { describe, expect, it } from "vitest";
import { normalizeGlo3dViewerInput } from "@/lib/glo3d-viewer-url";
import { normalizePatentToken } from "@/lib/catalog-keys";
import { sanitizeCatalogHtml } from "@/lib/sanitize-html";

describe("normalizePatentToken", () => {
  it("normaliza patente chilena", () => {
    expect(normalizePatentToken("rhcp-68")).toBe("RHCP68");
  });
});

describe("normalizeGlo3dViewerInput", () => {
  it("acepta URL corta Glo3D", () => {
    const url = normalizeGlo3dViewerInput("https://glo3d.net/mfj6unYG9I");
    expect(url).toContain("iframeNova/mfj6unYG9I");
  });

  it("extrae src de iframe", () => {
    const url = normalizeGlo3dViewerInput(
      '<iframe src="https://glo3d.net/iframeNova/abc123?foo=1"></iframe>',
    );
    expect(url).toBe("https://glo3d.net/iframeNova/abc123?foo=1");
  });
});

describe("sanitizeCatalogHtml", () => {
  it("elimina scripts", () => {
    expect(sanitizeCatalogHtml('<p>Hola</p><script>alert(1)</script>')).toBe("<p>Hola</p>");
  });
});
