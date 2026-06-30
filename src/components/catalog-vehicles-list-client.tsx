"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { shouldShowPatentsToViewer } from "@/lib/catalog-patent-visibility";
import { AdminAccessLink } from "@/components/admin/admin-access-link";
import { CollapsibleMobilePanel } from "@/components/collapsible-mobile-panel";
import { inferVehicleSiniestradoStatus } from "@/components/catalog-card";
import {
  buildCommercialEventByVehicleKey,
  formatPrice,
  getFilterableAuctionGroups,
  getPatent,
  getVehicleKey,
  getVisibleCatalogItems,
  matchesVehicleListCommercialFilter,
  matchesVehiclePriceBucket,
  resolveCommercialEventBadge,
  resolveVehicleBrand,
  resolveVehiclePriceAmount,
  resolveVehiclePriceRaw,
  type VehicleListCommercialFilter,
  type VehiclePriceBucket,
  type VehicleSiniestroFilter,
} from "@/lib/catalog-public-inventory";
import { mergeAnalyticsPayload } from "@/lib/analytics-context";
import { formatAuctionHumanSchedule } from "@/lib/auction-display";
import { resolveCommercialEventType } from "@/lib/catalog-shared-constants";
import type { CatalogFeed, CatalogItem } from "@/types/catalog";
import type { EditorConfig } from "@/types/editor";
import type { VehicleCommercialEventBadge } from "@/components/catalog-card";

type Props = {
  feed: CatalogFeed;
  initialConfig: EditorConfig;
};

const PAGE_SIZE = 24;

const REMATE_WEB_URL =
  process.env.NEXT_PUBLIC_RAINWORX_URL ?? "https://www.vehiculoschocados.cl";

const PRICE_FILTER_OPTIONS: Array<{ id: VehiclePriceBucket; label: string }> = [
  { id: "all", label: "Todos los precios" },
  { id: "under_2m", label: "Hasta $2M" },
  { id: "2m_5m", label: "$2M – $5M" },
  { id: "5m_10m", label: "$5M – $10M" },
  { id: "over_10m", label: "Más de $10M" },
];

const SINIESTRO_FILTER_OPTIONS: Array<{ id: VehicleSiniestroFilter; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "no_siniestrado", label: "No siniestrados" },
  { id: "siniestrado", label: "Siniestrados" },
];

function parseTipoFilter(value: string | null): VehicleListCommercialFilter {
  if (value === "remate" || value === "venta_directa") return value;
  return "all";
}

function buildVehiclesListHref(tipo: VehicleListCommercialFilter, eventoId: string | null): string {
  const params = new URLSearchParams();
  if (eventoId) {
    params.set("evento", eventoId);
  } else if (tipo !== "all") {
    params.set("tipo", tipo);
  }
  const query = params.toString();
  return query ? `/vehiculos?${query}` : "/vehiculos";
}

function isLikelyImageUrl(url?: string): boolean {
  if (!url || !url.startsWith("http")) return false;
  const normalized = url.toLowerCase();
  if (normalized.includes("glo3d.net/iframe") || normalized.includes("<iframe")) return false;
  if (/\.(jpg|jpeg|png|webp|gif|bmp|avif)(\?|$)/i.test(normalized)) return true;
  return /cdn\.|cloudfront|amazonaws|supabase|img|image|media/.test(normalized);
}

