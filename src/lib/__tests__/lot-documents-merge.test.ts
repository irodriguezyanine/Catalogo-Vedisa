import { describe, expect, it } from "vitest";
import { mergeLotDocumentLinks, type LotDocumentLink } from "@/lib/lot-documents";

describe("mergeLotDocumentLinks", () => {
  it("une listas sin duplicar por URL", () => {
    const a: LotDocumentLink[] = [{ url: "https://a.com/1.pdf", label: "Uno" }];
    const b: LotDocumentLink[] = [
      { url: "https://a.com/1.pdf", label: "Duplicado" },
      { url: "https://b.com/2.pdf", label: "Dos" },
    ];
    expect(mergeLotDocumentLinks(a, b)).toEqual([
      { url: "https://a.com/1.pdf", label: "Uno" },
      { url: "https://b.com/2.pdf", label: "Dos" },
    ]);
  });
});
