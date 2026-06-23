"use client";

import Link from "next/link";
import type { CatalogItem } from "@/types/catalog";
import type { UpcomingAuction } from "@/types/editor";
import { formatAuctionDaysUntilBadge, formatAuctionHumanSchedule } from "@/lib/auction-display";
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
    subtitle: "Remates sincronizados desde Tasaciones y Subastas Vedisa.",
  },
  venta_directa: {
    sectionId: "ventas-directas",
    kicker: "",
    title: "Ventas directas",
    subtitle: "Compra directa, sin esperar remate · Retiro ágil desde nuestra bodega en Pudahuel.",
  },
};

type UpcomingAuctionsSectionProps = {
  variant: UpcomingAuctionsSectionVariant;
  groups: Array<{ auction: UpcomingAuction; items: CatalogItem[] }>;
  renderCards: (auction: UpcomingAuction, items: CatalogItem[], sectionKey: string) => React.ReactNode;
};

export function VentaDirectaEmptyHomeState() {
  return (
    <section id="ventas-directas" className="section-shell home-section-enter scroll-mt-24">
      <header className="mb-4">
        <h2 className="text-2xl font-bold text-slate-900 md:text-3xl">Ventas directas</h2>
      </header>
      <div className="rounded-2xl border border-dashed border-cyan-200 bg-cyan-50/40 px-5 py-8 text-center">
        <p className="text-sm font-medium text-slate-800">
          Los vehículos en venta directa aparecerán aquí en cuanto estén vinculados al catálogo.
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
          Los vehículos del remate aparecerán aquí en cuanto estén vinculados al catálogo.
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
}: {
  auction: UpcomingAuction;
  items: CatalogItem[];
  variant: UpcomingAuctionsSectionVariant;
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
    <div className="overflow-hidden rounded-2xl border border-cyan-200/80 bg-gradient-to-br from-cyan-50 via-white to-slate-50 shadow-md">
      <div className="grid gap-4 p-4 md:grid-cols-[1.2fr_auto] md:items-center md:p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold text-slate-900 md:text-xl">{auction.name}</h3>
            {daysBadge ? (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-950">
                {daysBadge}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm font-semibold text-cyan-800">{scheduleLabel}</p>
          <p className="mt-1 text-sm text-slate-700">
            {items.length} vehículo{items.length === 1 ? "" : "s"} disponible{items.length === 1 ? "" : "s"}
          </p>
          {variant === "remate" ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={listadoHref} className="ui-focus premium-btn-primary inline-flex min-h-11 items-center px-5">
                {listadoLabel}
              </Link>
              <a
                href={REMATE_WEB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="ui-focus premium-btn-secondary inline-flex min-h-11 items-center px-5"
              >
                Ir a remate web
              </a>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={listadoHref} className="ui-focus premium-btn-primary inline-flex min-h-11 items-center px-5">
                {listadoLabel}
              </Link>
            </div>
          )}
        </div>
        {previewItems.length > 0 ? (
          <div className="flex gap-2 md:justify-end">
            {previewItems.map((item) => (
              <div
                key={`preview-${auction.id}-${item.id}`}
                className="h-20 w-28 overflow-hidden rounded-xl border border-white/80 shadow-sm md:h-24 md:w-32"
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

export function UpcomingAuctionsSection({
  variant,
  groups,
  renderCards,
}: UpcomingAuctionsSectionProps) {
  if (groups.length === 0) return null;
  const copy = SECTION_COPY[variant];

  return (
    <section id={copy.sectionId} className="section-shell home-section-enter scroll-mt-24">
      <header className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {copy.kicker ? <p className="premium-kicker">{copy.kicker}</p> : null}
          <h2 className="text-2xl font-bold text-slate-900 md:text-3xl">{copy.title}</h2>
          <p className="mt-1 text-sm text-slate-700">{copy.subtitle}</p>
        </div>
      </header>
      <div className="space-y-8">
        {groups.map(({ auction, items }) => (
          <div key={auction.id}>
            <div className="mb-4">
              <AuctionEventHero
                auction={auction}
                items={items}
                variant={variant}
              />
            </div>
            <div id={`${copy.sectionId}-${auction.id}-listado`} className="scroll-mt-24">
              {renderCards(auction, items, `${copy.sectionId}-${auction.id}`)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