function shortText(value?: string, max = 140): string | undefined {
  if (!value) return undefined;
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function VehicleListTags({
  commercialBadge,
  item,
  compact = false,
}: {
  commercialBadge: VehicleCommercialEventBadge | null;
  item: CatalogItem;
  compact?: boolean;
}) {
  const tags: Array<{ label: string; className: string }> = [];

  if (commercialBadge?.kind === "venta_directa") {
    const siniestro = inferVehicleSiniestradoStatus(item);
    if (siniestro === "siniestrado") {
      tags.push({
        label: "Siniestrado",
        className: "bg-amber-100 text-amber-900",
      });
    } else if (siniestro === "no_siniestrado") {
      tags.push({
        label: "No siniestrado",
        className: "bg-emerald-100 text-emerald-800",
      });
    }
  } else if (commercialBadge?.kind === "remate" && !compact) {
    tags.push({
      label: "Remate",
      className: "bg-indigo-100 text-indigo-700",
    });
  }

  if (tags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span
          key={tag.label}
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tag.className}`}
        >
          {tag.label}
        </span>
      ))}
    </div>
  );
}

function VehicleListRow({
  item,
  commercialBadge,
  priceLabel,
  showPatents,
}: {
  item: CatalogItem;
  commercialBadge: VehicleCommercialEventBadge | null;
  priceLabel: string | null;
  showPatents: boolean;
}) {
  const key = getVehicleKey(item);
  const coverCandidate = item.thumbnail ?? item.images[0];
  const cover = isLikelyImageUrl(coverCandidate) ? coverCandidate : "/placeholder-car.svg";
  const detailHref = `/vehiculos/${encodeURIComponent(key)}`;

  return (
    <Link
      href={detailHref}
      className="ui-focus group block cursor-pointer rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm transition hover:border-cyan-300 hover:shadow-md md:grid md:grid-cols-[220px_minmax(0,1fr)_auto] md:items-center md:gap-4 md:p-4"
    >
      <div className="flex gap-3 md:contents">
        <div className="relative h-24 w-32 shrink-0 overflow-hidden rounded-xl bg-slate-100 md:h-36 md:w-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cover}
            alt={item.title}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            loading="lazy"
          />
          {item.view3dUrl ? (
            <span className="absolute left-1.5 top-1.5 rounded-full bg-cyan-500 px-1.5 py-0.5 text-[9px] font-semibold text-white">
              3D
            </span>
          ) : null}
        </div>

        <div className="min-w-0 flex-1 space-y-1.5 md:space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {showPatents ? (
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {getPatent(item)}
                </p>
              ) : null}
              <h2 className="line-clamp-2 text-base font-bold leading-snug text-slate-900 md:text-lg">
                {item.title}
              </h2>
            </div>
            <div className="shrink-0 text-right md:hidden">
              {priceLabel ? (
                <p className="text-sm font-bold text-cyan-700">{priceLabel}</p>
              ) : (
                <p className="text-xs text-slate-400">Sin precio</p>
              )}
            </div>
          </div>
          <VehicleListTags commercialBadge={commercialBadge} item={item} compact />
          <div className="hidden flex-wrap gap-x-3 text-xs text-slate-500 md:flex">
            {item.location ? <span>{shortText(item.location, 48)}</span> : null}
            <span>
              {item.images.length} foto{item.images.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-2 hidden items-center justify-end md:mt-0 md:flex md:flex-col md:items-end md:justify-center md:text-right">
        {priceLabel ? (
          <p className="text-lg font-bold text-cyan-700">{priceLabel}</p>
        ) : (
          <p className="text-sm font-medium text-slate-400">Precio no informado</p>
        )}
      </div>
    </Link>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`ui-focus shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
        active
          ? "border-cyan-500 bg-cyan-600 text-white"
          : "border-slate-300 bg-white text-slate-700 hover:border-cyan-300"
      }`}
    >
      {label}
    </button>
  );
}

export function CatalogVehiclesListClient({ feed, initialConfig }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showRemateHint, setShowRemateHint] = useState(false);
  const [brandFilter, setBrandFilter] = useState("all");
  const [priceFilter, setPriceFilter] = useState<VehiclePriceBucket>("all");
  const [siniestroFilter, setSiniestroFilter] = useState<VehicleSiniestroFilter>("all");
  const [tipoFilter, setTipoFilter] = useState<VehicleListCommercialFilter>(() =>
    parseTipoFilter(searchParams.get("tipo")),
  );
  const [eventoFilter, setEventoFilter] = useState<string | null>(() => searchParams.get("evento"));

  const isEventLocked = Boolean(eventoFilter);
  const auctionGroups = useMemo(() => getFilterableAuctionGroups(initialConfig), [initialConfig]);

  const auctionsById = useMemo(
    () => new Map((initialConfig.upcomingAuctions ?? []).map((auction) => [auction.id, auction] as const)),
    [initialConfig.upcomingAuctions],
  );

  const syncFiltersFromUrl = useCallback(() => {
    const eventoFromUrl = searchParams.get("evento");
    const tipoFromUrl = parseTipoFilter(searchParams.get("tipo"));
    setEventoFilter(eventoFromUrl);
    if (eventoFromUrl) {
      const auction = auctionsById.get(eventoFromUrl);
      if (auction) {
        setTipoFilter(resolveCommercialEventType(auction));
        return;
      }
    }
    setTipoFilter(tipoFromUrl);
  }, [auctionsById, searchParams]);

  useEffect(() => {
    syncFiltersFromUrl();
  }, [syncFiltersFromUrl]);

  const updateFilters = useCallback(
    (nextTipo: VehicleListCommercialFilter, nextEvento: string | null) => {
      setTipoFilter(nextTipo);
      setEventoFilter(nextEvento);
      router.replace(buildVehiclesListHref(nextTipo, nextEvento), { scroll: false });
    },
    [router],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/admin/session", { cache: "no-store" });
        const session = (await response.json()) as { loggedIn?: boolean };
        if (!cancelled) setIsAdmin(Boolean(session.loggedIn));
      } catch {
        if (!cancelled) setIsAdmin(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void fetch("/api/analytics/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "page_view_vehiculos",
        timestamp: new Date().toISOString(),
        payload: mergeAnalyticsPayload({ mode: "listado" }),
      }),
      keepalive: true,
    }).catch(() => undefined);
  }, []);

  const showPatents = shouldShowPatentsToViewer(isAdmin);

  const items = useMemo(
    () => getVisibleCatalogItems(feed, initialConfig),
    [feed, initialConfig],
  );

  const commercialBadges = useMemo(
    () => buildCommercialEventByVehicleKey(initialConfig),
    [initialConfig],
  );

  const eventScopedItems = useMemo(
    () =>
      items.filter((item) =>
        matchesVehicleListCommercialFilter(item, initialConfig, {
          tipo: tipoFilter,
          eventoId: eventoFilter,
        }),
      ),
    [items, initialConfig, tipoFilter, eventoFilter],
  );

  const brandOptions = useMemo(() => {
    const brands = new Set<string>();
    for (const item of eventScopedItems) {
      const brand = resolveVehicleBrand(item);
      if (brand) brands.add(brand);
    }
    return [...brands].sort((a, b) => a.localeCompare(b, "es"));
  }, [eventScopedItems]);

  const filteredItems = useMemo(() => {
    let next = eventScopedItems;

    if (brandFilter !== "all") {
      next = next.filter((item) => resolveVehicleBrand(item) === brandFilter);
    }

    if (priceFilter !== "all") {
      next = next.filter((item) =>
        matchesVehiclePriceBucket(
          resolveVehiclePriceAmount(item, initialConfig.vehiclePrices),
          priceFilter,
        ),
      );
    }

    if (siniestroFilter !== "all") {
      next = next.filter((item) => {
        const status = inferVehicleSiniestradoStatus(item);
        return siniestroFilter === "siniestrado"
          ? status === "siniestrado"
          : status === "no_siniestrado";
      });
    }

    const query = searchTerm.trim().toLowerCase();
    if (!query) return next;

    return next.filter((item) => {
      const raw = item.raw as Record<string, unknown>;
      const haystack = [
        item.title,
        item.subtitle,
        ...(showPatents ? [getPatent(item)] : []),
        resolveVehicleBrand(item),
        raw.modelo,
        raw.descripcion,
      ]
        .filter((value) => typeof value === "string")
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [
    eventScopedItems,
    brandFilter,
    priceFilter,
    siniestroFilter,
    searchTerm,
    showPatents,
    initialConfig.vehiclePrices,
  ]);

  const activeAuction = useMemo(() => {
    if (!eventoFilter) return null;
    return auctionsById.get(eventoFilter) ?? null;
  }, [auctionsById, eventoFilter]);

  const showRemateParticipationHint = Boolean(
    activeAuction && resolveCommercialEventType(activeAuction) === "remate",
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchTerm.trim()) count += 1;
    if (brandFilter !== "all") count += 1;
    if (priceFilter !== "all") count += 1;
    if (siniestroFilter !== "all") count += 1;
    if (!isEventLocked && (tipoFilter !== "all" || eventoFilter)) count += 1;
    return count;
  }, [searchTerm, brandFilter, priceFilter, siniestroFilter, isEventLocked, tipoFilter, eventoFilter]);

  const clearFilters = useCallback(() => {
    setSearchTerm("");
    setBrandFilter("all");
    setPriceFilter("all");
    setSiniestroFilter("all");
  }, []);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, tipoFilter, eventoFilter, brandFilter, priceFilter, siniestroFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pagedItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredItems.slice(start, start + PAGE_SIZE);
  }, [filteredItems, page]);

  const eventScheduleLabel = activeAuction ? formatAuctionHumanSchedule(activeAuction) : null;

  const filtersPanel = (
    <div className="space-y-3 p-3 md:p-0">
      <div className="relative hidden md:block">
        <svg
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        >
          <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="8.75" cy="8.75" r="5.75" stroke="currentColor" strokeWidth="1.8" />
        </svg>
        <input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder={showPatents ? "Marca, modelo o patente…" : "Marca o modelo…"}
          className="ui-focus w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-800"
          aria-label="Buscar vehículos"
        />
      </div>

      {brandOptions.length > 0 ? (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Marca</p>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <FilterChip active={brandFilter === "all"} label="Todas" onClick={() => setBrandFilter("all")} />
            {brandOptions.map((brand) => (
              <FilterChip
                key={brand}
                active={brandFilter === brand}
                label={brand}
                onClick={() => setBrandFilter(brand)}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Precio</p>
        <div className="flex flex-wrap gap-1.5">
          {PRICE_FILTER_OPTIONS.map((option) => (
            <FilterChip
              key={option.id}
              active={priceFilter === option.id}
              label={option.label}
              onClick={() => setPriceFilter(option.id)}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Siniestro</p>
        <div className="flex flex-wrap gap-1.5">
          {SINIESTRO_FILTER_OPTIONS.map((option) => (
            <FilterChip
              key={option.id}
              active={siniestroFilter === option.id}
              label={option.label}
              onClick={() => setSiniestroFilter(option.id)}
            />
          ))}
        </div>
      </div>

      {!isEventLocked ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Tipo</span>
            <select
              value={tipoFilter}
              onChange={(event) => {
                const nextTipo = parseTipoFilter(event.target.value);
                updateFilters(nextTipo, null);
              }}
              className="ui-focus w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="all">Todos</option>
              <option value="remate">Remates</option>
              <option value="venta_directa">Ventas directas</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Evento</span>
            <select
              value={eventoFilter ?? ""}
              onChange={(event) => {
                const nextEvento = event.target.value || null;
                if (!nextEvento) {
                  updateFilters(tipoFilter, null);
                  return;
                }
                const auction = auctionsById.get(nextEvento);
                const inferredTipo: VehicleListCommercialFilter = auction
                  ? resolveCommercialEventType(auction)
                  : tipoFilter;
                updateFilters(inferredTipo, nextEvento);
              }}
              className="ui-focus w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Todos</option>
              {auctionGroups.remates.length > 0 ? (
                <optgroup label="Remates">
                  {auctionGroups.remates.map((auction) => (
                    <option key={auction.id} value={auction.id}>
                      {auction.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {auctionGroups.ventasDirectas.length > 0 ? (
                <optgroup label="Ventas directas">
                  {auctionGroups.ventasDirectas.map((auction) => (
                    <option key={auction.id} value={auction.id}>
                      {auction.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </label>
        </div>
      ) : null}

      {activeFilterCount > 0 ? (
        <button
          type="button"
          onClick={clearFilters}
          className="ui-focus text-xs font-semibold text-cyan-700 underline underline-offset-2"
        >
          Limpiar filtros
        </button>
      ) : null}
    </div>
  );

  return (
    <div className="catalog-bg min-h-full pb-6">
      <section className="sticky top-0 z-30 border-b border-cyan-100/80 bg-white/92 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-2.5 sm:px-6 lg:px-8">
          <Link href="/" className="inline-flex min-w-0">
            <Image
              src="/vedisa-logo.png"
              alt="Logo Vedisa Remates"
              width={208}
              height={43}
              priority
              className="h-auto w-full max-w-[148px] sm:max-w-[192px]"
            />
          </Link>
          <div className="flex shrink-0 items-center gap-1.5">
            <AdminAccessLink />
            <Link
              href="/"
              className="ui-focus hidden rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 sm:inline-flex"
            >
              Inicio
            </Link>
            <Link
              href="/"
              aria-label="Volver al inicio"
              className="ui-focus inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 sm:hidden"
            >
              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
                <path d="M12.5 4.5L7 10l5.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      <main className="relative z-10 mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
        <header className="mb-3 sm:mb-5">
          {isEventLocked && activeAuction ? (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-700">
                {resolveCommercialEventType(activeAuction) === "venta_directa"
                  ? "Venta directa"
                  : "Remate"}
              </p>
              <h1 className="line-clamp-2 text-xl font-bold leading-tight text-slate-900 sm:text-2xl md:text-3xl">
                {activeAuction.name}
              </h1>
              {eventScheduleLabel ? (
                <p className="mt-1 text-xs text-slate-600 sm:text-sm">{eventScheduleLabel}</p>
              ) : null}
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold text-slate-900 sm:text-3xl">Vehículos disponibles</h1>
              <p className="mt-1 hidden text-sm text-slate-600 sm:block">
                Explora unidades publicadas con precio y ficha completa.
              </p>
            </>
          )}
        </header>

        {showRemateParticipationHint && activeAuction ? (
          <div className="mb-3 rounded-xl border border-indigo-200/70 bg-indigo-50/60 px-3 py-2.5 sm:mb-5 sm:rounded-2xl sm:p-4">
            <button
              type="button"
              onClick={() => setShowRemateHint((prev) => !prev)}
              className="ui-focus flex w-full items-center justify-between gap-2 text-left"
              aria-expanded={showRemateHint}
            >
              <span className="text-xs font-semibold text-indigo-900 sm:text-sm">
                Participar en vehiculoschocados.cl
              </span>
              <svg
                viewBox="0 0 20 20"
                fill="none"
                className={`h-4 w-4 shrink-0 text-indigo-700 transition ${showRemateHint ? "rotate-180" : ""}`}
                aria-hidden="true"
              >
                <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
            {showRemateHint ? (
              <div className="mt-2 space-y-2 border-t border-indigo-100 pt-2">
                <p className="text-xs leading-relaxed text-slate-700 sm:text-sm">
                  Revisa fichas aquí y oferta en el remate web el {eventScheduleLabel ?? "día del evento"}.
                </p>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={REMATE_WEB_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ui-focus inline-flex min-h-9 items-center rounded-full border border-indigo-300 bg-white px-3 text-xs font-semibold text-indigo-800"
                  >
                    Ir al remate
                  </a>
                  <a
                    href={`${REMATE_WEB_URL.replace(/\/$/, "")}/Account/Register`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ui-focus inline-flex min-h-9 items-center rounded-full bg-indigo-600 px-3 text-xs font-semibold text-white"
                  >
                    Crear cuenta
                  </a>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <CollapsibleMobilePanel
          activeCount={activeFilterCount}
          className="mb-4 sm:mb-6"
          panelClassName="md:rounded-2xl md:border md:border-slate-300/80 md:bg-white/95 md:p-4 md:shadow-md"
          summary={
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  aria-hidden="true"
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                >
                  <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <circle cx="8.75" cy="8.75" r="5.75" stroke="currentColor" strokeWidth="1.8" />
                </svg>
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Buscar…"
                  className="ui-focus w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-2 text-sm text-slate-800"
                  aria-label="Buscar vehículos"
                />
              </div>
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                {filteredItems.length}
              </span>
            </div>
          }
        >
          {filtersPanel}
        </CollapsibleMobilePanel>

        {filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500 sm:p-8">
            {searchTerm.trim() || activeFilterCount > 0
              ? "No hay vehículos con estos filtros."
              : "No hay vehículos publicados por ahora."}
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 sm:gap-4">
            {pagedItems.map((item) => {
              const key = getVehicleKey(item);
              return (
                <VehicleListRow
                  key={key}
                  item={item}
                  showPatents={showPatents}
                  commercialBadge={resolveCommercialEventBadge(item, initialConfig, commercialBadges)}
                  priceLabel={formatPrice(
                    resolveVehiclePriceRaw(item, initialConfig.vehiclePrices) ?? undefined,
                  )}
                />
              );
            })}
            {totalPages > 1 ? (
              <nav
                className="flex items-center justify-between gap-2 pt-2 sm:justify-center sm:pt-4"
                aria-label="Paginación de vehículos"
              >
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="ui-focus rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50 sm:px-4 sm:text-sm"
                >
                  ← Ant.
                </button>
                <span className="text-xs text-slate-600 sm:text-sm" aria-live="polite">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  className="ui-focus rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50 sm:px-4 sm:text-sm"
                >
                  Sig. →
                </button>
              </nav>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
