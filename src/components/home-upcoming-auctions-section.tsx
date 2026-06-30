"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { CatalogItem } from "@/types/catalog";
import type { UpcomingAuction } from "@/types/editor";
import { formatAuctionDaysUntilBadge, formatAuctionHumanSchedule } from "@/lib/auction-display";
import { PUBLIC_HOME_SECTION_SUBTITLES } from "@/lib/catalog-hero-copy";
import { resolveVehicleThumbnailSrc } from "@/lib/vehicle-sync-helpers";

type UpcomingAuctionsSectionVariant = "remate" | "venta_directa";

const SECTION_COPY: Record<
  UpcomingAuctionsSectionVariant,
  { sectionId: string; kicker: string; title: string; subtitle: string }
> = {
  remate: {
    sectionId: "proximos-remates",
    kicker: "Agenda de remates",
    title: "Próximos remates",
    subtitle: PUBLIC_HOME_SECTION_SUBTITLES["proximos-remates"],
  },
  venta_directa: {
    sectionId: "ventas-directas",
    kicker: "",
    title: "Ventas directas",
    subtitle: PUBLIC_HOME_SECTION_SUBTITLES["ventas-directas"],
  },
};

type UpcomingAuctionsSectionProps = {
  variant: UpcomingAuctionsSectionVariant;
  groups: Array<{ auction: UpcomingAuction; items: CatalogItem[] }>;
  renderCards: (auction: UpcomingAuction, items: CatalogItem[], sectionKey: string) => ReactNode;
};

export function VentaDirectaEmptyHomeState() {
  return (
    <section id="ventas-directas" className="section-shell home-section-enter scroll-mt-24">
      <header className="mb-4">
        <h2 className="text-2xl font-bold text-slate-900 md:text-3xl">Ventas directas</h2>
      </header>
      <div className="rounded-2xl border border-dashed border-cyan-200 bg-cyan-50/40 px-5 py-8 text-center">
        <p className="text-sm font-medium text-slate-800">
          Pronto publicaremos más vehículos en venta directa. Vuelve a visitarnos.
        </p>
      </div>
    </section>
  );
}

export function RematesEmptyHomeState() {
  return (
    <section id="proximos-remates" className="section-shell home-section-enter scroll-mt-24">
      <header className="mb-4">
        <p className="premium-kicker">Agenda de remates</p>
        <h2 className="text-2xl font-bold text-slate-900 md:text-3xl">Próximos remates</h2>
        <p className="mt-1 text-sm text-slate-700">
          Aún no hay lotes publicados para el próximo evento. Mientras tanto, revisa las unidades en venta directa.
        </p>
      </header>
      <div className="rounded-2xl border border-dashed border-cyan-200 bg-cyan-50/40 px-5 py-8 text-center">
        <p className="text-sm font-medium text-slate-800">
          Pronto publicaremos los vehículos de este remate. Mientras tanto, revisa las ventas directas.
        </p>
        <a href="#ventas-directas" className="ui-focus premium-btn-primary mt-4 inline-flex min-h-11 items-center px-5">
          Ver ventas directas disponibles
        </a>
      </div>
    </section>
  );
}

const REMATE_WEB_URL =
  process.env.NEXT_PUBLIC_RAINWORX_URL ?? "https://www.vehiculoschocados.cl";

