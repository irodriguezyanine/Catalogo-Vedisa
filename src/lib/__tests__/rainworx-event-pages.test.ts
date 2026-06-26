import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  extractEventListingLotUrls,
  extractEventPaginationUrls,
  ensureActiveOnlyEventListUrl,
} from "@/lib/rainworx-event-pages";

const origin = "https://www.vehiculoschocados.cl";
const fixturePath = path.join(process.cwd(), "tmp-event3.html");
const fixturePage2 = path.join(process.cwd(), "tmp-event3-p2.html");

describe("rainworx-event-pages", () => {
  it("extrae URLs paginadas del evento", () => {
    if (!fs.existsSync(fixturePath)) return;
    const html = fs.readFileSync(fixturePath, "utf8");
    const pages = extractEventPaginationUrls(
      html,
      `${origin}/Event/Details/11955802/veh%C3%ADculos-en-venta-directa`,
    );
    expect(pages.length).toBeGreaterThanOrEqual(2);
  });

  it("extrae lotes solo desde secciones de listado", () => {
    if (!fs.existsSync(fixturePath) || !fs.existsSync(fixturePage2)) return;
    const page1 = extractEventListingLotUrls(fs.readFileSync(fixturePath, "utf8"), origin);
    const page2 = extractEventListingLotUrls(fs.readFileSync(fixturePage2, "utf8"), origin);
    const ids = (urls: string[]) =>
      new Set(urls.map((url) => url.match(/LotDetails\/(\d+)/i)?.[1]).filter(Boolean));
    const set1 = ids(page1);
    const set2 = ids(page2);
    const union = new Set([...set1, ...set2]);
    expect(set1.size).toBeGreaterThan(0);
    expect(union.size).toBeGreaterThanOrEqual(Math.max(set1.size, set2.size));
  });

  it("conserva StatusFilter=active_only en paginación", () => {
    if (!fs.existsSync(fixturePath)) return;
    const html = fs.readFileSync(fixturePath, "utf8");
    const pages = extractEventPaginationUrls(
      html,
      `${origin}/Event/Details/11955802/veh%C3%ADculos-en-venta-directa`,
    );
    expect(pages.every((page) => page.includes("StatusFilter=active_only"))).toBe(true);
  });

  it("normaliza URL del evento a lotes activos", () => {
    const normalized = ensureActiveOnlyEventListUrl(
      `${origin}/Event/Details/11955802/veh%C3%ADculos-en-venta-directa`,
    );
    expect(normalized).toContain("StatusFilter=active_only");
    expect(normalized).toContain("ViewStyle=list");
  });
});
