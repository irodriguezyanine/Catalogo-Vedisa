"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { shouldShowPatentsToViewer } from "@/lib/catalog-patent-visibility";
import { AdminAccessLink } from "@/components/admin/admin-access-link";
import { inferVehicleSiniestradoStatus } from "@/components/catalog-card";
import {
  buildCommercialEventByVehicleKey,
  formatPrice,
  getFilterableAuctionGroups,
  getPatent,
  getVehicleKey,
  getVisibleCatalogItems,
  matchesVehicleListCommercialFilter,
  resolveCommercialEventBadge,
  resolveVehiclePriceRaw,
  type VehicleListCommercialFilter,
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
}: {
  commercialBadge: VehicleCommercialEventBadge | null;
  item: CatalogItem;
}) {
  const tags: Array<{ label: string; className: string }> = [];

  if (commercialBadge?.kind === "venta_directa") {
    tags.push({
      label: "Venta directa",
      className: "bg-emerald-100 text-emerald-800",
    });
    if (inferVehicleSiniestradoStatus(item) === "siniestrado") {
      tags.push({
        label: "SINIESTRADO",
        className: "bg-amber-100 text-amber-900",
      });
    }
  } else if (commercialBadge?.kind === "remate") {
    tags.push({
      label: "Remate",
      className: "bg-indigo-100 text-indigo-700",
    });
  }

  if (tags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag.label}
          className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${tag.className}`}
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
      className="ui-focus group grid cursor-pointer gap-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-cyan-300 hover:shadow-md md:grid-cols-[220px_minmax(0,1fr)_auto] md:items-center md:p-4"
    >
      <div className="relative h-40 overflow-hidden rounded-xl bg-slate-100 md:h-36">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cover}
          alt={item.title}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          loading="lazy"
        />
        {item.view3dUrl ? (
          <span className="absolute left-2 top-2 rounded-full bg-cyan-500 px-2 py-0.5 text-[10px] font-semibold text-white">
            3D
          </span>
        ) : null}
      </div>

      <div className="min-w-0 space-y-2">
        <div>
          {showPatents ? (
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{getPatent(item)}</p>
          ) : null}
          <h2 className="line-clamp-2 text-lg font-bold text-slate-900">{item.title}</h2>
          {item.subtitle ? (
            <p className="mt-1 line-clamp-2 text-sm text-slate-600">{shortText(item.subtitle, 180)}</p>
          ) : null}
        </div>
        <VehicleListTags commercialBadge={commercialBadge} item={item} />
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          {item.location ? <span>{shortText(item.location, 48)}</span> : null}
          {item.status ? <span>{shortText(item.status, 40)}</span> : null}
          <span>
            {item.images.length} foto{item.images.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-end md:flex-col md:items-end md:justify-center md:text-right">
        {priceLabel ? (
          <p className="text-lg font-bold text-cyan-700">{priceLabel}</p>
        ) : (
          <p className="text-sm font-medium text-slate-400">Precio no informado</p>
        )}
      </div>
    </Link>
  );
}

export function CatalogVehiclesListClient({ feed, initialConfig }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tipoFilter, setTipoFilter] = useState<VehicleListCommercialFilter>(() =>
    parseTipoFilter(searchParams.get("tipo")),
  );
  const [eventoFilter, setEventoFilter] = useState<string | null>(() => searchParams.get("evento"));

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

  const filteredItems = useMemo(() => {
    const byGroup = items.filter((item) =>
      matchesVehicleListCommercialFilter(item, initialConfig, {
        tipo: tipoFilter,
        eventoId: eventoFilter,
      }),
    );
    const query = searchTerm.trim().toLowerCase();
    if (!query) return byGroup;
    return byGroup.filter((item) => {
      const raw = item.raw as Record<string, unknown>;
      const haystack = [
        item.title,
        item.subtitle,
        ...(showPatents ? [getPatent(item)] : []),
        item.location,
        raw.marca,
        raw.modelo,
        raw.descripcion,
      ]
        .filter((value) => typeof value === "string")
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [items, searchTerm, showPatents, initialConfig, tipoFilter, eventoFilter]);

  const activeEventoLabel = useMemo(() => {
    if (!eventoFilter) return null;
    return auctionsById.get(eventoFilter)?.name ?? null;
  }, [auctionsById, eventoFilter]);

  const activeAuction = useMemo(() => {
    if (!eventoFilter) return null;
    return auctionsById.get(eventoFilter) ?? null;
  }, [auctionsById, eventoFilter]);

  const showRemateParticipationHint = Boolean(
    activeAuction && resolveCommercialEventType(activeAuction) === "remate",
  );

  useEffect(() => {
    setPage(1);
  }, [searchTerm, tipoFilter, eventoFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pagedItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredItems.slice(start, start + PAGE_SIZE);
  }, [filteredItems, page]);

  return (
    <div className="catalog-bg min-h-full">
      <section className="sticky top-0 z-30 border-b border-cyan-100/80 bg-white/88 shadow-[0_8px_24px_rgba(87,141,167,0.08)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/" className="inline-flex">
            <Image
              src="/vedisa-logo.png"
              alt="Logo Vedisa Remates"
              width={208}
              height={43}
              priority
              className="h-auto w-full max-w-[192px] sm:max-w-[208px]"
            />
          </Link>
          <div className="flex items-center gap-2">
            <AdminAccessLink />
            <Link
              href="/"
              className="ui-focus rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Volver al inicio
            </Link>
          </div>
        </div>
      </section>

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-6">
          <p className="premium-kicker">Inventario completo</p>
          <h1 className="text-3xl font-bold text-slate-900">Vehículos disponibles</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Listado completo de unidades publicadas con precio, tipo de venta y estado de siniestro cuando aplica.
          </p>
        </header>

        {showRemateParticipationHint && activeAuction ? (
          <div
            className="mb-6 rounded-2xl border border-indigo-200/80 bg-gradient-to-r from-indigo-50 via-white to-cyan-50/70 p-4 shadow-sm"
            role="note"
            aria-label="Información para participar en el remate"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-indigo-800">
                  Cómo participar en este remate
                </p>
                <p className="mt-1 text-sm leading-relaxed text-slate-700">
                  Las unidades de{" "}
                  <span className="font-semibold text-slate-900">{activeAuction.name}</span> se rematan en{" "}
                  <a
                    href={REMATE_WEB_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-cyan-800 underline decoration-cyan-300 underline-offset-2 hover:text-cyan-950"
                  >
                    vehiculoschocados.cl
                  </a>{" "}
                  el{" "}
                  <span className="font-semibold text-slate-900">
                    {formatAuctionHumanSchedule(activeAuction)}
                  </span>
                  . Aquí puedes revisar fichas, fotos y detalles antes del evento.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <a
                  href={REMATE_WEB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ui-focus inline-flex min-h-10 items-center rounded-full border border-indigo-300 bg-white px-4 text-sm font-semibold text-indigo-800 transition hover:bg-indigo-50"
                >
                  Ir al remate web
                </a>
                <a
                  href={`${REMATE_WEB_URL.replace(/\/$/, "")}/Account/Register`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ui-focus inline-flex min-h-10 items-center rounded-full bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-500"
                >
                  Crear cuenta
                </a>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mb-6 glass-soft rounded-2xl border border-slate-300/80 bg-white/95 p-4 shadow-md">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative min-w-0 flex-1">
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
                  placeholder={
                    showPatents ? "Buscar por patente, marca, modelo..." : "Buscar por marca, modelo..."
                  }
                  className="ui-focus w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-800"
                  aria-label={
                    showPatents ? "Buscar vehículos por patente, marca o modelo" : "Buscar vehículos por marca o modelo"
                  }
                />
              </div>
              <span
                className="shrink-0 rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700"
                aria-live="polite"
              >
                {filteredItems.length} vehículo{filteredItems.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block font-semibold text-slate-700">Tipo de venta</span>
                <select
                  value={tipoFilter}
                  onChange={(event) => {
                    const nextTipo = parseTipoFilter(event.target.value);
                    updateFilters(nextTipo, null);
                  }}
                  className="ui-focus w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800"
                  aria-label="Filtrar por tipo de venta"
                >
                  <option value="all">Todos</option>
                  <option value="remate">Remates</option>
                  <option value="venta_directa">Ventas directas</option>
                </select>
              </label>

              <label className="block text-sm">
                <span className="mb-1 block font-semibold text-slate-700">Grupo / evento</span>
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
                  className="ui-focus w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800"
                  aria-label="Filtrar por grupo o evento"
                >
                  <option value="">Todos los grupos</option>
                  {(tipoFilter === "all" || tipoFilter === "remate") && auctionGroups.remates.length > 0 ? (
                    <optgroup label="Remates">
                      {auctionGroups.remates.map((auction) => (
                        <option key={auction.id} value={auction.id}>
                          {auction.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {(tipoFilter === "all" || tipoFilter === "venta_directa") &&
                  auctionGroups.ventasDirectas.length > 0 ? (
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

            {activeEventoLabel ? (
              <p className="text-xs font-medium text-cyan-800">
                Mostrando vehículos de: <span className="font-bold">{activeEventoLabel}</span>
              </p>
            ) : null}
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
            {searchTerm.trim() || tipoFilter !== "all" || eventoFilter
              ? "No encontramos vehículos para estos filtros."
              : "No hay vehículos publicados en este momento."}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
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
                className="flex flex-wrap items-center justify-center gap-2 pt-4"
                aria-label="Paginación de vehículos"
              >
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="ui-focus rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Anterior
                </button>
                <span className="px-2 text-sm text-slate-600" aria-live="polite">
                  Página {page} de {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  className="ui-focus rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Siguiente
                </button>
              </nav>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