function AuctionEventHero({
  auction,
  items,
  variant,
  compact = false,
}: {
  auction: UpcomingAuction;
  items: CatalogItem[];
  variant: UpcomingAuctionsSectionVariant;
  compact?: boolean;
}) {
  const scheduleLabel = formatAuctionHumanSchedule(auction);
  const daysBadge = formatAuctionDaysUntilBadge(auction);
  const previewItems = items.slice(0, 3);
  const listadoHref = `/vehiculos?evento=${encodeURIComponent(auction.id)}`;
  const listadoLabel =
    variant === "venta_directa"
      ? "Ver listado de vehículos en venta directa"
      : "Ver listado de vehículos en remate";

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-cyan-200/80 bg-gradient-to-br from-cyan-50 via-white to-slate-50 shadow-md ${
        compact ? "shadow-sm" : ""
      }`}
    >
      <div className={`grid gap-3 ${compact ? "p-3" : "gap-4 p-4 md:grid-cols-[1.2fr_auto] md:items-center md:p-5"}`}>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={`font-bold text-slate-900 ${compact ? "text-base leading-snug" : "text-lg md:text-xl"}`}>
              {auction.name}
            </h3>
            {daysBadge ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-950 md:px-2.5 md:py-1 md:text-xs">
                {daysBadge}
              </span>
            ) : null}
          </div>
          <p className={`mt-1 font-semibold text-cyan-800 ${compact ? "text-xs" : "text-sm"}`}>{scheduleLabel}</p>
          <p className={`mt-0.5 text-slate-700 ${compact ? "text-xs" : "text-sm"}`}>
            {items.length} vehículo{items.length === 1 ? "" : "s"} disponible{items.length === 1 ? "" : "s"}
          </p>
          {variant === "remate" ? (
            <div className={`flex flex-wrap gap-2 ${compact ? "mt-2.5" : "mt-4"}`}>
              <Link
                href={listadoHref}
                className={`ui-focus premium-btn-primary inline-flex items-center ${
                  compact ? "min-h-9 px-3 text-xs" : "min-h-11 px-5"
                }`}
              >
                {compact ? "Ver listado" : listadoLabel}
              </Link>
              <a
                href={REMATE_WEB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={`ui-focus premium-btn-secondary inline-flex items-center ${
                  compact ? "min-h-9 px-3 text-xs" : "min-h-11 px-5"
                }`}
              >
                Ir a remate web
              </a>
            </div>
          ) : (
            <div className={`flex flex-wrap gap-2 ${compact ? "mt-2.5" : "mt-4"}`}>
              <Link
                href={listadoHref}
                className={`ui-focus premium-btn-primary inline-flex items-center ${
                  compact ? "min-h-9 px-3 text-xs" : "min-h-11 px-5"
                }`}
              >
                {compact ? "Ver listado" : listadoLabel}
              </Link>
            </div>
          )}
        </div>
        {previewItems.length > 0 ? (
          <div className={`flex gap-1.5 md:justify-end ${compact ? "mt-1" : "gap-2"}`}>
            {previewItems.map((item) => (
              <div
                key={`preview-${auction.id}-${item.id}`}
                className={`overflow-hidden rounded-lg border border-white/80 shadow-sm md:rounded-xl ${
                  compact ? "h-14 w-[4.25rem] md:h-24 md:w-32" : "h-20 w-28 md:h-24 md:w-32"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolveVehicleThumbnailSrc(item)}
                  alt=""
                  aria-hidden="true"
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AuctionEventGroup({
  auction,
  items,
  variant,
  sectionKey,
  renderCards,
}: {
  auction: UpcomingAuction;
  items: CatalogItem[];
  variant: UpcomingAuctionsSectionVariant;
  sectionKey: string;
  renderCards: (auction: UpcomingAuction, items: CatalogItem[], sectionKey: string) => ReactNode;
}) {
  const [carouselExpanded, setCarouselExpanded] = useState(false);
  const listAnchorId = `${sectionKey}-${auction.id}-listado`;

  return (
    <div>
      <div className="mb-2 md:mb-4">
        <div className="md:hidden">
          <AuctionEventHero auction={auction} items={items} variant={variant} compact />
        </div>
        <div className="hidden md:block">
          <AuctionEventHero auction={auction} items={items} variant={variant} />
        </div>
        {items.length > 0 ? (
          <button
            type="button"
            onClick={() => setCarouselExpanded((prev) => !prev)}
            aria-expanded={carouselExpanded}
            aria-controls={listAnchorId}
            className="ui-focus mt-2 flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm md:hidden"
          >
            <span className="text-sm font-semibold text-slate-900">
              {carouselExpanded ? "Ocultar vehículos" : `Ver vehículos (${items.length})`}
            </span>
            <svg
              viewBox="0 0 20 20"
              fill="none"
              className={`h-4 w-4 shrink-0 text-slate-500 transition ${carouselExpanded ? "rotate-180" : ""}`}
              aria-hidden="true"
            >
              <path
                d="M5 7.5L10 12.5L15 7.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ) : null}
      </div>
      {items.length > 0 ? (
        <div
          id={listAnchorId}
          className={`scroll-mt-24 ${carouselExpanded ? "block" : "hidden"} md:block`}
        >
          {renderCards(auction, items, sectionKey)}
        </div>
      ) : null}
    </div>
  );
}

export function UpcomingAuctionsSection({
  variant,
  groups,
  renderCards,
}: UpcomingAuctionsSectionProps) {
  if (groups.length === 0) return null;
  const copy = SECTION_COPY[variant];

  return (
    <section id={copy.sectionId} className="section-shell home-section-enter scroll-mt-24">
      <header className="mb-3 flex flex-col gap-2 md:mb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {copy.kicker ? <p className="premium-kicker hidden md:block">{copy.kicker}</p> : null}
          <h2 className="text-xl font-bold text-slate-900 md:text-3xl">{copy.title}</h2>
          <p className="mt-1 hidden text-sm text-slate-700 md:block">{copy.subtitle}</p>
        </div>
      </header>
      <div className="space-y-4 md:space-y-8">
        {groups.map(({ auction, items }) => (
          <AuctionEventGroup
            key={auction.id}
            auction={auction}
            items={items}
            variant={variant}
            sectionKey={copy.sectionId}
            renderCards={renderCards}
          />
        ))}
      </div>
    </section>
  );
}
