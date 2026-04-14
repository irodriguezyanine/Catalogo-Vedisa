"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { CatalogCard } from "@/components/catalog-card";
import type { CatalogFeed, CatalogItem } from "@/types/catalog";
import {
  DEFAULT_EDITOR_CONFIG,
  type EditorConfig,
  type EditorVehicleDetails,
  type UpcomingAuction,
  type SectionId,
  type VehicleTypeId,
} from "@/types/editor";

const EDITOR_STORAGE_KEY = "vedisa_editor_config_local";
const EDITOR_CATEGORY_SECTIONS: SectionId[] = ["ventas-directas", "novedades", "catalogo"];
const EDITOR_PAGE_SIZE = 20;

function normalizeText(value?: string): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function getVehicleKey(item: CatalogItem): string {
  const raw = item.raw as Record<string, unknown>;
  const patent = [raw.patente, raw.PATENTE, raw.PPU, raw.stock_number]
    .find((value) => typeof value === "string" && value.trim().length > 0) as string | undefined;
  if (patent) return patent.toUpperCase().replace(/\s+/g, "").replace(/-/g, "");
  return item.id;
}

function getPatent(item: CatalogItem): string {
  const raw = item.raw as Record<string, unknown>;
  const patent = [raw.patente, raw.PATENTE, raw.PPU, raw.stock_number]
    .find((value) => typeof value === "string" && value.trim().length > 0) as string | undefined;
  return patent?.toUpperCase().replace(/\s+/g, "").replace(/-/g, "") ?? "—";
}

function getModel(item: CatalogItem): string {
  const raw = item.raw as Record<string, unknown>;
  const model = [raw.modelo, raw.model, item.title]
    .find((value) => typeof value === "string" && value.trim().length > 0) as string | undefined;
  return model?.trim() ?? item.title;
}

function inferVehicleType(item: CatalogItem): VehicleTypeId {
  const raw = item.raw as Record<string, unknown>;
  const sample = normalizeText(
    [item.title, item.subtitle, raw.categoria, raw.tipo_vehiculo, raw.description]
      .filter(Boolean)
      .join(" "),
  );

  if (/(camion|camión|bus|tracto|tolva|pesad|semi|rampla|grua)/.test(sample)) return "pesados";
  if (/(retro|excav|motoniv|bulldo|cargador|grua horquilla|maquinaria)/.test(sample)) return "maquinaria";
  if (/(auto|suv|sedan|hatch|pickup|camioneta|station)/.test(sample)) return "livianos";
  return "otros";
}

function formatPrice(value?: string): string | null {
  if (!value?.trim()) return null;
  const clean = value.replace(/[^\d]/g, "");
  if (!clean) return null;
  const amount = Number(clean);
  if (!Number.isFinite(amount)) return null;
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(amount);
}

function sectionFallback(items: CatalogItem[], start: number, count: number): CatalogItem[] {
  return items.slice(start, start + count);
}

