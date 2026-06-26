import { describe, expect, it } from "vitest";
import {
  isInternalHomeCopy,
  PUBLIC_HOME_SECTION_SUBTITLES,
  resolvePublicHomeSectionSubtitle,
} from "@/lib/catalog-hero-copy";

describe("resolvePublicHomeSectionSubtitle", () => {
  it("reemplaza subtítulos con tecnicismos internos", () => {
    expect(
      resolvePublicHomeSectionSubtitle(
        "proximos-remates",
        "Remates sincronizados desde Tasaciones y Subastas Vedisa.",
      ),
    ).toBe(PUBLIC_HOME_SECTION_SUBTITLES["proximos-remates"]);
  });

  it("conserva subtítulos personalizados aptos para clientes", () => {
    const custom = "Grandes oportunidades en utilitarios y livianos.";
    expect(resolvePublicHomeSectionSubtitle("proximos-remates", custom)).toBe(custom);
  });

  it("detecta copy interno", () => {
    expect(isInternalHomeCopy("vinculados al catálogo")).toBe(true);
    expect(isInternalHomeCopy("Compra directa en Pudahuel")).toBe(false);
  });
});
