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

  it("no duplica por nombre de archivo aunque la URL sea distinta", () => {
    const tasaciones: LotDocumentLink[] = [
      { url: "https://supabase.co/doc.pdf", label: "LDYS.30 OK RTE 1083.pdf" },
    ];
    const editor: LotDocumentLink[] = [
      { url: "https://res.cloudinary.com/doc.pdf", label: "LDYS.30 OK RTE 1083.pdf" },
      { url: "https://res.cloudinary.com/otro.pdf", label: "Otro.pdf" },
    ];
    expect(mergeLotDocumentLinks(tasaciones, editor)).toEqual([
      { url: "https://supabase.co/doc.pdf", label: "LDYS.30 OK RTE 1083.pdf" },
      { url: "https://res.cloudinary.com/otro.pdf", label: "Otro.pdf" },
    ]);
  });

  it("ignora query strings al comparar URLs", () => {
    const a: LotDocumentLink[] = [{ url: "https://a.com/1.pdf?v=1", label: "Doc A" }];
    const b: LotDocumentLink[] = [{ url: "https://a.com/1.pdf?v=2", label: "Doc B" }];
    expect(mergeLotDocumentLinks(a, b)).toHaveLength(1);
  });
});