function formatAuctionDateLabel(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function cleanOptional(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseImagesCsv(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith("http"));
}

function buildDetailsDraft(item: CatalogItem, override?: EditorVehicleDetails): EditorVehicleDetails {
  const raw = item.raw as Record<string, unknown>;
  const baseImages = item.images.filter((url) => url.startsWith("http")).join(", ");
  return {
    title: override?.title ?? item.title,
    subtitle: override?.subtitle ?? (item.subtitle ?? ""),
    status: override?.status ?? (item.status ?? ""),
    location: override?.location ?? (item.location ?? ""),
    lot: override?.lot ?? (item.lot ?? ""),
    auctionDate: override?.auctionDate ?? (item.auctionDate ?? ""),
    description: override?.description ?? String(raw.descripcion ?? raw.description ?? ""),
    brand: override?.brand ?? String(raw.marca ?? raw.brand ?? ""),
    model: override?.model ?? String(raw.modelo ?? raw.model ?? ""),
    year: override?.year ?? String(raw.ano ?? raw.anio ?? raw.year ?? ""),
    category: override?.category ?? String(raw.categoria ?? ""),
    thumbnail: override?.thumbnail ?? (item.thumbnail ?? ""),
    view3dUrl: override?.view3dUrl ?? (item.view3dUrl ?? ""),
    imagesCsv: override?.imagesCsv ?? baseImages,
  };
}

function sanitizeDetails(details: EditorVehicleDetails): EditorVehicleDetails | undefined {
  const clean: EditorVehicleDetails = {
    title: cleanOptional(details.title),
    subtitle: cleanOptional(details.subtitle),
    status: cleanOptional(details.status),
    location: cleanOptional(details.location),
    lot: cleanOptional(details.lot),
    auctionDate: cleanOptional(details.auctionDate),
    description: cleanOptional(details.description),
    brand: cleanOptional(details.brand),
    model: cleanOptional(details.model),
    year: cleanOptional(details.year),
    category: cleanOptional(details.category),
    thumbnail: cleanOptional(details.thumbnail),
    view3dUrl: cleanOptional(details.view3dUrl),
    imagesCsv: cleanOptional(details.imagesCsv),
  };

  if (Object.values(clean).every((value) => !value)) return undefined;
  return clean;
}

function applyDetailsOverride(item: CatalogItem, override?: EditorVehicleDetails): CatalogItem {
  if (!override) return item;
  const images = parseImagesCsv(override.imagesCsv);
  return {
    ...item,
    title: override.title ?? item.title,
    subtitle: override.subtitle ?? item.subtitle,
    status: override.status ?? item.status,
    location: override.location ?? item.location,
    lot: override.lot ?? item.lot,
    auctionDate: override.auctionDate ?? item.auctionDate,
    thumbnail: override.thumbnail ?? item.thumbnail,
    view3dUrl: override.view3dUrl ?? item.view3dUrl,
    images: images.length > 0 ? images : item.images,
    raw: {
      ...item.raw,
      ...(override.description ? { descripcion: override.description, description: override.description } : {}),
      ...(override.brand ? { marca: override.brand, brand: override.brand } : {}),
      ...(override.model ? { modelo: override.model, model: override.model } : {}),
      ...(override.year ? { ano: override.year, anio: override.year, year: override.year } : {}),
      ...(override.category ? { categoria: override.category } : {}),
    },
  };
}

type FeaturedStripProps = {
  items: CatalogItem[];
  onOpenVehicle: (item: CatalogItem) => void;
};

function FeaturedStrip({ items, onOpenVehicle }: FeaturedStripProps) {
  if (items.length === 0) return null;

  return (
    <section className="section-shell">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="premium-kicker">Selecciones premium</p>
          <h2 className="text-2xl font-bold text-slate-900">Vitrina destacada</h2>
        </div>
        <p className="text-xs text-slate-500">Desliza horizontalmente</p>
      </div>
      <div className="featured-strip">
        {items.map((item) => (
          <button
            key={`featured-${item.id}`}
            type="button"
            className="featured-item text-left"
            onClick={() => onOpenVehicle(item)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.thumbnail ?? item.images[0] ?? "/placeholder-car.svg"}
              alt={item.title}
              className="featured-image"
              loading="lazy"
            />
            <div className="featured-overlay" />
            <div className="featured-content">
              <p className="line-clamp-1 text-sm font-semibold uppercase tracking-wide text-cyan-700">
                {item.status ?? "Unidad disponible"}
              </p>
              <h3 className="line-clamp-2 text-xl font-bold text-white">{item.title}</h3>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-100">
                {item.subtitle ? <span className="featured-chip">{item.subtitle}</span> : null}
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

type SectionProps = {
  id: SectionId;
  title: string;
  subtitle: string;
  items: CatalogItem[];
  priceMap: Record<string, string>;
  upcomingAuctionByVehicleKey?: Record<string, string>;
  onOpenVehicle: (item: CatalogItem) => void;
};

function Section({
  id,
  title,
  subtitle,
  items,
  priceMap,
  upcomingAuctionByVehicleKey,
  onOpenVehicle,
}: SectionProps) {
  return (
    <section id={id} className="section-shell scroll-mt-24">
      <header className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="premium-kicker">Seccion destacada</p>
          <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
        </div>
        <span className="inline-flex w-fit rounded-full bg-cyan-100 px-3 py-1 text-xs font-semibold text-cyan-900">
          {items.length} publicaciones
        </span>
      </header>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
          No hay elementos disponibles en esta seccion por ahora.
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <CatalogCard
              key={`${id}-${item.id}`}
              item={item}
              priceLabel={formatPrice(priceMap[getVehicleKey(item)])}
              upcomingAuctionLabel={upcomingAuctionByVehicleKey?.[getVehicleKey(item)]}
              onOpen={() => onOpenVehicle(item)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

type UpcomingAuctionsSectionProps = {
  groups: Array<{ auction: UpcomingAuction; items: CatalogItem[] }>;
  priceMap: Record<string, string>;
  upcomingAuctionByVehicleKey: Record<string, string>;
  onOpenVehicle: (item: CatalogItem) => void;
};

function UpcomingAuctionsSection({
  groups,
  priceMap,
  upcomingAuctionByVehicleKey,
  onOpenVehicle,
}: UpcomingAuctionsSectionProps) {
  return (
    <section id="proximos-remates" className="section-shell scroll-mt-24">
      <header className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="premium-kicker">Agenda de remates</p>
          <h2 className="text-2xl font-bold text-slate-900">Próximos remates</h2>
          <p className="mt-1 text-sm text-slate-600">Cada remate funciona como categoría con fecha y vehículos asignados.</p>
        </div>
      </header>
      <div className="space-y-8">
        {groups.map(({ auction, items }) => (
          <div key={auction.id}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-indigo-50/50 px-3 py-2">
              <h3 className="text-base font-semibold text-indigo-900">{auction.name}</h3>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-indigo-700">
                {formatAuctionDateLabel(auction.date)} · {items.length} vehículos
              </span>
            </div>
            {items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                Sin vehículos asignados en este remate.
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {items.map((item) => (
                  <CatalogCard
                    key={`${auction.id}-${item.id}`}
                    item={item}
                    priceLabel={formatPrice(priceMap[getVehicleKey(item)])}
                    upcomingAuctionLabel={upcomingAuctionByVehicleKey[getVehicleKey(item)]}
                    onOpen={() => onOpenVehicle(item)}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

type Props = {
  feed: CatalogFeed;
};

export function CatalogHomeClient({ feed }: Props) {
  const [config, setConfig] = useState<EditorConfig>(DEFAULT_EDITOR_CONFIG);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTypeTab, setActiveTypeTab] = useState<VehicleTypeId>("livianos");
  const [searchTerm, setSearchTerm] = useState("");
  const [editorPage, setEditorPage] = useState(1);
  const [editingVehicleKey, setEditingVehicleKey] = useState<string | null>(null);
  const [editingDetails, setEditingDetails] = useState<EditorVehicleDetails | null>(null);
  const [newAuctionName, setNewAuctionName] = useState("");
  const [newAuctionDate, setNewAuctionDate] = useState("");
  const [loginEmail, setLoginEmail] = useState("jpmontero@vedisaremates.cl");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [selectedVehicle, setSelectedVehicle] = useState<CatalogItem | null>(null);
  const rawItems = feed.items;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedVehicle(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    void (async () => {
      const sessionRes = await fetch("/api/admin/session", { cache: "no-store" });
      const session = (await sessionRes.json()) as { loggedIn?: boolean };
      setIsAdmin(Boolean(session.loggedIn));
      const configRes = await fetch("/api/admin/editor-config", { cache: "no-store" });
      if (configRes.ok) {
        const payload = (await configRes.json()) as { config?: EditorConfig };
        if (payload.config) {
          setConfig(payload.config);
          localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify(payload.config));
          return;
        }
      }
      const local = localStorage.getItem(EDITOR_STORAGE_KEY);
      if (local) {
        setConfig(JSON.parse(local) as EditorConfig);
      }
    })();
  }, []);

  const items = useMemo(
    () =>
      rawItems.map((item) =>
        applyDetailsOverride(item, config.vehicleDetails[getVehicleKey(item)]),
      ),
    [rawItems, config.vehicleDetails],
  );

  const itemsByKey = useMemo(() => {
    const map = new Map<string, CatalogItem>();
    for (const item of items) {
      map.set(getVehicleKey(item), item);
    }
    return map;
  }, [items]);

  const visibleItems = useMemo(
    () => items.filter((item) => !config.hiddenVehicleIds.includes(getVehicleKey(item))),
    [items, config.hiddenVehicleIds],
  );

  const getSectionItems = (sectionId: SectionId, fallback: CatalogItem[]): CatalogItem[] => {
    const selected = config.sectionVehicleIds[sectionId] ?? [];
    if (selected.length === 0) return fallback;
    return selected.map((id) => itemsByKey.get(id)).filter((item): item is CatalogItem => !!item);
  };

  const proximosByKeyword = visibleItems.filter((item) =>
    normalizeText([item.status, item.subtitle, item.title, item.location].filter(Boolean).join(" ")).includes("proxim"),
  );
  const ventasByKeyword = visibleItems.filter((item) =>
    normalizeText([item.status, item.subtitle, item.title].filter(Boolean).join(" ")).includes("venta directa"),
  );
  const novedadesByKeyword = visibleItems.filter((item) =>
    normalizeText([item.status, item.subtitle, item.title].filter(Boolean).join(" ")).includes("novedad"),
  );

  const upcomingAuctionByVehicleKey = useMemo(() => {
    const labels: Record<string, string> = {};
    const auctionsById = new Map(
      (config.upcomingAuctions ?? []).map((auction) => [auction.id, auction] as const),
    );
    for (const [vehicleKey, auctionId] of Object.entries(config.vehicleUpcomingAuctionIds ?? {})) {
      const auction = auctionsById.get(auctionId);
      if (!auction) continue;
      const dateLabel = formatAuctionDateLabel(auction.date);
      labels[vehicleKey] = dateLabel ? `${auction.name} · ${dateLabel}` : auction.name;
    }
    return labels;
  }, [config.upcomingAuctions, config.vehicleUpcomingAuctionIds]);

  const sortedUpcomingAuctions = useMemo(
    () =>
      [...(config.upcomingAuctions ?? [])].sort((a, b) =>
        (a.date ?? "").localeCompare(b.date ?? "", "es"),
      ),
    [config.upcomingAuctions],
  );

  const upcomingAuctionGroups = useMemo(
    () =>
      sortedUpcomingAuctions.map((auction) => ({
        auction,
        items: visibleItems.filter(
          (item) =>
            (config.vehicleUpcomingAuctionIds[getVehicleKey(item)] ?? "") === auction.id,
        ),
      })),
    [sortedUpcomingAuctions, visibleItems, config.vehicleUpcomingAuctionIds],
  );

  const hasUpcomingAuctionCategories =
    sortedUpcomingAuctions.length > 0 &&
    upcomingAuctionGroups.some((group) => group.items.length > 0);

  const proximosRemates = getSectionItems(
    "proximos-remates",
    proximosByKeyword.length > 0 ? proximosByKeyword.slice(0, 12) : sectionFallback(visibleItems, 0, 12),
  );
  const ventasDirectas = getSectionItems(
    "ventas-directas",
    ventasByKeyword.length > 0 ? ventasByKeyword.slice(0, 12) : sectionFallback(visibleItems, 10, 12),
  );
  const novedades = getSectionItems(
    "novedades",
    novedadesByKeyword.length > 0 ? novedadesByKeyword.slice(0, 12) : sectionFallback(visibleItems, 20, 12),
  );
  const catalogoItems = getSectionItems("catalogo", visibleItems);
  const filteredCatalogItems = catalogoItems.filter((item) => inferVehicleType(item) === activeTypeTab);

  const filteredEditorItems = useMemo(() => {
    const query = normalizeText(searchTerm);
    const source = query
      ? items.filter((item) => normalizeText(`${item.title} ${item.subtitle ?? ""}`).includes(query))
      : items;
    return source;
  }, [items, searchTerm]);

  const totalEditorPages = Math.max(1, Math.ceil(filteredEditorItems.length / EDITOR_PAGE_SIZE));
  const currentEditorPage = Math.min(editorPage, totalEditorPages);
  const paginatedEditorItems = useMemo(() => {
    const start = (currentEditorPage - 1) * EDITOR_PAGE_SIZE;
    return filteredEditorItems.slice(start, start + EDITOR_PAGE_SIZE);
  }, [filteredEditorItems, currentEditorPage]);

  const toggleItemInSection = (sectionId: SectionId, itemKey: string) => {
    setConfig((prev) => {
      const current = new Set(prev.sectionVehicleIds[sectionId] ?? []);
      if (current.has(itemKey)) current.delete(itemKey);
      else current.add(itemKey);
      return {
        ...prev,
        sectionVehicleIds: { ...prev.sectionVehicleIds, [sectionId]: Array.from(current) },
      };
    });
  };

  const toggleHidden = (itemKey: string) => {
    setConfig((prev) => {
      const set = new Set(prev.hiddenVehicleIds);
      if (set.has(itemKey)) set.delete(itemKey);
      else set.add(itemKey);
      return { ...prev, hiddenVehicleIds: Array.from(set) };
    });
  };

  const setPrice = (itemKey: string, value: string) => {
    setConfig((prev) => ({
      ...prev,
      vehiclePrices: { ...prev.vehiclePrices, [itemKey]: value },
    }));
  };

  const createUpcomingAuction = () => {
    const name = newAuctionName.trim();
    const date = newAuctionDate.trim();
    if (!name || !date) {
      alert("Debes completar nombre y fecha del remate.");
      return;
    }
    const id = `remate-${crypto.randomUUID()}`;
    setConfig((prev) => ({
      ...prev,
      upcomingAuctions: [...prev.upcomingAuctions, { id, name, date }],
    }));
    setNewAuctionName("");
    setNewAuctionDate("");
  };

  const removeUpcomingAuction = (auctionId: string) => {
    setConfig((prev) => {
      const nextAssignments = { ...prev.vehicleUpcomingAuctionIds };
      for (const [vehicleKey, value] of Object.entries(nextAssignments)) {
        if (value === auctionId) delete nextAssignments[vehicleKey];
      }
      const assignedVehicleKeys = new Set(Object.keys(nextAssignments));
      return {
        ...prev,
        upcomingAuctions: prev.upcomingAuctions.filter((auction) => auction.id !== auctionId),
        vehicleUpcomingAuctionIds: nextAssignments,
        sectionVehicleIds: {
          ...prev.sectionVehicleIds,
          "proximos-remates": (prev.sectionVehicleIds["proximos-remates"] ?? []).filter((key) =>
            assignedVehicleKeys.has(key),
          ),
        },
      };
    });
  };

  const assignVehicleToUpcomingAuction = (itemKey: string, auctionId: string) => {
    setConfig((prev) => {
      const nextAssignments = { ...prev.vehicleUpcomingAuctionIds };
      if (auctionId) nextAssignments[itemKey] = auctionId;
      else delete nextAssignments[itemKey];

      const sectionSet = new Set(prev.sectionVehicleIds["proximos-remates"] ?? []);
      if (auctionId) sectionSet.add(itemKey);
      else sectionSet.delete(itemKey);

      return {
        ...prev,
        vehicleUpcomingAuctionIds: nextAssignments,
        sectionVehicleIds: {
          ...prev.sectionVehicleIds,
          "proximos-remates": Array.from(sectionSet),
        },
      };
    });
  };

  const openDetailsEditor = (item: CatalogItem) => {
    const key = getVehicleKey(item);
    setEditingVehicleKey(key);
    setEditingDetails(buildDetailsDraft(item, config.vehicleDetails[key]));
  };

  const saveDetailsEditor = () => {
    if (!editingVehicleKey || !editingDetails) return;
    const sanitized = sanitizeDetails(editingDetails);
    setConfig((prev) => {
      const nextDetails = { ...prev.vehicleDetails };
      if (sanitized) nextDetails[editingVehicleKey] = sanitized;
      else delete nextDetails[editingVehicleKey];
      return { ...prev, vehicleDetails: nextDetails };
    });
    setEditingVehicleKey(null);
    setEditingDetails(null);
  };

  const cancelDetailsEditor = () => {
    setEditingVehicleKey(null);
    setEditingDetails(null);
  };

  const saveConfig = async () => {
    setSaving(true);
    localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify(config));
    const response = await fetch("/api/admin/editor-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
    });
    setSaving(false);
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({ error: "No se pudo guardar." }))) as { error?: string };
      alert(payload.error ?? "No se pudo guardar en servidor. Se dejó guardado localmente.");
      return;
    }
    alert("Configuración guardada.");
  };

  const login = async () => {
    setLoginError("");
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: loginEmail, password: loginPassword }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({ error: "No se pudo iniciar sesión." }))) as { error?: string };
      setLoginError(payload.error ?? "No se pudo iniciar sesión.");
      return;
    }
    setShowLogin(false);
    setLoginPassword("");
    setIsAdmin(true);
  };

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    setIsAdmin(false);
  };

  const editingItem = editingVehicleKey ? itemsByKey.get(editingVehicleKey) ?? null : null;

  return (
    <main className="premium-bg min-h-screen text-slate-900">
      <div className="premium-glow premium-glow-cyan" />
      <div className="premium-glow premium-glow-gold" />

      <section className="sticky top-0 z-30 border-b border-cyan-100/80 bg-white/88 shadow-[0_8px_24px_rgba(87,141,167,0.08)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <Link href="/" className="inline-flex">
              <Image
                src="/vedisa-logo.png"
                alt="Logo Vedisa Remates"
                width={352}
                height={72}
                priority
                className="h-auto w-full max-w-[352px]"
              />
            </Link>
            <div className="flex items-center gap-2">
              <nav className="flex flex-wrap gap-2 text-sm">
                <a href="#proximos-remates" className="premium-link-pill ui-focus">
                  Proximos remates
                </a>
                <a href="#ventas-directas" className="premium-link-pill ui-focus">
                  Ventas directas
                </a>
                <a href="#novedades" className="premium-link-pill ui-focus">
                  Novedades
                </a>
                <a href="#catalogo" className="premium-link-pill ui-focus">
                  Catalogo
                </a>
              </nav>
              {isAdmin ? (
                <button className="ui-focus rounded-full bg-slate-900 px-3 py-1 text-xs text-white transition hover:-translate-y-0.5 hover:bg-slate-700" onClick={logout}>
                  Salir editor
                </button>
              ) : (
                <button className="ui-focus rounded-full bg-cyan-600 px-3 py-1 text-xs text-white transition hover:-translate-y-0.5 hover:bg-cyan-500" onClick={() => setShowLogin(true)}>
                  Login
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="glass-soft rounded-xl px-4 py-3">
              <p className="text-lg font-bold leading-snug text-slate-900">
                Catálogo oficial de VEDISA REMATES
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Participa de forma segura en subastas de vehículos siniestrados: regístrate en{" "}
                <a
                  className="font-semibold text-cyan-700 underline decoration-cyan-500/60 underline-offset-2"
                  href="https://vehiculoschocados.cl/"
                  target="_blank"
                  rel="noreferrer"
                >
                  https://vehiculoschocados.cl/
                </a>{" "}
                y activa tu garantía para comenzar a ofertar.
              </p>
            </div>
            <span className="rounded-full bg-cyan-600 px-3 py-1 text-xs font-semibold text-white">{visibleItems.length} vehiculos</span>
          </div>
          {feed.warning ? (
            <p className="rounded-md border border-amber-300/60 bg-amber-100 px-3 py-2 text-sm text-amber-900">{feed.warning}</p>
          ) : null}
        </div>
      </section>

      {isAdmin ? (
        <section className="relative z-10 mx-auto mt-6 max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="section-shell glass-soft space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Modo editor administrador</h3>
                <p className="text-xs text-slate-500">Gestion de visibilidad, categorias, precios y detalles manuales por publicacion.</p>
              </div>
              <button onClick={saveConfig} disabled={saving} className="ui-focus rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-500 disabled:opacity-60">
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-52 flex-1">
                  <label className="mb-1 block text-xs font-semibold text-indigo-800">Nombre del remate</label>
                  <input
                    value={newAuctionName}
                    onChange={(event) => setNewAuctionName(event.target.value)}
                    placeholder="Ej: Remate Abril #2"
                    className="ui-focus w-full rounded-md border border-indigo-200 bg-white px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-indigo-800">Fecha</label>
                  <input
                    type="date"
                    value={newAuctionDate}
                    onChange={(event) => setNewAuctionDate(event.target.value)}
                    className="ui-focus rounded-md border border-indigo-200 bg-white px-3 py-2 text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={createUpcomingAuction}
                  className="ui-focus rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
                >
                  Crear remate
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {sortedUpcomingAuctions.length === 0 ? (
                  <p className="text-xs text-slate-500">Aún no hay remates creados.</p>
                ) : (
                  sortedUpcomingAuctions.map((auction) => {
                    const count = Object.values(config.vehicleUpcomingAuctionIds).filter(
                      (id) => id === auction.id,
                    ).length;
                    return (
                      <div key={auction.id} className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs">
                        <span className="font-semibold text-indigo-800">{auction.name}</span>
                        <span className="text-slate-500">{formatAuctionDateLabel(auction.date)}</span>
                        <span className="text-slate-500">({count})</span>
                        <button
                          type="button"
                          onClick={() => removeUpcomingAuction(auction.id)}
                          className="ui-focus rounded bg-rose-50 px-2 py-0.5 text-rose-700 transition hover:bg-rose-100"
                        >
                          Quitar
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            <input
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setEditorPage(1);
              }}
              placeholder="Buscar vehículo para editar..."
              className="ui-focus w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            />
            <div className="max-h-[70vh] overflow-auto rounded-lg border border-slate-200">
              <div className="sticky top-0 z-10 grid grid-cols-14 items-center gap-2 border-b border-slate-200 bg-slate-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                <div className="col-span-2">Patente</div>
                <div className="col-span-3">Modelo vehiculo</div>
                <div className="col-span-1 text-center">Visible</div>
                <div className="col-span-1 text-center">V. Directa</div>
                <div className="col-span-1 text-center">Novedad</div>
                <div className="col-span-1 text-center">Catálogo</div>
                <div className="col-span-3">Remate asignado</div>
                <div className="col-span-1">Precio</div>
                <div className="col-span-1 text-center">Detalle</div>
              </div>
              {paginatedEditorItems.map((item) => {
                const key = getVehicleKey(item);
                const hidden = config.hiddenVehicleIds.includes(key);
                return (
                  <div key={`editor-${key}`} className="grid grid-cols-14 items-center gap-2 border-b border-slate-100 px-3 py-2 text-xs transition odd:bg-white even:bg-slate-50/35 hover:bg-cyan-50/60">
                    <div className="col-span-2 font-semibold text-slate-700">{getPatent(item)}</div>
                    <div className="col-span-3 text-slate-700">{getModel(item)}</div>
                    <label className="col-span-1 flex items-center justify-center">
                      <input className="ui-focus" type="checkbox" checked={!hidden} onChange={() => toggleHidden(key)} />
                    </label>
                    {EDITOR_CATEGORY_SECTIONS.map((section) => {
                      const selected = (config.sectionVehicleIds[section] ?? []).includes(key);
                      return (
                        <label key={`${key}-${section}`} className="col-span-1 flex items-center justify-center">
                          <input className="ui-focus" type="checkbox" checked={selected} onChange={() => toggleItemInSection(section, key)} />
                        </label>
                      );
                    })}
                    <select
                      className="ui-focus col-span-3 rounded border border-slate-200 px-2 py-1"
                      value={config.vehicleUpcomingAuctionIds[key] ?? ""}
                      onChange={(event) => assignVehicleToUpcomingAuction(key, event.target.value)}
                    >
                      <option value="">Sin remate</option>
                      {sortedUpcomingAuctions.map((auction) => (
                        <option key={auction.id} value={auction.id}>
                          {auction.name} ({formatAuctionDateLabel(auction.date)})
                        </option>
                      ))}
                    </select>
                    <input
                      className="ui-focus col-span-1 rounded border border-slate-200 px-2 py-1"
                      placeholder="Precio"
                      value={config.vehiclePrices[key] ?? ""}
                      onChange={(event) => setPrice(key, event.target.value)}
                    />
                    <div className="col-span-1 flex justify-center">
                      <button
                        type="button"
                        onClick={() => openDetailsEditor(item)}
                        className="ui-focus rounded border border-cyan-300 bg-cyan-50 px-2 py-1 text-[11px] font-semibold text-cyan-700 transition hover:bg-cyan-100"
                      >
                        Editar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2">
              <p className="text-xs text-slate-600">
                Mostrando {paginatedEditorItems.length} de {filteredEditorItems.length} resultados.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditorPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentEditorPage === 1}
                  className="ui-focus rounded border border-slate-300 px-3 py-1 text-xs transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Anterior
                </button>
                <span className="text-xs font-semibold text-slate-700">
                  Pagina {currentEditorPage} / {totalEditorPages}
                </span>
                <button
                  type="button"
                  onClick={() => setEditorPage((prev) => Math.min(totalEditorPages, prev + 1))}
                  disabled={currentEditorPage >= totalEditorPages}
                  className="ui-focus rounded border border-slate-300 px-3 py-1 text-xs transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Siguiente
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Edicion masiva dinamica: marca/desmarca categorias por fila, visibilidad y precio. Ahora con paginacion de 20 vehiculos por pagina.
            </p>
          </div>
        </section>
      ) : null}

      {!isAdmin ? (
        <>
      <section className="relative z-10 mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-5 lg:px-8">
        <div className="premium-panel premium-panel-hero lg:col-span-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">VEDISA REMATES</p>
          <h1 className="mt-3 text-3xl font-black leading-tight text-slate-900 md:text-5xl">
            Catálogo de vehículos de VEDISA REMATES
          </h1>
          <div className="glass-soft mt-4 max-w-3xl rounded-xl p-5">
            <p className="text-base font-semibold text-slate-800 md:text-lg">
              Inventario disponible para ofertar online en{" "}
              <a
                className="font-semibold text-cyan-700 underline decoration-cyan-500/70 underline-offset-2"
                href="https://vedisaremates.cl"
                target="_blank"
                rel="noreferrer"
              >
                vedisaremates.cl
              </a>
              .
            </p>
            <p className="mt-2 text-sm text-slate-600 md:text-base">
              Revisa cada unidad con detalle y concreta tu participación con respaldo profesional.
            </p>
            <div className="mt-4 grid gap-2 text-sm text-slate-700 md:text-[15px]">
              <div className="info-tile flex items-start gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-cyan-100 text-xs">📍</span>
                <p><span className="font-semibold text-slate-900">Exhibición presencial:</span> Arturo Prat 6457, Noviciado, Pudahuel.</p>
              </div>
              <div className="info-tile flex items-start gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-cyan-100 text-xs">🕒</span>
                <p><span className="font-semibold text-slate-900">Horario:</span> Lunes a Viernes 9:00 - 13:00 / 14:00 - 17:00 / Sáb-Dom cerrado.</p>
              </div>
              <div className="info-tile flex items-start gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-cyan-100 text-xs">💻</span>
                <p><span className="font-semibold text-slate-900">Remates 100% online:</span> visita las unidades pre-compra presencialmente en nuestra bodega, sin garantía previa.</p>
              </div>
              <div className="info-tile flex items-start gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-cyan-100 text-xs">🏢</span>
                <p><span className="font-semibold text-slate-900">Oficinas:</span> Américo Vespucio 2880, Piso 7.</p>
              </div>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="#catalogo" className="premium-btn-primary ui-focus">Ver catálogo completo</a>
            <a href="#proximos-remates" className="premium-btn-secondary ui-focus">Explorar secciones</a>
          </div>
        </div>
        <div className="grid gap-3 lg:col-span-2">
          <div className="premium-stat">
            <p className="text-xs uppercase tracking-widest text-slate-500">📍 Exhibición presencial</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">Arturo Prat 6457, Noviciado, Pudahuel</p>
          </div>
          <div className="premium-stat">
            <p className="text-xs uppercase tracking-widest text-slate-500">🕒 Horario</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">Lunes a Viernes 9:00 - 13:00 / 14:00 - 17:00</p>
          </div>
          <div className="premium-stat">
            <p className="text-xs uppercase tracking-widest text-slate-500">💻 Remates 100% online</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">Inspección pre-compra presencial disponible, sin garantía previa</p>
          </div>
          <div className="premium-stat">
            <p className="text-xs uppercase tracking-widest text-slate-500">🏢 Oficinas</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">Américo Vespucio 2880, Piso 7</p>
          </div>
        </div>
      </section>

      <div className="relative z-10 mx-auto flex max-w-7xl flex-col gap-14 px-4 pb-14 sm:px-6 lg:px-8">
        <FeaturedStrip items={visibleItems.slice(0, 8)} onOpenVehicle={setSelectedVehicle} />
        {hasUpcomingAuctionCategories ? (
          <UpcomingAuctionsSection
            groups={upcomingAuctionGroups}
            priceMap={config.vehiclePrices}
            upcomingAuctionByVehicleKey={upcomingAuctionByVehicleKey}
            onOpenVehicle={setSelectedVehicle}
          />
        ) : (
          <Section
            id="proximos-remates"
            title="Proximos remates"
            subtitle="Vehiculos en agenda con mayor prioridad comercial."
            items={proximosRemates}
            priceMap={config.vehiclePrices}
            upcomingAuctionByVehicleKey={upcomingAuctionByVehicleKey}
            onOpenVehicle={setSelectedVehicle}
          />
        )}
        <Section
          id="ventas-directas"
          title="Ventas Directas"
          subtitle="Stock disponible para cierre rapido."
          items={ventasDirectas}
          priceMap={config.vehiclePrices}
          upcomingAuctionByVehicleKey={upcomingAuctionByVehicleKey}
          onOpenVehicle={setSelectedVehicle}
        />
        <Section
          id="novedades"
          title="Novedades"
          subtitle="Ultimas unidades ingresadas al ecosistema Vedisa."
          items={novedades}
          priceMap={config.vehiclePrices}
          upcomingAuctionByVehicleKey={upcomingAuctionByVehicleKey}
          onOpenVehicle={setSelectedVehicle}
        />

        <section id="catalogo" className="section-shell scroll-mt-24">
          <header className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="premium-kicker">Catalogo</p>
              <h2 className="text-2xl font-bold text-slate-900">Inventario por tipo de vehiculo</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["livianos", "pesados", "maquinaria", "otros"] as VehicleTypeId[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setActiveTypeTab(type)}
                  className={`ui-focus rounded-full px-3 py-1 text-xs font-semibold transition ${
                    activeTypeTab === type ? "bg-cyan-600 text-white shadow-sm" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {type === "livianos" ? "Vehiculos livianos" : type === "pesados" ? "Vehiculos pesados" : type === "maquinaria" ? "Maquinaria" : "Otros"}
                </button>
              ))}
            </div>
          </header>
          {filteredCatalogItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
              No hay vehículos para esta pestaña.
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {filteredCatalogItems.map((item) => (
                <CatalogCard
                  key={`catalog-${item.id}`}
                  item={item}
                  priceLabel={formatPrice(config.vehiclePrices[getVehicleKey(item)])}
                  upcomingAuctionLabel={upcomingAuctionByVehicleKey[getVehicleKey(item)]}
                  onOpen={() => setSelectedVehicle(item)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {selectedVehicle ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4" onClick={() => setSelectedVehicle(null)}>
          <div className="max-h-[92vh] w-full max-w-6xl overflow-auto rounded-2xl bg-white p-4 shadow-2xl md:p-6" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-slate-900">{selectedVehicle.title}</h3>
                <p className="text-sm text-slate-500">{selectedVehicle.subtitle ?? "Vehículo en catálogo"}</p>
              </div>
              <button className="ui-focus rounded-md border border-slate-200 px-3 py-1 text-sm text-slate-600 transition hover:bg-slate-50" onClick={() => setSelectedVehicle(null)}>
                Cerrar
              </button>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                {selectedVehicle.view3dUrl ? (
                  <iframe
                    src={selectedVehicle.view3dUrl}
                    title={`Visor 3D ${selectedVehicle.title}`}
                    className="h-[420px] w-full border-0"
                    allow="fullscreen; autoplay"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedVehicle.thumbnail ?? selectedVehicle.images[0] ?? "/placeholder-car.svg"}
                    alt={selectedVehicle.title}
                    className="h-[420px] w-full object-cover"
                  />
                )}
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h4 className="mb-3 text-base font-semibold text-slate-900">Resumen del vehículo</h4>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  {(
                    [
                      ["Patente", (selectedVehicle.raw as Record<string, unknown>).patente ?? (selectedVehicle.raw as Record<string, unknown>).PPU],
                      ["Marca", (selectedVehicle.raw as Record<string, unknown>).marca ?? (selectedVehicle.raw as Record<string, unknown>).brand],
                      ["Modelo", (selectedVehicle.raw as Record<string, unknown>).modelo ?? (selectedVehicle.raw as Record<string, unknown>).model],
                      ["Año", (selectedVehicle.raw as Record<string, unknown>).ano ?? (selectedVehicle.raw as Record<string, unknown>).anio ?? (selectedVehicle.raw as Record<string, unknown>).year],
                      ["Categoría", (selectedVehicle.raw as Record<string, unknown>).categoria ?? inferVehicleType(selectedVehicle)],
                      ["Estado", selectedVehicle.status ?? "Disponible"],
                      ["Ubicación", selectedVehicle.location ?? (selectedVehicle.raw as Record<string, unknown>).ubicacion],
                      ["Lote", selectedVehicle.lot ?? (selectedVehicle.raw as Record<string, unknown>).stock_number],
                      ["Remate asignado", upcomingAuctionByVehicleKey[getVehicleKey(selectedVehicle)] ?? "Sin asignar"],
                      ["Precio", formatPrice(config.vehiclePrices[getVehicleKey(selectedVehicle)]) ?? "No informado"],
                      ["Fotos", `${selectedVehicle.images.length}`],
                    ] as Array<[string, unknown]>
                  ).map(([label, value]) => (
                    <div key={label} className="rounded-md bg-white p-2">
                      <dt className="text-xs uppercase text-slate-500">{label}</dt>
                      <dd className="font-medium text-slate-800">{String(value ?? "—")}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>
        </div>
      ) : null}
        </>
      ) : null}

      {showLogin ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900">Login</h3>
            <p className="mt-1 text-sm text-slate-500">Solo administradores pueden editar categorías y vehículos.</p>
            <div className="mt-4 space-y-2">
              <input value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" placeholder="Correo" />
              <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" placeholder="Contraseña" />
            </div>
            {loginError ? <p className="mt-2 text-xs text-red-600">{loginError}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowLogin(false)} className="ui-focus rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50">Cancelar</button>
              <button onClick={login} className="ui-focus rounded-md bg-cyan-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500">Entrar</button>
            </div>
          </div>
        </div>
      ) : null}

      {isAdmin && editingVehicleKey && editingDetails && editingItem ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/70 p-4" onClick={cancelDetailsEditor}>
          <div className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Editar detalle manual</h3>
                <p className="text-xs text-slate-500">
                  {getPatent(editingItem)} · {getModel(editingItem)}
                </p>
              </div>
              <button type="button" onClick={cancelDetailsEditor} className="ui-focus rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 transition hover:bg-slate-50">
                Cerrar
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <input className="rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Titulo" value={editingDetails.title ?? ""} onChange={(event) => setEditingDetails((prev) => ({ ...(prev ?? {}), title: event.target.value }))} />
              <input className="rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Subtitulo" value={editingDetails.subtitle ?? ""} onChange={(event) => setEditingDetails((prev) => ({ ...(prev ?? {}), subtitle: event.target.value }))} />
              <input className="rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Estado" value={editingDetails.status ?? ""} onChange={(event) => setEditingDetails((prev) => ({ ...(prev ?? {}), status: event.target.value }))} />
              <input className="rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Ubicacion" value={editingDetails.location ?? ""} onChange={(event) => setEditingDetails((prev) => ({ ...(prev ?? {}), location: event.target.value }))} />
              <input className="rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Lote" value={editingDetails.lot ?? ""} onChange={(event) => setEditingDetails((prev) => ({ ...(prev ?? {}), lot: event.target.value }))} />
              <input className="rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Fecha remate" value={editingDetails.auctionDate ?? ""} onChange={(event) => setEditingDetails((prev) => ({ ...(prev ?? {}), auctionDate: event.target.value }))} />
              <input className="rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Marca" value={editingDetails.brand ?? ""} onChange={(event) => setEditingDetails((prev) => ({ ...(prev ?? {}), brand: event.target.value }))} />
              <input className="rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Modelo" value={editingDetails.model ?? ""} onChange={(event) => setEditingDetails((prev) => ({ ...(prev ?? {}), model: event.target.value }))} />
              <input className="rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Año" value={editingDetails.year ?? ""} onChange={(event) => setEditingDetails((prev) => ({ ...(prev ?? {}), year: event.target.value }))} />
              <input className="rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Categoria" value={editingDetails.category ?? ""} onChange={(event) => setEditingDetails((prev) => ({ ...(prev ?? {}), category: event.target.value }))} />
              <input className="rounded border border-slate-300 px-3 py-2 text-sm md:col-span-2" placeholder="Imagen principal URL" value={editingDetails.thumbnail ?? ""} onChange={(event) => setEditingDetails((prev) => ({ ...(prev ?? {}), thumbnail: event.target.value }))} />
              <input className="rounded border border-slate-300 px-3 py-2 text-sm md:col-span-2" placeholder="Visor 3D URL" value={editingDetails.view3dUrl ?? ""} onChange={(event) => setEditingDetails((prev) => ({ ...(prev ?? {}), view3dUrl: event.target.value }))} />
              <textarea className="min-h-20 rounded border border-slate-300 px-3 py-2 text-sm md:col-span-2" placeholder="Descripcion" value={editingDetails.description ?? ""} onChange={(event) => setEditingDetails((prev) => ({ ...(prev ?? {}), description: event.target.value }))} />
              <textarea className="min-h-20 rounded border border-slate-300 px-3 py-2 text-sm md:col-span-2" placeholder="URLs de galeria separadas por coma" value={editingDetails.imagesCsv ?? ""} onChange={(event) => setEditingDetails((prev) => ({ ...(prev ?? {}), imagesCsv: event.target.value }))} />
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={cancelDetailsEditor} className="ui-focus rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50">
                Cancelar
              </button>
              <button type="button" onClick={saveDetailsEditor} className="ui-focus rounded bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500">
                Guardar detalle
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
