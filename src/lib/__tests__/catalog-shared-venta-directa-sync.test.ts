import { describe, expect, it } from "vitest";
import {
  DEFAULT_VENTA_DIRECTA_EVENT_ID,
  ensureDefaultVentaDirectaAuction,
  reconcileVisibleVentaDirectaAuctionsSectionVisibility,
} from "@/lib/catalog-shared-constants";
import type { UpcomingAuction } from "@/types/editor";

describe("ensureDefaultVentaDirectaAuction", () => {
  it("crea el catálogo compartido cuando Tasaciones tiene items aunque la sección esté vacía", () => {
    const byId = new Map<string, UpcomingAuction>();
    ensureDefaultVentaDirectaAuction(byId, new Set(), {
      sharedItemCount: 31,
      sharedRow: {
        descripcion: "Venta Directa - Catálogo",
        fecha_hora_inicio: "2026-05-14T14:56:00.000Z",
        fecha_hora_cierre: "2026-06-13T14:56:00.000Z",
      },
    });
    const auction = byId.get(DEFAULT_VENTA_DIRECTA_EVENT_ID);
    expect(auction?.eventType).toBe("venta_directa");
    expect(auction?.name).toContain("Venta Directa");
  });
});

describe("reconcileVisibleVentaDirectaAuctionsSectionVisibility", () => {
  it("desoculta ventas-directas cuando hay un subgrupo visible", () => {
    const hidden = reconcileVisibleVentaDirectaAuctionsSectionVisibility(
      ["section:ventas-directas"],
      [
        {
          id: DEFAULT_VENTA_DIRECTA_EVENT_ID,
          name: "Venta Directa - Catálogo",
          date: "2026-05-14",
          eventType: "venta_directa",
        },
      ],
    );
    expect(hidden).not.toContain("section:ventas-directas");
    expect(hidden).not.toContain(`auction:${DEFAULT_VENTA_DIRECTA_EVENT_ID}`);
  });
});
