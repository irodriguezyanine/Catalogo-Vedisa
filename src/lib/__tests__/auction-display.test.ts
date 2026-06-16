import { describe, expect, it } from "vitest";
import { formatAuctionDaysUntilBadge, formatAuctionHumanSchedule } from "@/lib/auction-display";

describe("auction-display", () => {
  it("formatea fecha humana de remate", () => {
    const label = formatAuctionHumanSchedule({
      id: "a1",
      name: "Remate 1084",
      date: "2026-08-16",
      startAt: "2026-08-16T15:00:00.000Z",
      endAt: "2026-08-16T17:00:00.000Z",
    });
    expect(label.toLowerCase()).toContain("ago");
    expect(label).toContain("·");
  });

  it("calcula badge de días restantes", () => {
    const future = new Date();
    future.setDate(future.getDate() + 3);
    const badge = formatAuctionDaysUntilBadge(
      {
        id: "a1",
        name: "Remate",
        date: future.toISOString(),
        startAt: future.toISOString(),
      },
      Date.now(),
    );
    expect(badge).toMatch(/En \d+ días|En 1 día|Hoy/);
  });
});
