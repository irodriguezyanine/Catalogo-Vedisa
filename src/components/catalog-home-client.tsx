"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { CatalogCard } from "@/components/catalog-card";
import type { CatalogFeed, CatalogItem } from "@/types/catalog";
import {
  DEFAULT_EDITOR_CONFIG,
  type EditorConfig,
  type EditorVehicleDetails,
  type ManualPublication,
  type UpcomingAuction,
  type SectionId,
  type VehicleTypeId,
} from "@/types/editor";

const EDITOR_STORAGE_KEY = "vedisa_editor_config_local";
const FAVORITES_STORAGE_KEY = "vedisa_client_favorites";
const EDITOR_CATEGORY_SECTIONS: SectionId[] = ["ventas-directas", "novedades", "catalogo"];
const EDITOR_PAGE_SIZE = 20;
type AdminTabId = "vehiculos" | "categorias" | "layout";
type SortOption = "relevancia" | "fecha-remate" | "precio-asc" | "precio-desc" | "titulo";
type QuickFilterId = "livianos" | "pesados" | "con3d" | "conPrecio" | "recientes" | "manuales";
type ClientLeadForm = {
  name: string;
  phone: string;
  interest: string;
};
type SystemNotice = {
  id: number;
  tone: "success" | "error" | "info";
  title: string;
  message: string;
};

const QUICK_FILTER_LABELS: Record<QuickFilterId, string> = {
  livianos: "Livianos",
  pesados: "Pesados",
  con3d: "Con 3D",
  conPrecio: "Con precio",
  recientes: "Recientes",
  manuales: "Manuales",
};

const WHATSAPP_CTA_URL =
  "https://api.whatsapp.com/send/?phone=56989323397&text=Hola%2C+quiero+asesor%C3%ADa+para+ofertar+en+VEDISA&type=phone_number&app_absent=0";
const MAX_COMPARE_ITEMS = 4;
const ANALYTICS_STORAGE_KEY = "vedisa_analytics_events";

const SECTION_LABELS: Record<SectionId, string> = {
  "proximos-remates": "Próximos remates",
  "ventas-directas": "Ventas directas",
  novedades: "Novedades",
  catalogo: "Catálogo",
};

function normalizeEditorConfigClient(
  value?: Partial<EditorConfig> | null,
): EditorConfig {
  const defaults = DEFAULT_EDITOR_CONFIG;
  return {
    sectionVehicleIds: {
      "proximos-remates":
        value?.sectionVehicleIds?.["proximos-remates"] ??
        defaults.sectionVehicleIds["proximos-remates"],
      "ventas-directas":
        value?.sectionVehicleIds?.["ventas-directas"] ??
        defaults.sectionVehicleIds["ventas-directas"],
      novedades:
        value?.sectionVehicleIds?.novedades ?? defaults.sectionVehicleIds.novedades,
      catalogo: value?.sectionVehicleIds?.catalogo ?? defaults.sectionVehicleIds.catalogo,
    },
    hiddenVehicleIds: value?.hiddenVehicleIds ?? defaults.hiddenVehicleIds,
    vehiclePrices: value?.vehiclePrices ?? defaults.vehiclePrices,
    vehicleDetails: value?.vehicleDetails ?? defaults.vehicleDetails,
    upcomingAuctions: value?.upcomingAuctions ?? defaults.upcomingAuctions,
    vehicleUpcomingAuctionIds:
      value?.vehicleUpcomingAuctionIds ?? defaults.vehicleUpcomingAuctionIds,
    sectionTexts: {
      "proximos-remates":
        value?.sectionTexts?.["proximos-remates"] ??
        defaults.sectionTexts["proximos-remates"],
      "ventas-directas":
        value?.sectionTexts?.["ventas-directas"] ??
        defaults.sectionTexts["ventas-directas"],
      novedades: value?.sectionTexts?.novedades ?? defaults.sectionTexts.novedades,
      catalogo: value?.sectionTexts?.catalogo ?? defaults.sectionTexts.catalogo,
    },
    homeLayout: {
      heroKicker: value?.homeLayout?.heroKicker ?? defaults.homeLayout.heroKicker,
      heroTitle: value?.homeLayout?.heroTitle ?? defaults.homeLayout.heroTitle,
      heroDescription:
        value?.homeLayout?.heroDescription ?? defaults.homeLayout.heroDescription,
      showFeaturedStrip:
        value?.homeLayout?.showFeaturedStrip ?? defaults.homeLayout.showFeaturedStrip,
      showCommercialPanel:
        value?.homeLayout?.showCommercialPanel ?? defaults.homeLayout.showCommercialPanel,
      sectionOrder: value?.homeLayout?.sectionOrder ?? defaults.homeLayout.sectionOrder,
    },
    manualPublications: value?.manualPublications ?? defaults.manualPublications,
  };
}

type ManualPublicationDraft = {
  title: string;
  subtitle: string;
  status: string;
  location: string;
  lot: string;
  auctionDate: string;
  description: string;
  patente: string;
  brand: string;
  model: string;
  year: string;
  category: string;
  imagesCsv: string;
  thumbnail: string;
  view3dUrl: string;
  price: string;
  upcomingAuctionId: string;
  visible: boolean;
  sectionIds: SectionId[];
};

const EMPTY_MANUAL_PUBLICATION_DRAFT: ManualPublicationDraft = {
  title: "",
  subtitle: "",
  status: "Disponible",
  location: "",
  lot: "",
  auctionDate: "",
  description: "",
  patente: "",
  brand: "",
  model: "",
  year: "",
  category: "",
  imagesCsv: "",
  thumbnail: "",
  view3dUrl: "",
  price: "",
  upcomingAuctionId: "",
  visible: true,
  sectionIds: ["catalogo"],
};

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

function isRecentAuctionDate(value?: string): boolean {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const diff = Math.abs(now.getTime() - date.getTime());
  const days = diff / (1000 * 60 * 60 * 24);
  return days <= 45;
}

function getPriceAmount(value?: string): number {
  if (!value?.trim()) return Number.POSITIVE_INFINITY;
  const clean = value.replace(/[^\d]/g, "");
  const amount = Number(clean);
  return Number.isFinite(amount) && amount > 0 ? amount : Number.POSITIVE_INFINITY;
}

function trackEvent(eventName: string, payload?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const eventPayload = {
    event: eventName,
    timestamp: new Date().toISOString(),
    ...(payload ?? {}),
  };
  try {
    const gtag = (window as Window & { gtag?: (...args: unknown[]) => void }).gtag;
    if (typeof gtag === "function") {
      gtag("event", eventName, payload ?? {});
    }
    const dataLayer = (window as Window & { dataLayer?: unknown[] }).dataLayer;
    if (Array.isArray(dataLayer)) dataLayer.push(eventPayload);
    const raw = window.localStorage.getItem(ANALYTICS_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Array<Record<string, unknown>>) : [];
    const next = [eventPayload, ...parsed].slice(0, 120);
    window.localStorage.setItem(ANALYTICS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // avoid breaking UX if analytics fails
  }
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

function normalizeCloudinaryImages(value?: string): string[] {
  return parseImagesCsv(value).filter((url) => /cloudinary\.com|res\.cloudinary\.com/i.test(url));
}

function mapManualPublicationToCatalogItem(entry: ManualPublication): CatalogItem {
  const images = (entry.images ?? []).filter((url) => url.startsWith("http"));
  const thumbnail = entry.thumbnail ?? images[0];
  return {
    id: `manual-${entry.id}`,
    title: entry.title,
    subtitle: entry.subtitle,
    status: entry.status,
    location: entry.location,
    lot: entry.lot,
    auctionDate: entry.auctionDate,
    images,
    thumbnail,
    view3dUrl: entry.view3dUrl,
    raw: {
      source: "manual",
      patente: entry.patente,
      marca: entry.brand,
      modelo: entry.model,
      ano: entry.year,
      categoria: entry.category,
      descripcion: entry.description,
      manual_id: entry.id,
    },
  };
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
  favoriteKeys: string[];
  onToggleFavorite: (itemKey: string) => void;
  compareKeys: string[];
  onToggleCompare: (itemKey: string) => void;
  onOpenVehicle: (item: CatalogItem) => void;
};

function Section({
  id,
  title,
  subtitle,
  items,
  priceMap,
  upcomingAuctionByVehicleKey,
  favoriteKeys,
  onToggleFavorite,
  compareKeys,
  onToggleCompare,
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
              isFavorite={favoriteKeys.includes(getVehicleKey(item))}
              onToggleFavorite={() => onToggleFavorite(getVehicleKey(item))}
              isCompared={compareKeys.includes(getVehicleKey(item))}
              onToggleCompare={() => onToggleCompare(getVehicleKey(item))}
              onWhatsappClick={() =>
                trackEvent("whatsapp_click_card", {
                  section: id,
                  itemKey: getVehicleKey(item),
                })
              }
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
  favoriteKeys: string[];
  onToggleFavorite: (itemKey: string) => void;
  compareKeys: string[];
  onToggleCompare: (itemKey: string) => void;
  onOpenVehicle: (item: CatalogItem) => void;
};

function UpcomingAuctionsSection({
  groups,
  priceMap,
  upcomingAuctionByVehicleKey,
  favoriteKeys,
  onToggleFavorite,
  compareKeys,
  onToggleCompare,
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
                    isFavorite={favoriteKeys.includes(getVehicleKey(item))}
                    onToggleFavorite={() => onToggleFavorite(getVehicleKey(item))}
                    isCompared={compareKeys.includes(getVehicleKey(item))}
                    onToggleCompare={() => onToggleCompare(getVehicleKey(item))}
                    onWhatsappClick={() =>
                      trackEvent("whatsapp_click_card", {
                        section: "proximos-remates",
                        auctionId: auction.id,
                        itemKey: getVehicleKey(item),
                      })
                    }
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
  const [adminView, setAdminView] = useState<"editor" | "home">("home");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTypeTab, setActiveTypeTab] = useState<VehicleTypeId>("livianos");
  const [homeSearchTerm, setHomeSearchTerm] = useState("");
  const [homeSort, setHomeSort] = useState<SortOption>("relevancia");
  const [quickFilters, setQuickFilters] = useState<QuickFilterId[]>([]);
  const [favoriteKeys, setFavoriteKeys] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    const saved = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved) as string[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [compareKeys, setCompareKeys] = useState<string[]>([]);
  const [showComparePanel, setShowComparePanel] = useState(false);
  const [leadForm, setLeadForm] = useState<ClientLeadForm>({
    name: "",
    phone: "",
    interest: "",
  });
  const [leadMessage, setLeadMessage] = useState("");
  const [systemNotice, setSystemNotice] = useState<SystemNotice | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [adminTab, setAdminTab] = useState<AdminTabId>("vehiculos");
  const [auctionFilterId, setAuctionFilterId] = useState("");
  const [editorPage, setEditorPage] = useState(1);
  const [editingVehicleKey, setEditingVehicleKey] = useState<string | null>(null);
  const [editingDetails, setEditingDetails] = useState<EditorVehicleDetails | null>(null);
  const [newAuctionName, setNewAuctionName] = useState("");
  const [newAuctionDate, setNewAuctionDate] = useState("");
  const [manualDraft, setManualDraft] = useState<ManualPublicationDraft>(
    EMPTY_MANUAL_PUBLICATION_DRAFT,
  );
  const [showManualCreateModal, setShowManualCreateModal] = useState(false);
  const [manualUploadedImages, setManualUploadedImages] = useState<string[]>([]);
  const [manualUploading, setManualUploading] = useState(false);
  const [manualDropActive, setManualDropActive] = useState(false);
  const [draggedImageIndex, setDraggedImageIndex] = useState<number | null>(null);
  const manualFileInputRef = useRef<HTMLInputElement | null>(null);
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
      const local = localStorage.getItem(EDITOR_STORAGE_KEY);
      if (local) {
        const parsed = JSON.parse(local) as Partial<EditorConfig>;
        setConfig(normalizeEditorConfigClient(parsed));
      }

      const sessionRes = await fetch("/api/admin/session", { cache: "no-store" });
      const session = (await sessionRes.json()) as { loggedIn?: boolean };
      const loggedIn = Boolean(session.loggedIn);
      setIsAdmin(loggedIn);
      if (loggedIn) setAdminView("editor");

      const configRes = await fetch("/api/admin/editor-config", { cache: "no-store" });
      if (configRes.ok) {
        const payload = (await configRes.json()) as { config?: EditorConfig; persisted?: boolean };
        const shouldUseServerConfig = Boolean(payload.persisted) || !local;
        if (payload.config && shouldUseServerConfig) {
          const normalized = normalizeEditorConfigClient(payload.config);
          setConfig(normalized);
          localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify(normalized));
          return;
        }
      }
    })();
  }, []);

  useEffect(() => {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favoriteKeys));
  }, [favoriteKeys]);

  useEffect(() => {
    if (!systemNotice) return;
    const timeout = window.setTimeout(() => setSystemNotice(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [systemNotice]);

  const showSystemNotice = (
    tone: SystemNotice["tone"],
    title: string,
    message: string,
  ) => {
    setSystemNotice({ id: Date.now(), tone, title, message });
  };

  const manualItems = useMemo(
    () => (config.manualPublications ?? []).map(mapManualPublicationToCatalogItem),
    [config.manualPublications],
  );

  const items = useMemo(
    () =>
      [...rawItems, ...manualItems].map((item) =>
        applyDetailsOverride(item, config.vehicleDetails[getVehicleKey(item)]),
      ),
    [rawItems, manualItems, config.vehicleDetails],
  );

  const itemsByKey = useMemo(() => {
    const map = new Map<string, CatalogItem>();
    for (const item of items) {
      map.set(getVehicleKey(item), item);
    }
    return map;
  }, [items]);

  const mergedHiddenVehicleIds = useMemo(() => {
    const set = new Set(config.hiddenVehicleIds);
    for (const manual of config.manualPublications ?? []) {
      if (!manual.visible) set.add(`manual-${manual.id}`);
    }
    return set;
  }, [config.hiddenVehicleIds, config.manualPublications]);

  const visibleItems = useMemo(
    () => items.filter((item) => !mergedHiddenVehicleIds.has(getVehicleKey(item))),
    [items, mergedHiddenVehicleIds],
  );

  const homeFilteredItems = useMemo(() => {
    const query = normalizeText(homeSearchTerm);
    if (!query) return visibleItems;
    return visibleItems.filter((item) => {
      const raw = item.raw as Record<string, unknown>;
      const source = [
        item.title,
        item.subtitle,
        item.status,
        item.location,
        item.lot,
        raw.patente,
        raw.PATENTE,
        raw.PPU,
        raw.stock_number,
        raw.marca,
        raw.brand,
        raw.modelo,
        raw.model,
        raw.categoria,
        raw.tipo_vehiculo,
        inferVehicleType(item),
      ]
        .filter((value) => typeof value === "string" || typeof value === "number")
        .join(" ");
      return normalizeText(source).includes(query);
    });
  }, [visibleItems, homeSearchTerm]);

  const homeQuickFilteredItems = useMemo(() => {
    if (quickFilters.length === 0) return homeFilteredItems;
    return homeFilteredItems.filter((item) => {
      const key = getVehicleKey(item);
      const vehicleType = inferVehicleType(item);
      const isManual = String((item.raw as Record<string, unknown>).source ?? "") === "manual";
      for (const filter of quickFilters) {
        if (filter === "livianos" && vehicleType !== "livianos") return false;
        if (filter === "pesados" && vehicleType !== "pesados") return false;
        if (filter === "con3d" && !item.view3dUrl) return false;
        if (filter === "conPrecio" && !formatPrice(config.vehiclePrices[key])) return false;
        if (filter === "recientes" && !isRecentAuctionDate(item.auctionDate)) return false;
        if (filter === "manuales" && !isManual) return false;
      }
      return true;
    });
  }, [homeFilteredItems, quickFilters, config.vehiclePrices]);

  const homeVisibleItems = useMemo(() => {
    const sorted = [...homeQuickFilteredItems];
    if (homeSort === "fecha-remate") {
      sorted.sort(
        (a, b) =>
          new Date(b.auctionDate ?? "1900-01-01").getTime() -
          new Date(a.auctionDate ?? "1900-01-01").getTime(),
      );
      return sorted;
    }
    if (homeSort === "precio-asc") {
      sorted.sort(
        (a, b) =>
          getPriceAmount(config.vehiclePrices[getVehicleKey(a)]) -
          getPriceAmount(config.vehiclePrices[getVehicleKey(b)]),
      );
      return sorted;
    }
    if (homeSort === "precio-desc") {
      sorted.sort(
        (a, b) =>
          getPriceAmount(config.vehiclePrices[getVehicleKey(b)]) -
          getPriceAmount(config.vehiclePrices[getVehicleKey(a)]),
      );
      return sorted;
    }
    if (homeSort === "titulo") {
      sorted.sort((a, b) => a.title.localeCompare(b.title, "es"));
      return sorted;
    }
    return sorted;
  }, [homeQuickFilteredItems, homeSort, config.vehiclePrices]);

  const getSectionItems = (sectionId: SectionId, fallback: CatalogItem[]): CatalogItem[] => {
    const selected = config.sectionVehicleIds[sectionId] ?? [];
    if (selected.length === 0) return fallback;
    return selected.map((id) => itemsByKey.get(id)).filter((item): item is CatalogItem => !!item);
  };

  const proximosByKeyword = homeVisibleItems.filter((item) =>
    normalizeText([item.status, item.subtitle, item.title, item.location].filter(Boolean).join(" ")).includes("proxim"),
  );
  const ventasByKeyword = homeVisibleItems.filter((item) =>
    normalizeText([item.status, item.subtitle, item.title].filter(Boolean).join(" ")).includes("venta directa"),
  );
  const novedadesByKeyword = homeVisibleItems.filter((item) =>
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
        items: homeVisibleItems.filter(
          (item) =>
            (config.vehicleUpcomingAuctionIds[getVehicleKey(item)] ?? "") === auction.id,
        ),
      })),
    [sortedUpcomingAuctions, homeVisibleItems, config.vehicleUpcomingAuctionIds],
  );

  const hasUpcomingAuctionCategories =
    sortedUpcomingAuctions.length > 0 &&
    upcomingAuctionGroups.some((group) => group.items.length > 0);

  const proximosRemates = getSectionItems(
    "proximos-remates",
    proximosByKeyword.length > 0
      ? proximosByKeyword.slice(0, 12)
      : sectionFallback(homeVisibleItems, 0, 12),
  );
  const ventasDirectas = getSectionItems(
    "ventas-directas",
    ventasByKeyword.length > 0
      ? ventasByKeyword.slice(0, 12)
      : sectionFallback(homeVisibleItems, 10, 12),
  );
  const novedades = getSectionItems(
    "novedades",
    novedadesByKeyword.length > 0
      ? novedadesByKeyword.slice(0, 12)
      : sectionFallback(homeVisibleItems, 20, 12),
  );
  const catalogoItems = getSectionItems("catalogo", homeVisibleItems);
  const filteredCatalogItems = catalogoItems.filter((item) => inferVehicleType(item) === activeTypeTab);

  const favoritesItems = useMemo(
    () => homeVisibleItems.filter((item) => favoriteKeys.includes(getVehicleKey(item))).slice(0, 12),
    [homeVisibleItems, favoriteKeys],
  );

  const latestItems = useMemo(
    () =>
      [...homeVisibleItems]
        .sort(
          (a, b) =>
            new Date(b.auctionDate ?? "1900-01-01").getTime() -
            new Date(a.auctionDate ?? "1900-01-01").getTime(),
        )
        .slice(0, 6),
    [homeVisibleItems],
  );

  const nextAuction = useMemo(() => {
    const today = new Date();
    const upcoming = sortedUpcomingAuctions
      .map((auction) => ({ auction, date: new Date(auction.date) }))
      .filter((entry) => !Number.isNaN(entry.date.getTime()) && entry.date.getTime() >= today.getTime())
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    return upcoming[0] ?? null;
  }, [sortedUpcomingAuctions]);

  const toggleQuickFilter = (filterId: QuickFilterId) => {
    trackEvent("quick_filter_toggle", { filterId });
    setQuickFilters((prev) => {
      const set = new Set(prev);
      if (set.has(filterId)) set.delete(filterId);
      else set.add(filterId);
      return Array.from(set) as QuickFilterId[];
    });
  };

  const toggleFavorite = (itemKey: string) => {
    trackEvent("favorite_toggle", { itemKey });
    setFavoriteKeys((prev) => {
      const set = new Set(prev);
      if (set.has(itemKey)) set.delete(itemKey);
      else set.add(itemKey);
      return Array.from(set);
    });
  };

  const toggleCompare = (itemKey: string) => {
    trackEvent("compare_toggle", { itemKey });
    setCompareKeys((prev) => {
      const set = new Set(prev);
      if (set.has(itemKey)) {
        set.delete(itemKey);
        return Array.from(set);
      }
      if (set.size >= MAX_COMPARE_ITEMS) return prev;
      set.add(itemKey);
      return Array.from(set);
    });
  };

  const compareItems = useMemo(
    () => homeVisibleItems.filter((item) => compareKeys.includes(getVehicleKey(item))),
    [homeVisibleItems, compareKeys],
  );

  const leadWhatsappUrl = useMemo(() => {
    const base = "https://api.whatsapp.com/send/?phone=56989323397";
    const text = `Hola, soy ${leadForm.name || "cliente"} y me interesa ${leadForm.interest || "recibir asesoría para ofertar"}. Mi contacto: ${leadForm.phone || "sin teléfono"}.`;
    return `${base}&text=${encodeURIComponent(text)}&type=phone_number&app_absent=0`;
  }, [leadForm]);

  const submitLeadForm = () => {
    if (!leadForm.name.trim() || !leadForm.phone.trim()) {
      setLeadMessage("Completa nombre y teléfono para continuar.");
      trackEvent("lead_form_invalid");
      return;
    }
    trackEvent("lead_form_submit", { name: leadForm.name, phone: leadForm.phone, interest: leadForm.interest });
    setLeadMessage("Perfecto. Te estamos redirigiendo a WhatsApp para contacto inmediato.");
    window.open(leadWhatsappUrl, "_blank", "noreferrer");
  };

  const organizationSchema = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "VEDISA REMATES",
      url: "https://vedisaremates.vercel.app",
      logo: "https://vedisaremates.vercel.app/vedisa-logo.png",
      contactPoint: {
        "@type": "ContactPoint",
        telephone: "+56-9-8932-3397",
        contactType: "customer service",
        areaServed: "CL",
        availableLanguage: "es",
      },
      sameAs: ["https://vehiculoschocados.cl/"],
    }),
    [],
  );

  const websiteSchema = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Catálogo VEDISA REMATES",
      url: "https://vedisaremates.vercel.app",
      potentialAction: {
        "@type": "SearchAction",
        target: "https://vedisaremates.vercel.app/?q={search_term_string}",
        "query-input": "required name=search_term_string",
      },
    }),
    [],
  );

  const filteredEditorItems = useMemo(() => {
    const query = normalizeText(searchTerm);
    const source = query
      ? items.filter((item) =>
          normalizeText(`${item.title} ${item.subtitle ?? ""}`).includes(query),
        )
      : items;
    if (!auctionFilterId) return source;
    return source.filter(
      (item) =>
        (config.vehicleUpcomingAuctionIds[getVehicleKey(item)] ?? "") === auctionFilterId,
    );
  }, [items, searchTerm, auctionFilterId, config.vehicleUpcomingAuctionIds]);

  const totalEditorPages = Math.max(1, Math.ceil(filteredEditorItems.length / EDITOR_PAGE_SIZE));
  const currentEditorPage = Math.min(editorPage, totalEditorPages);
  const paginatedEditorItems = useMemo(() => {
    const start = (currentEditorPage - 1) * EDITOR_PAGE_SIZE;
    return filteredEditorItems.slice(start, start + EDITOR_PAGE_SIZE);
  }, [filteredEditorItems, currentEditorPage]);

  const allVisibleChecked =
    filteredEditorItems.length > 0 &&
    filteredEditorItems.every((item) => !mergedHiddenVehicleIds.has(getVehicleKey(item)));
  const allSectionChecked = (sectionId: SectionId) =>
    filteredEditorItems.length > 0 &&
    filteredEditorItems.every((item) =>
      (config.sectionVehicleIds[sectionId] ?? []).includes(getVehicleKey(item)),
    );

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
      const manualPublications = (prev.manualPublications ?? []).map((entry) => {
        if (`manual-${entry.id}` !== itemKey) return entry;
        return { ...entry, visible: set.has(itemKey) ? false : true };
      });
      return { ...prev, hiddenVehicleIds: Array.from(set), manualPublications };
    });
  };

  const toggleAllVisibleInFiltered = () => {
    setConfig((prev) => {
      const hiddenSet = new Set(prev.hiddenVehicleIds);
      const keys = filteredEditorItems.map((item) => getVehicleKey(item));
      const shouldEnableAll = keys.some((key) => hiddenSet.has(key));
      for (const key of keys) {
        if (shouldEnableAll) hiddenSet.delete(key);
        else hiddenSet.add(key);
      }
      const manualPublications = (prev.manualPublications ?? []).map((entry) => {
        const key = `manual-${entry.id}`;
        if (!keys.includes(key)) return entry;
        return { ...entry, visible: shouldEnableAll };
      });
      return {
        ...prev,
        hiddenVehicleIds: Array.from(hiddenSet),
        manualPublications,
      };
    });
  };

  const toggleAllSectionInFiltered = (sectionId: SectionId) => {
    setConfig((prev) => {
      const current = new Set(prev.sectionVehicleIds[sectionId] ?? []);
      const keys = filteredEditorItems.map((item) => getVehicleKey(item));
      const shouldEnableAll = keys.some((key) => !current.has(key));
      for (const key of keys) {
        if (shouldEnableAll) current.add(key);
        else current.delete(key);
      }
      return {
        ...prev,
        sectionVehicleIds: {
          ...prev.sectionVehicleIds,
          [sectionId]: Array.from(current),
        },
      };
    });
  };

  const setPrice = (itemKey: string, value: string) => {
    setConfig((prev) => ({
      ...prev,
      vehiclePrices: { ...prev.vehiclePrices, [itemKey]: value },
    }));
  };

  const setSectionText = (sectionId: SectionId, field: "title" | "subtitle", value: string) => {
    setConfig((prev) => ({
      ...prev,
      sectionTexts: {
        ...prev.sectionTexts,
        [sectionId]: {
          ...prev.sectionTexts[sectionId],
          [field]: value,
        },
      },
    }));
  };

  const setHomeLayout = (
    field: keyof EditorConfig["homeLayout"],
    value: string | boolean | SectionId[],
  ) => {
    setConfig((prev) => ({
      ...prev,
      homeLayout: {
        ...prev.homeLayout,
        [field]: value,
      },
    }));
  };

  const moveSectionOrder = (sectionId: SectionId, direction: "up" | "down") => {
    setConfig((prev) => {
      const order = [...prev.homeLayout.sectionOrder];
      const index = order.indexOf(sectionId);
      if (index < 0) return prev;
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= order.length) return prev;
      const [item] = order.splice(index, 1);
      order.splice(target, 0, item);
      return {
        ...prev,
        homeLayout: {
          ...prev.homeLayout,
          sectionOrder: order,
        },
      };
    });
  };

  const createUpcomingAuction = () => {
    const name = newAuctionName.trim();
    const date = newAuctionDate.trim();
    if (!name || !date) {
      showSystemNotice("error", "Datos incompletos", "Debes completar nombre y fecha del remate.");
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

  const toggleManualDraftSection = (sectionId: SectionId) => {
    setManualDraft((prev) => {
      const set = new Set(prev.sectionIds);
      if (set.has(sectionId)) set.delete(sectionId);
      else set.add(sectionId);
      return { ...prev, sectionIds: Array.from(set) as SectionId[] };
    });
  };

  const uploadManualFiles = async (files: File[]) => {
    const validFiles = files.filter((file) => file.type.startsWith("image/"));
    if (validFiles.length === 0) {
      showSystemNotice("error", "Archivos inválidos", "Selecciona archivos de imagen válidos.");
      return;
    }
    setManualUploading(true);
    try {
      const payload = new FormData();
      for (const file of validFiles) {
        payload.append("files", file);
      }
      const response = await fetch("/api/admin/cloudinary-upload", {
        method: "POST",
        body: payload,
      });
      const body = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        urls?: string[];
        error?: string;
      };
      if (!response.ok || !body.ok) {
        showSystemNotice(
          "error",
          "Error subiendo imágenes",
          body.error ?? "No fue posible subir imágenes a Cloudinary.",
        );
        return;
      }
      const urls = body.urls ?? [];
      setManualUploadedImages((prev) => Array.from(new Set([...prev, ...urls])));
      showSystemNotice("success", "Imágenes cargadas", `${urls.length} imagen(es) subida(s) correctamente.`);
    } finally {
      setManualUploading(false);
      if (manualFileInputRef.current) manualFileInputRef.current.value = "";
    }
  };

  const handleManualDropFiles = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setManualDropActive(false);
    const dropped = Array.from(event.dataTransfer.files ?? []);
    if (dropped.length === 0) return;
    await uploadManualFiles(dropped);
  };

  const reorderManualImage = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    setManualUploadedImages((prev) => {
      const list = [...prev];
      if (fromIndex >= list.length || toIndex >= list.length) return prev;
      const [moved] = list.splice(fromIndex, 1);
      list.splice(toIndex, 0, moved);
      return list;
    });
  };

  const resetManualCreation = () => {
    setManualDraft(EMPTY_MANUAL_PUBLICATION_DRAFT);
    setManualUploadedImages([]);
    setManualDropActive(false);
    setDraggedImageIndex(null);
    setShowManualCreateModal(false);
  };

  const createManualPublication = () => {
    const title = manualDraft.title.trim();
    if (!title) {
      showSystemNotice("error", "Publicación manual", "La publicación manual necesita al menos un título.");
      return;
    }
    const cloudinaryImages = Array.from(
      new Set([...manualUploadedImages, ...normalizeCloudinaryImages(manualDraft.imagesCsv)]),
    );
    if (cloudinaryImages.length === 0) {
      showSystemNotice(
        "error",
        "Imágenes requeridas",
        "Debes ingresar al menos una URL de imagen de Cloudinary.",
      );
      return;
    }
    const id = crypto.randomUUID();
    const sectionIds: SectionId[] =
      manualDraft.sectionIds.length > 0 ? manualDraft.sectionIds : ["catalogo"];
    const manual: ManualPublication = {
      id,
      title,
      subtitle: cleanOptional(manualDraft.subtitle),
      status: cleanOptional(manualDraft.status),
      location: cleanOptional(manualDraft.location),
      lot: cleanOptional(manualDraft.lot),
      auctionDate: cleanOptional(manualDraft.auctionDate),
      description: cleanOptional(manualDraft.description),
      patente: cleanOptional(manualDraft.patente),
      brand: cleanOptional(manualDraft.brand),
      model: cleanOptional(manualDraft.model),
      year: cleanOptional(manualDraft.year),
      category: cleanOptional(manualDraft.category),
      images: cloudinaryImages,
      thumbnail: cleanOptional(manualDraft.thumbnail) ?? cloudinaryImages[0],
      view3dUrl: cleanOptional(manualDraft.view3dUrl),
      sectionIds,
      upcomingAuctionId: cleanOptional(manualDraft.upcomingAuctionId),
      visible: manualDraft.visible,
      price: cleanOptional(manualDraft.price),
    };

    setConfig((prev) => {
      const nextSectionVehicleIds = { ...prev.sectionVehicleIds };
      const itemKey = `manual-${id}`;
      for (const sectionId of sectionIds) {
        const set = new Set(nextSectionVehicleIds[sectionId] ?? []);
        set.add(itemKey);
        nextSectionVehicleIds[sectionId] = Array.from(set);
      }
      const nextHidden = new Set(prev.hiddenVehicleIds);
      if (!manual.visible) nextHidden.add(itemKey);
      const nextVehiclePrices = { ...prev.vehiclePrices };
      if (manual.price) nextVehiclePrices[itemKey] = manual.price;
      const nextVehicleUpcomingAuctionIds = { ...prev.vehicleUpcomingAuctionIds };
      if (manual.upcomingAuctionId) nextVehicleUpcomingAuctionIds[itemKey] = manual.upcomingAuctionId;

      return {
        ...prev,
        sectionVehicleIds: nextSectionVehicleIds,
        hiddenVehicleIds: Array.from(nextHidden),
        vehiclePrices: nextVehiclePrices,
        vehicleUpcomingAuctionIds: nextVehicleUpcomingAuctionIds,
        manualPublications: [...(prev.manualPublications ?? []), manual],
      };
    });

    resetManualCreation();
    showSystemNotice("success", "Unidad creada", "La nueva unidad se agregó correctamente al inventario.");
  };

  const deleteManualPublication = (manualId: string) => {
    const key = `manual-${manualId}`;
    setConfig((prev) => {
      const nextSectionVehicleIds: Record<SectionId, string[]> = {
        "proximos-remates": (prev.sectionVehicleIds["proximos-remates"] ?? []).filter((id) => id !== key),
        "ventas-directas": (prev.sectionVehicleIds["ventas-directas"] ?? []).filter((id) => id !== key),
        novedades: (prev.sectionVehicleIds.novedades ?? []).filter((id) => id !== key),
        catalogo: (prev.sectionVehicleIds.catalogo ?? []).filter((id) => id !== key),
      };
      const nextHidden = prev.hiddenVehicleIds.filter((id) => id !== key);
      const nextPrices = { ...prev.vehiclePrices };
      delete nextPrices[key];
      const nextAssignments = { ...prev.vehicleUpcomingAuctionIds };
      delete nextAssignments[key];

      return {
        ...prev,
        manualPublications: (prev.manualPublications ?? []).filter((entry) => entry.id !== manualId),
        sectionVehicleIds: nextSectionVehicleIds,
        hiddenVehicleIds: nextHidden,
        vehiclePrices: nextPrices,
        vehicleUpcomingAuctionIds: nextAssignments,
      };
    });
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
      showSystemNotice(
        "info",
        "Guardado local activo",
        "Los cambios se guardaron en este navegador. El guardado central en servidor está temporalmente no disponible.",
      );
      return;
    }
    showSystemNotice("success", "Configuración guardada", "Tus cambios se aplicaron correctamente.");
  };

  const login = async () => {
    trackEvent("admin_login_attempt");
    setLoginError("");
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: loginEmail, password: loginPassword }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({ error: "No se pudo iniciar sesión." }))) as { error?: string };
      setLoginError(payload.error ?? "No se pudo iniciar sesión.");
      trackEvent("admin_login_failed");
      return;
    }
    setShowLogin(false);
    setLoginPassword("");
    setIsAdmin(true);
    setAdminView("editor");
    setMobileMenuOpen(false);
    trackEvent("admin_login_success");
  };

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    setIsAdmin(false);
    setAdminView("home");
    setMobileMenuOpen(false);
    trackEvent("admin_logout");
  };

  const showAdminEditor = isAdmin && adminView === "editor";
  const showPublicHome = !isAdmin || adminView === "home";
  const hasActiveSearch = homeSearchTerm.trim().length > 0;

  const editingItem = editingVehicleKey ? itemsByKey.get(editingVehicleKey) ?? null : null;

  return (
    <main className="premium-bg min-h-screen text-slate-900">
      <div className="premium-glow premium-glow-cyan" />
      <div className="premium-glow premium-glow-gold" />
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
      />

      <section className="sticky top-0 z-30 border-b border-cyan-100/80 bg-white/88 shadow-[0_8px_24px_rgba(87,141,167,0.08)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 md:py-4 lg:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <Link
              href="/"
              className="inline-flex"
              onClick={(event) => {
                if (isAdmin && adminView === "editor") {
                  event.preventDefault();
                  setAdminView("home");
                }
                setMobileMenuOpen(false);
              }}
            >
              <Image
                src="/vedisa-logo.png"
                alt="Logo Vedisa Remates"
                width={260}
                height={54}
                priority
                className="h-auto w-full max-w-[240px] sm:max-w-[260px] md:max-w-[280px]"
              />
            </Link>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="ui-focus inline-flex items-center justify-center self-end rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-700 md:hidden"
              aria-label="Abrir menú"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-main-menu"
            >
              <span className="text-lg leading-none">{mobileMenuOpen ? "×" : "☰"}</span>
            </button>
            <div className="hidden items-center gap-2 md:flex">
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
                <>
                  {adminView === "editor" ? (
                    <button
                      className="ui-focus rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-100"
                      onClick={() => setAdminView("home")}
                    >
                      Ver home
                    </button>
                  ) : (
                    <button
                      className="ui-focus rounded-full border border-cyan-300 bg-cyan-50 px-3 py-1 text-xs text-cyan-700 transition hover:-translate-y-0.5 hover:bg-cyan-100"
                      onClick={() => setAdminView("editor")}
                    >
                      Volver al editor
                    </button>
                  )}
                  <button className="ui-focus rounded-full bg-slate-900 px-3 py-1 text-xs text-white transition hover:-translate-y-0.5 hover:bg-slate-700" onClick={logout}>
                    Salir editor
                  </button>
                </>
              ) : (
                <button className="ui-focus rounded-full bg-cyan-600 px-3 py-1 text-xs text-white transition hover:-translate-y-0.5 hover:bg-cyan-500" onClick={() => { setShowLogin(true); trackEvent("login_modal_open"); }}>
                  Login
                </button>
              )}
            </div>
          </div>
          {mobileMenuOpen ? (
            <div id="mobile-main-menu" className="rounded-lg border border-slate-200 bg-white p-3 md:hidden">
              <nav className="flex flex-col gap-2 text-sm">
                <a href="#proximos-remates" className="premium-link-pill ui-focus text-center" onClick={() => setMobileMenuOpen(false)}>
                  Proximos remates
                </a>
                <a href="#ventas-directas" className="premium-link-pill ui-focus text-center" onClick={() => setMobileMenuOpen(false)}>
                  Ventas directas
                </a>
                <a href="#novedades" className="premium-link-pill ui-focus text-center" onClick={() => setMobileMenuOpen(false)}>
                  Novedades
                </a>
                <a href="#catalogo" className="premium-link-pill ui-focus text-center" onClick={() => setMobileMenuOpen(false)}>
                  Catalogo
                </a>
              </nav>
              <div className="mt-3 flex flex-wrap gap-2">
                {isAdmin ? (
                  <>
                    {adminView === "editor" ? (
                      <button
                        className="ui-focus flex-1 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700"
                        onClick={() => {
                          setAdminView("home");
                          setMobileMenuOpen(false);
                        }}
                      >
                        Ver home
                      </button>
                    ) : (
                      <button
                        className="ui-focus flex-1 rounded-full border border-cyan-300 bg-cyan-50 px-3 py-1 text-xs text-cyan-700"
                        onClick={() => {
                          setAdminView("editor");
                          setMobileMenuOpen(false);
                        }}
                      >
                        Volver al editor
                      </button>
                    )}
                    <button className="ui-focus flex-1 rounded-full bg-slate-900 px-3 py-1 text-xs text-white" onClick={logout}>
                      Salir editor
                    </button>
                  </>
                ) : (
                  <button className="ui-focus w-full rounded-full bg-cyan-600 px-3 py-1 text-xs text-white" onClick={() => { setShowLogin(true); setMobileMenuOpen(false); trackEvent("login_modal_open"); }}>
                    Login
                  </button>
                )}
              </div>
            </div>
          ) : null}
          {feed.warning ? (
            <p className="rounded-md border border-amber-300/60 bg-amber-100 px-3 py-2 text-sm text-amber-900">{feed.warning}</p>
          ) : null}
        </div>
      </section>

      {showAdminEditor ? (
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
            <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
              {([
                ["vehiculos", "1. Inventario"],
                ["categorias", "2. Editar categorías"],
                ["layout", "3. Editar layout home"],
              ] as Array<[AdminTabId, string]>).map(([tabId, label]) => (
                <button
                  key={tabId}
                  type="button"
                  onClick={() => setAdminTab(tabId)}
                  className={`ui-focus rounded-full px-3 py-1 text-xs font-semibold transition ${
                    adminTab === tabId
                      ? "bg-cyan-600 text-white"
                      : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {adminTab === "vehiculos" ? (
              <>
                <div className="grid gap-2 sm:grid-cols-3">
                  <input
                    value={searchTerm}
                    onChange={(event) => {
                      setSearchTerm(event.target.value);
                      setEditorPage(1);
                    }}
                    placeholder="Buscar vehículo para editar..."
                    className="ui-focus w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                  />
                  <select
                    value={auctionFilterId}
                    onChange={(event) => {
                      setAuctionFilterId(event.target.value);
                      setEditorPage(1);
                    }}
                    className="ui-focus rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">Todos los remates</option>
                    {sortedUpcomingAuctions.map((auction) => (
                      <option key={auction.id} value={auction.id}>
                        {auction.name} ({formatAuctionDateLabel(auction.date)})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowManualCreateModal(true)}
                    className="ui-focus inline-flex items-center justify-center gap-2 rounded-md border border-cyan-300 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-700 transition hover:bg-cyan-100"
                  >
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-cyan-600 text-xs text-white">+</span>
                    Agregar nueva unidad
                  </button>
                </div>
                <div className="max-h-[70vh] overflow-auto rounded-lg border border-slate-200">
                  <div className="sticky top-0 z-10 grid grid-cols-14 items-center gap-2 border-b border-slate-200 bg-slate-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                    <div className="col-span-2">Patente</div>
                    <div className="col-span-3">Modelo vehículo</div>
                    <button type="button" onClick={toggleAllVisibleInFiltered} className="col-span-1 text-center text-cyan-700 hover:underline">
                      Visible {allVisibleChecked ? "✓" : ""}
                    </button>
                    <button type="button" onClick={() => toggleAllSectionInFiltered("ventas-directas")} className="col-span-1 text-center text-cyan-700 hover:underline">
                      V. Directa {allSectionChecked("ventas-directas") ? "✓" : ""}
                    </button>
                    <button type="button" onClick={() => toggleAllSectionInFiltered("novedades")} className="col-span-1 text-center text-cyan-700 hover:underline">
                      Novedad {allSectionChecked("novedades") ? "✓" : ""}
                    </button>
                    <button type="button" onClick={() => toggleAllSectionInFiltered("catalogo")} className="col-span-1 text-center text-cyan-700 hover:underline">
                      Catálogo {allSectionChecked("catalogo") ? "✓" : ""}
                    </button>
                    <div className="col-span-3">Remate asignado</div>
                    <div className="col-span-1">Precio</div>
                    <div className="col-span-1 text-center">Detalle</div>
                  </div>
                  {paginatedEditorItems.map((item) => {
                    const key = getVehicleKey(item);
                      const hidden = mergedHiddenVehicleIds.has(key);
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
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => openDetailsEditor(item)}
                              className="ui-focus rounded border border-cyan-300 bg-cyan-50 px-2 py-1 text-[11px] font-semibold text-cyan-700 transition hover:bg-cyan-100"
                            >
                              Editar
                            </button>
                            {key.startsWith("manual-") ? (
                              <button
                                type="button"
                                onClick={() => deleteManualPublication(key.replace("manual-", ""))}
                                className="ui-focus rounded border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100"
                              >
                                Borrar
                              </button>
                            ) : null}
                          </div>
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
              </>
            ) : null}

            {adminTab === "categorias" ? (
              <div className="space-y-4">
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
                            <span className="text-slate-500">({count} asignados)</span>
                            <button
                              type="button"
                              onClick={() => {
                                setAuctionFilterId(auction.id);
                                setAdminTab("vehiculos");
                              }}
                              className="ui-focus rounded bg-cyan-50 px-2 py-0.5 text-cyan-700"
                            >
                              Ver vehículos
                            </button>
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
                <div className="grid gap-3 md:grid-cols-2">
                  {(["proximos-remates", "ventas-directas", "novedades", "catalogo"] as SectionId[]).map((sectionId) => (
                    <div key={sectionId} className="rounded-xl border border-slate-200 bg-white p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{SECTION_LABELS[sectionId]}</p>
                      <input
                        value={config.sectionTexts[sectionId]?.title ?? ""}
                        onChange={(event) => setSectionText(sectionId, "title", event.target.value)}
                        placeholder="Título sección"
                        className="ui-focus mb-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                      />
                      <input
                        value={config.sectionTexts[sectionId]?.subtitle ?? ""}
                        onChange={(event) => setSectionText(sectionId, "subtitle", event.target.value)}
                        placeholder="Subtítulo sección"
                        className="ui-focus w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {adminTab === "layout" ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Textos hero</p>
                  <div className="grid gap-2">
                    <input
                      value={config.homeLayout.heroKicker}
                      onChange={(event) => setHomeLayout("heroKicker", event.target.value)}
                      placeholder="Kicker"
                      className="ui-focus rounded-md border border-slate-200 px-3 py-2 text-sm"
                    />
                    <input
                      value={config.homeLayout.heroTitle}
                      onChange={(event) => setHomeLayout("heroTitle", event.target.value)}
                      placeholder="Título principal"
                      className="ui-focus rounded-md border border-slate-200 px-3 py-2 text-sm"
                    />
                    <textarea
                      value={config.homeLayout.heroDescription}
                      onChange={(event) => setHomeLayout("heroDescription", event.target.value)}
                      placeholder="Descripción hero"
                      className="ui-focus min-h-24 rounded-md border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Bloques home</p>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={config.homeLayout.showFeaturedStrip}
                        onChange={(event) => setHomeLayout("showFeaturedStrip", event.target.checked)}
                      />
                      Mostrar vitrina destacada
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={config.homeLayout.showCommercialPanel}
                        onChange={(event) => setHomeLayout("showCommercialPanel", event.target.checked)}
                      />
                      Mostrar panel comercial derecho
                    </label>
                  </div>
                  <p className="mt-3 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Orden de secciones</p>
                  <div className="space-y-2">
                    {config.homeLayout.sectionOrder.map((sectionId) => (
                      <div key={sectionId} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm">
                        <span>{SECTION_LABELS[sectionId]}</span>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => moveSectionOrder(sectionId, "up")} className="ui-focus rounded border border-slate-300 px-2 py-1 text-xs">Subir</button>
                          <button type="button" onClick={() => moveSectionOrder(sectionId, "down")} className="ui-focus rounded border border-slate-300 px-2 py-1 text-xs">Bajar</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {showPublicHome ? (
        <>
      <section className="relative z-10 mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <div className="glass-soft rounded-xl p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <input
              value={homeSearchTerm}
              onChange={(event) => {
                setHomeSearchTerm(event.target.value);
                trackEvent("home_search_change", { query: event.target.value });
              }}
              placeholder="Buscar por patente, marca, modelo o categoría..."
              className="ui-focus w-full rounded-md border border-cyan-200 bg-white px-3 py-2 text-sm sm:max-w-xl"
              aria-label="Buscar vehículos por patente, marca, modelo o categoría"
            />
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600">
                {homeVisibleItems.length} resultado(s)
              </span>
              {homeSearchTerm ? (
                <button
                  type="button"
                  onClick={() => {
                    setHomeSearchTerm("");
                    trackEvent("home_search_clear");
                  }}
                  className="ui-focus rounded border border-slate-300 px-2 py-1 text-xs text-slate-700"
                >
                  Limpiar
                </button>
              ) : null}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {Object.entries(QUICK_FILTER_LABELS).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => toggleQuickFilter(id as QuickFilterId)}
                className={`ui-focus rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  quickFilters.includes(id as QuickFilterId)
                    ? "border-cyan-500 bg-cyan-600 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {label}
              </button>
            ))}
            <select
              value={homeSort}
              onChange={(event) => {
                setHomeSort(event.target.value as SortOption);
                trackEvent("home_sort_change", { sort: event.target.value });
              }}
              className="ui-focus ml-auto rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
              aria-label="Ordenar resultados del catálogo"
            >
              <option value="relevancia">Orden: Relevancia</option>
              <option value="fecha-remate">Orden: Fecha remate</option>
              <option value="precio-asc">Orden: Precio menor</option>
              <option value="precio-desc">Orden: Precio mayor</option>
              <option value="titulo">Orden: Título A-Z</option>
            </select>
          </div>
        </div>
      </section>
      <div
        className={`transition-all duration-500 ease-out ${
          hasActiveSearch
            ? "pointer-events-none max-h-0 -translate-y-2 overflow-hidden opacity-0"
            : "max-h-[1200px] translate-y-0 opacity-100"
        }`}
      >
        <section className="relative z-10 mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-12 lg:px-8">
          <div className={`${config.homeLayout.showCommercialPanel ? "lg:col-span-8" : "lg:col-span-12"} premium-panel premium-panel-hero`}>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">{config.homeLayout.heroKicker}</p>
            <h1 className="mt-3 text-3xl font-black leading-tight text-slate-900 md:text-5xl">
              {config.homeLayout.heroTitle}
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-slate-600 md:text-[15px]">
              {config.homeLayout.heroDescription}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700">Visor 3D</span>
              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700">Agenda por remate</span>
              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700">Contacto inmediato</span>
            </div>
            <div className="mt-6 flex flex-wrap gap-3 border-t border-cyan-100 pt-5">
              <a href="#catalogo" className="premium-btn-primary ui-focus">Ver catálogo completo</a>
              <a href="#proximos-remates" className="premium-btn-secondary ui-focus">Explorar secciones</a>
            </div>
            {nextAuction ? (
              <div className="mt-5 inline-flex w-fit items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-semibold text-indigo-800">
                <span>Próximo remate:</span>
                <span>{nextAuction.auction.name}</span>
                <span>·</span>
                <span>{formatAuctionDateLabel(nextAuction.auction.date)}</span>
              </div>
            ) : null}
          </div>
          {config.homeLayout.showCommercialPanel ? (
          <div className="premium-panel lg:col-span-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Información comercial</p>
            <div className="mt-4 space-y-3">
              <div className="info-tile">
                <p className="text-[11px] uppercase tracking-widest text-slate-500">📍 Exhibición presencial</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">Arturo Prat 6457, Noviciado, Pudahuel</p>
              </div>
              <div className="info-tile">
                <p className="text-[11px] uppercase tracking-widest text-slate-500">🕒 Horario</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">Lunes a Viernes 9:00 - 13:00 / 14:00 - 17:00</p>
              </div>
              <div className="info-tile">
                <p className="text-[11px] uppercase tracking-widest text-slate-500">💻 Remates 100% online</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">Plataforma pública con registro multimedia 3D, trazabilidad y soporte de contact center</p>
              </div>
              <div className="info-tile">
                <p className="text-[11px] uppercase tracking-widest text-slate-500">🏢 Oficinas</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">Américo Vespucio 2880, Piso 7</p>
              </div>
            </div>
          </div>
          ) : null}
        </section>
      </div>

      <div className="relative z-10 mx-auto flex max-w-7xl flex-col gap-14 px-4 pb-14 sm:px-6 lg:px-8">
        <section
          className={`section-shell transition-all duration-500 ease-out ${
            hasActiveSearch
              ? "pointer-events-none max-h-0 -translate-y-2 overflow-hidden opacity-0"
              : "max-h-[480px] translate-y-0 opacity-100"
          }`}
        >
          <div className="mb-4">
            <p className="premium-kicker">Cómo participar</p>
            <h2 className="text-2xl font-bold text-slate-900">Compra en 3 pasos</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              ["1", "Regístrate", "Crea tu cuenta en vehiculoschocados.cl en pocos minutos."],
              ["2", "Activa garantía", "Gestiona tu garantía para habilitar ofertas seguras."],
              ["3", "Oferta y adjudica", "Participa online con seguimiento comercial de VEDISA."],
            ].map(([step, title, description]) => (
              <div key={step} className="rounded-xl border border-cyan-100 bg-white p-4">
                <p className="text-xs font-bold text-cyan-700">Paso {step}</p>
                <h3 className="mt-1 text-base font-semibold text-slate-900">{title}</h3>
                <p className="mt-1 text-sm text-slate-600">{description}</p>
              </div>
            ))}
          </div>
        </section>
        {config.homeLayout.showFeaturedStrip ? (
          <FeaturedStrip items={homeVisibleItems.slice(0, 8)} onOpenVehicle={setSelectedVehicle} />
        ) : null}
        {favoritesItems.length > 0 ? (
          <section className="section-shell">
            <header className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="premium-kicker">Guardados</p>
                <h2 className="text-2xl font-bold text-slate-900">Tus favoritos</h2>
              </div>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                {favoritesItems.length} guardados
              </span>
            </header>
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {favoritesItems.map((item) => (
                <CatalogCard
                  key={`favorite-${item.id}`}
                  item={item}
                  priceLabel={formatPrice(config.vehiclePrices[getVehicleKey(item)])}
                  upcomingAuctionLabel={upcomingAuctionByVehicleKey[getVehicleKey(item)]}
                  onOpen={() => setSelectedVehicle(item)}
                  isFavorite={favoriteKeys.includes(getVehicleKey(item))}
                  onToggleFavorite={() => toggleFavorite(getVehicleKey(item))}
                  isCompared={compareKeys.includes(getVehicleKey(item))}
                  onToggleCompare={() => toggleCompare(getVehicleKey(item))}
                  onWhatsappClick={() =>
                    trackEvent("whatsapp_click_card", {
                      section: "favoritos",
                      itemKey: getVehicleKey(item),
                    })
                  }
                />
              ))}
            </div>
          </section>
        ) : null}
        {latestItems.length > 0 ? (
          <section className="section-shell">
            <header className="mb-4">
              <p className="premium-kicker">Nuevas publicaciones</p>
              <h2 className="text-2xl font-bold text-slate-900">Recién publicados</h2>
            </header>
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {latestItems.map((item) => (
                <CatalogCard
                  key={`latest-${item.id}`}
                  item={item}
                  priceLabel={formatPrice(config.vehiclePrices[getVehicleKey(item)])}
                  upcomingAuctionLabel={upcomingAuctionByVehicleKey[getVehicleKey(item)]}
                  onOpen={() => setSelectedVehicle(item)}
                  isFavorite={favoriteKeys.includes(getVehicleKey(item))}
                  onToggleFavorite={() => toggleFavorite(getVehicleKey(item))}
                  isCompared={compareKeys.includes(getVehicleKey(item))}
                  onToggleCompare={() => toggleCompare(getVehicleKey(item))}
                  onWhatsappClick={() =>
                    trackEvent("whatsapp_click_card", {
                      section: "recien-publicados",
                      itemKey: getVehicleKey(item),
                    })
                  }
                />
              ))}
            </div>
          </section>
        ) : null}
        {config.homeLayout.sectionOrder.map((sectionId) => {
          if (sectionId === "proximos-remates") {
            return hasUpcomingAuctionCategories ? (
              <UpcomingAuctionsSection
                key="public-proximos-auctions"
                groups={upcomingAuctionGroups}
                priceMap={config.vehiclePrices}
                upcomingAuctionByVehicleKey={upcomingAuctionByVehicleKey}
                favoriteKeys={favoriteKeys}
                onToggleFavorite={toggleFavorite}
                compareKeys={compareKeys}
                onToggleCompare={toggleCompare}
                onOpenVehicle={setSelectedVehicle}
              />
            ) : (
              <Section
                key="public-proximos-fallback"
                id="proximos-remates"
                title={config.sectionTexts["proximos-remates"].title}
                subtitle={config.sectionTexts["proximos-remates"].subtitle}
                items={proximosRemates}
                priceMap={config.vehiclePrices}
                upcomingAuctionByVehicleKey={upcomingAuctionByVehicleKey}
                favoriteKeys={favoriteKeys}
                onToggleFavorite={toggleFavorite}
                compareKeys={compareKeys}
                onToggleCompare={toggleCompare}
                onOpenVehicle={setSelectedVehicle}
              />
            );
          }
          if (sectionId === "ventas-directas") {
            return (
              <Section
                key="public-ventas-directas"
                id="ventas-directas"
                title={config.sectionTexts["ventas-directas"].title}
                subtitle={config.sectionTexts["ventas-directas"].subtitle}
                items={ventasDirectas}
                priceMap={config.vehiclePrices}
                upcomingAuctionByVehicleKey={upcomingAuctionByVehicleKey}
                favoriteKeys={favoriteKeys}
                onToggleFavorite={toggleFavorite}
                compareKeys={compareKeys}
                onToggleCompare={toggleCompare}
                onOpenVehicle={setSelectedVehicle}
              />
            );
          }
          if (sectionId === "novedades") {
            return (
              <Section
                key="public-novedades"
                id="novedades"
                title={config.sectionTexts.novedades.title}
                subtitle={config.sectionTexts.novedades.subtitle}
                items={novedades}
                priceMap={config.vehiclePrices}
                upcomingAuctionByVehicleKey={upcomingAuctionByVehicleKey}
                favoriteKeys={favoriteKeys}
                onToggleFavorite={toggleFavorite}
                compareKeys={compareKeys}
                onToggleCompare={toggleCompare}
                onOpenVehicle={setSelectedVehicle}
              />
            );
          }
          return (
            <section key="public-catalogo" id="catalogo" className="section-shell scroll-mt-24">
              <header className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="premium-kicker">Catálogo</p>
                  <h2 className="text-2xl font-bold text-slate-900">{config.sectionTexts.catalogo.title}</h2>
                  <p className="mt-1 text-sm text-slate-600">{config.sectionTexts.catalogo.subtitle}</p>
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
                      isFavorite={favoriteKeys.includes(getVehicleKey(item))}
                      onToggleFavorite={() => toggleFavorite(getVehicleKey(item))}
                      isCompared={compareKeys.includes(getVehicleKey(item))}
                      onToggleCompare={() => toggleCompare(getVehicleKey(item))}
                      onWhatsappClick={() =>
                        trackEvent("whatsapp_click_card", {
                          section: "catalogo",
                          itemKey: getVehicleKey(item),
                        })
                      }
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
      <section className="relative z-10 mx-auto mb-14 grid max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
        <div className="section-shell">
          <p className="premium-kicker">Confianza VEDISA</p>
          <h2 className="text-2xl font-bold text-slate-900">Experiencia respaldada</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              ["+40 años de experiencia", "Trayectoria especializada en subastas de vehículos de todo tipo y condición."],
              ["+2.500 vehículos al mes", "Capacidad operativa para alto volumen con procesos estandarizados y ágiles."],
              ["+150 clientes satisfechos", "Relaciones de largo plazo con foco en transparencia y recupero."],
              ["Transferencia en 72 horas", "Gestión administrativa orientada a reducir tiempos y acelerar liquidez."],
            ].map(([title, text]) => (
              <div key={title} className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
                <p className="mt-1 text-sm text-slate-600">{text}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="section-shell">
          <p className="premium-kicker">Preguntas frecuentes</p>
          <h2 className="text-2xl font-bold text-slate-900">Resuelve dudas rápidas</h2>
          <div className="mt-4 space-y-2">
            {[
              ["¿Cómo oferto en un remate?", "Regístrate, activa garantía y participa online en la fecha de remate."],
              ["¿Puedo revisar vehículos antes?", "Sí. Puedes visitar la exhibición presencial para inspección pre-compra."],
              ["¿Todos los vehículos tienen visor 3D?", "No todos, pero los que lo tienen aparecen marcados como 3D."],
              ["¿Dónde recibo apoyo comercial?", "Nuestro equipo responde por WhatsApp, correo y canales oficiales de VEDISA."],
            ].map(([question, answer]) => (
              <details key={question} className="rounded-lg border border-slate-200 bg-white p-3">
                <summary className="cursor-pointer text-sm font-semibold text-slate-900">{question}</summary>
                <p className="mt-2 text-sm text-slate-600">{answer}</p>
              </details>
            ))}
          </div>
          <div className="mt-4 rounded-lg border border-cyan-200 bg-cyan-50/70 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-800">Contacto comercial</p>
            <p className="mt-1 text-sm text-slate-700">
              Ignacio Rodriguez Yanine · Gerente Comercial ·
              {" "}
              <a href="mailto:irodriguez@vedisaremates.cl" className="ui-focus text-cyan-700 underline">
                irodriguez@vedisaremates.cl
              </a>
            </p>
            <p className="mt-1 text-sm text-slate-700">
              Tasaciones:
              {" "}
              <a href="mailto:tasaciones@vedisaremates.cl" className="ui-focus text-cyan-700 underline">
                tasaciones@vedisaremates.cl
              </a>
              {" "}· Retiros:
              {" "}
              <a href="mailto:retiros@vedisaremates.cl" className="ui-focus text-cyan-700 underline">
                retiros@vedisaremates.cl
              </a>
            </p>
          </div>
        </div>
      </section>
      <section className="relative z-10 mx-auto mb-14 max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="section-shell">
          <p className="premium-kicker">Asesoría personalizada</p>
          <h2 className="text-2xl font-bold text-slate-900">Te ayudamos a encontrar tu próxima unidad</h2>
          <p className="mt-2 text-sm text-slate-600">
            Déjanos tus datos y te contactamos por WhatsApp para guiarte en el proceso de oferta.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <input
              value={leadForm.name}
              onChange={(event) =>
                setLeadForm((prev) => ({ ...prev, name: event.target.value }))
              }
              className="ui-focus rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              placeholder="Nombre"
              aria-label="Nombre de contacto"
            />
            <input
              value={leadForm.phone}
              onChange={(event) =>
                setLeadForm((prev) => ({ ...prev, phone: event.target.value }))
              }
              className="ui-focus rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              placeholder="Teléfono"
              aria-label="Teléfono de contacto"
            />
            <input
              value={leadForm.interest}
              onChange={(event) =>
                setLeadForm((prev) => ({ ...prev, interest: event.target.value }))
              }
              className="ui-focus rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              placeholder="¿Qué vehículo buscas?"
              aria-label="Interés de vehículo"
            />
            <button
              type="button"
              onClick={submitLeadForm}
              className="ui-focus rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500"
            >
              Solicitar asesoría
            </button>
          </div>
          {leadMessage ? <p className="mt-2 text-xs font-semibold text-cyan-700">{leadMessage}</p> : null}
        </div>
      </section>

      {selectedVehicle ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4" onClick={() => setSelectedVehicle(null)}>
          <div role="dialog" aria-modal="true" aria-label={`Detalle de ${selectedVehicle.title}`} className="max-h-[92vh] w-full max-w-6xl overflow-auto rounded-2xl bg-white p-4 shadow-2xl md:p-6" onClick={(event) => event.stopPropagation()}>
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
            <div className="mt-4">
              <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Vehículos similares</h4>
              <div className="grid gap-3 md:grid-cols-3">
                {homeVisibleItems
                  .filter(
                    (item) =>
                      getVehicleKey(item) !== getVehicleKey(selectedVehicle) &&
                      inferVehicleType(item) === inferVehicleType(selectedVehicle),
                  )
                  .slice(0, 3)
                  .map((item) => (
                    <button
                      key={`similar-${item.id}`}
                      type="button"
                      onClick={() => setSelectedVehicle(item)}
                      className="ui-focus rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-cyan-300 hover:bg-cyan-50/30"
                    >
                      <p className="line-clamp-1 text-sm font-semibold text-slate-900">{item.title}</p>
                      <p className="line-clamp-1 text-xs text-slate-600">{item.subtitle ?? "Vehículo relacionado"}</p>
                    </button>
                  ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
        </>
      ) : null}

      {showPublicHome && compareItems.length > 0 ? (
        <div className="fixed bottom-4 left-4 z-40 flex items-center gap-2 rounded-full border border-indigo-200 bg-white px-3 py-2 shadow-lg">
          <span className="text-xs font-semibold text-indigo-700">
            Comparador: {compareItems.length}/{MAX_COMPARE_ITEMS}
          </span>
          <button
            type="button"
            onClick={() => {
              setShowComparePanel(true);
              trackEvent("compare_panel_open", { count: compareItems.length });
            }}
            className="ui-focus rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white"
          >
            Ver comparación
          </button>
          <button
            type="button"
            onClick={() => {
              setCompareKeys([]);
              trackEvent("compare_clear");
            }}
            className="ui-focus rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-600"
          >
            Limpiar
          </button>
        </div>
      ) : null}

      {showComparePanel ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/70 p-4" onClick={() => setShowComparePanel(false)}>
          <div role="dialog" aria-modal="true" aria-label="Comparador de vehículos" className="max-h-[92vh] w-full max-w-6xl overflow-auto rounded-2xl bg-white p-4 shadow-2xl md:p-6" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold text-slate-900">Comparador de vehículos</h3>
              <button
                type="button"
                className="ui-focus rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-600"
                onClick={() => setShowComparePanel(false)}
              >
                Cerrar
              </button>
            </div>
            {compareItems.length === 0 ? (
              <p className="text-sm text-slate-600">No hay vehículos seleccionados para comparar.</p>
            ) : (
              <div className="overflow-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="px-3 py-2 text-xs font-semibold uppercase text-slate-500">Campo</th>
                      {compareItems.map((item) => (
                        <th key={`cmp-head-${item.id}`} className="px-3 py-2 text-xs font-semibold uppercase text-slate-700">
                          {item.title}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["Patente", (item: CatalogItem) => getPatent(item)],
                      ["Marca", (item: CatalogItem) => String((item.raw as Record<string, unknown>).marca ?? (item.raw as Record<string, unknown>).brand ?? "—")],
                      ["Modelo", (item: CatalogItem) => getModel(item)],
                      ["Año", (item: CatalogItem) => String((item.raw as Record<string, unknown>).ano ?? (item.raw as Record<string, unknown>).anio ?? (item.raw as Record<string, unknown>).year ?? "—")],
                      ["Estado", (item: CatalogItem) => item.status ?? "Disponible"],
                      ["Ubicación", (item: CatalogItem) => item.location ?? "—"],
                      ["Remate", (item: CatalogItem) => upcomingAuctionByVehicleKey[getVehicleKey(item)] ?? "Sin asignar"],
                      ["Precio", (item: CatalogItem) => formatPrice(config.vehiclePrices[getVehicleKey(item)]) ?? "No informado"],
                      ["Tiene 3D", (item: CatalogItem) => (item.view3dUrl ? "Sí" : "No")],
                    ].map(([label, resolver]) => (
                      <tr key={String(label)} className="border-t border-slate-200">
                        <td className="px-3 py-2 font-semibold text-slate-700">{String(label)}</td>
                        {compareItems.map((item) => (
                          <td key={`cmp-${label}-${item.id}`} className="px-3 py-2 text-slate-600">
                            {(resolver as (value: CatalogItem) => string)(item)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {showManualCreateModal ? (
        <div
          className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-900/70 p-4"
          onClick={resetManualCreation}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Crear nueva unidad manual"
            className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Agregar nueva unidad al inventario</h3>
                <p className="text-xs text-slate-500">
                  Carga imágenes desde tu PC (drag & drop o selección múltiple) y crea la publicación manual.
                </p>
              </div>
              <button
                type="button"
                onClick={resetManualCreation}
                className="ui-focus rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 transition hover:bg-slate-50"
              >
                Cerrar
              </button>
            </div>

            <div className="space-y-4">
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setManualDropActive(true);
                }}
                onDragLeave={() => setManualDropActive(false)}
                onDrop={(event) => {
                  void handleManualDropFiles(event);
                }}
                className={`rounded-xl border-2 border-dashed p-4 text-center transition ${
                  manualDropActive
                    ? "border-cyan-500 bg-cyan-50"
                    : "border-cyan-200 bg-slate-50"
                }`}
              >
                <p className="text-sm font-semibold text-slate-700">
                  Arrastra aquí múltiples fotos para subirlas a Cloudinary
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  También puedes seleccionar muchas fotos desde tu equipo.
                </p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => manualFileInputRef.current?.click()}
                    disabled={manualUploading}
                    className="ui-focus rounded-md bg-cyan-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-60"
                  >
                    {manualUploading ? "Subiendo..." : "Seleccionar fotos"}
                  </button>
                  <input
                    ref={manualFileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? []);
                      void uploadManualFiles(files);
                    }}
                  />
                </div>
              </div>

              {manualUploadedImages.length > 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Imágenes subidas (arrastra para ordenar)
                  </p>
                  <div className="grid gap-2 sm:grid-cols-3 md:grid-cols-4">
                    {manualUploadedImages.map((imageUrl, index) => (
                      <div
                        key={`${imageUrl}-${index}`}
                        draggable
                        onDragStart={() => setDraggedImageIndex(index)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => {
                          if (draggedImageIndex === null) return;
                          reorderManualImage(draggedImageIndex, index);
                          setDraggedImageIndex(null);
                        }}
                        className="group relative overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={imageUrl} alt={`Imagen ${index + 1}`} className="h-24 w-full object-cover" />
                        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/50 px-2 py-1 text-[10px] text-white">
                          <span>#{index + 1}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setManualUploadedImages((prev) => prev.filter((_, imageIndex) => imageIndex !== index))
                            }
                            className="ui-focus rounded bg-white/20 px-1.5 py-0.5"
                          >
                            Quitar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="grid gap-2 md:grid-cols-2">
                <input
                  value={manualDraft.title}
                  onChange={(event) => setManualDraft((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="Título publicación"
                  className="ui-focus rounded-md border border-cyan-200 bg-white px-3 py-2 text-sm"
                />
                <input
                  value={manualDraft.subtitle}
                  onChange={(event) => setManualDraft((prev) => ({ ...prev, subtitle: event.target.value }))}
                  placeholder="Subtítulo"
                  className="ui-focus rounded-md border border-cyan-200 bg-white px-3 py-2 text-sm"
                />
                <input
                  value={manualDraft.patente}
                  onChange={(event) => setManualDraft((prev) => ({ ...prev, patente: event.target.value }))}
                  placeholder="Patente"
                  className="ui-focus rounded-md border border-cyan-200 bg-white px-3 py-2 text-sm"
                />
                <input
                  value={manualDraft.brand}
                  onChange={(event) => setManualDraft((prev) => ({ ...prev, brand: event.target.value }))}
                  placeholder="Marca"
                  className="ui-focus rounded-md border border-cyan-200 bg-white px-3 py-2 text-sm"
                />
                <input
                  value={manualDraft.model}
                  onChange={(event) => setManualDraft((prev) => ({ ...prev, model: event.target.value }))}
                  placeholder="Modelo"
                  className="ui-focus rounded-md border border-cyan-200 bg-white px-3 py-2 text-sm"
                />
                <input
                  value={manualDraft.year}
                  onChange={(event) => setManualDraft((prev) => ({ ...prev, year: event.target.value }))}
                  placeholder="Año"
                  className="ui-focus rounded-md border border-cyan-200 bg-white px-3 py-2 text-sm"
                />
                <input
                  value={manualDraft.price}
                  onChange={(event) => setManualDraft((prev) => ({ ...prev, price: event.target.value }))}
                  placeholder="Precio CLP"
                  className="ui-focus rounded-md border border-cyan-200 bg-white px-3 py-2 text-sm"
                />
                <input
                  value={manualDraft.auctionDate}
                  onChange={(event) => setManualDraft((prev) => ({ ...prev, auctionDate: event.target.value }))}
                  placeholder="Fecha (YYYY-MM-DD)"
                  className="ui-focus rounded-md border border-cyan-200 bg-white px-3 py-2 text-sm"
                />
                <input
                  value={manualDraft.location}
                  onChange={(event) => setManualDraft((prev) => ({ ...prev, location: event.target.value }))}
                  placeholder="Ubicación"
                  className="ui-focus rounded-md border border-cyan-200 bg-white px-3 py-2 text-sm md:col-span-2"
                />
                <textarea
                  value={manualDraft.description}
                  onChange={(event) => setManualDraft((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="Descripción personalizada"
                  className="ui-focus min-h-20 rounded-md border border-cyan-200 bg-white px-3 py-2 text-sm md:col-span-2"
                />
                <textarea
                  value={manualDraft.imagesCsv}
                  onChange={(event) => setManualDraft((prev) => ({ ...prev, imagesCsv: event.target.value }))}
                  placeholder="URLs adicionales de Cloudinary separadas por coma (opcional)"
                  className="ui-focus min-h-16 rounded-md border border-cyan-200 bg-white px-3 py-2 text-sm md:col-span-2"
                />
                <input
                  value={manualDraft.thumbnail}
                  onChange={(event) => setManualDraft((prev) => ({ ...prev, thumbnail: event.target.value }))}
                  placeholder="URL portada Cloudinary (opcional, si no se usa la primera)"
                  className="ui-focus rounded-md border border-cyan-200 bg-white px-3 py-2 text-sm md:col-span-2"
                />
                <input
                  value={manualDraft.view3dUrl}
                  onChange={(event) => setManualDraft((prev) => ({ ...prev, view3dUrl: event.target.value }))}
                  placeholder="URL visor 3D (opcional)"
                  className="ui-focus rounded-md border border-cyan-200 bg-white px-3 py-2 text-sm md:col-span-2"
                />
                <select
                  value={manualDraft.upcomingAuctionId}
                  onChange={(event) => setManualDraft((prev) => ({ ...prev, upcomingAuctionId: event.target.value }))}
                  className="ui-focus rounded-md border border-cyan-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Sin remate</option>
                  {sortedUpcomingAuctions.map((auction) => (
                    <option key={auction.id} value={auction.id}>
                      {auction.name} ({formatAuctionDateLabel(auction.date)})
                    </option>
                  ))}
                </select>
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={manualDraft.visible}
                    onChange={(event) => setManualDraft((prev) => ({ ...prev, visible: event.target.checked }))}
                  />
                  Visible
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                {(["proximos-remates", "ventas-directas", "novedades", "catalogo"] as SectionId[]).map((sectionId) => (
                  <label key={`manual-modal-section-${sectionId}`} className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-white px-3 py-1 text-xs text-cyan-800">
                    <input
                      type="checkbox"
                      checked={manualDraft.sectionIds.includes(sectionId)}
                      onChange={() => toggleManualDraftSection(sectionId)}
                    />
                    {SECTION_LABELS[sectionId]}
                  </label>
                ))}
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={resetManualCreation}
                  className="ui-focus rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={createManualPublication}
                  className="ui-focus rounded-md bg-cyan-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500"
                >
                  Crear publicación manual
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showLogin ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div role="dialog" aria-modal="true" aria-label="Inicio de sesión administrador" className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900">Login</h3>
            <p className="mt-1 text-sm text-slate-500">Solo administradores pueden editar categorías y vehículos.</p>
            <div className="mt-4 space-y-2">
              <input value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" placeholder="Correo" aria-label="Correo de administrador" />
              <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" placeholder="Contraseña" aria-label="Contraseña de administrador" />
            </div>
            {loginError ? <p className="mt-2 text-xs text-red-600">{loginError}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowLogin(false)} className="ui-focus rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50">Cancelar</button>
              <button onClick={login} className="ui-focus rounded-md bg-cyan-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500">Entrar</button>
            </div>
          </div>
        </div>
      ) : null}
      {showPublicHome ? (
        <a
          href={WHATSAPP_CTA_URL}
          target="_blank"
          rel="noreferrer"
          onClick={() => trackEvent("whatsapp_click_floating")}
          className="ui-focus fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-2 text-sm font-semibold text-white shadow-lg md:hidden"
        >
          <span>WhatsApp</span>
        </a>
      ) : null}

      {systemNotice ? (
        <div
          key={systemNotice.id}
          className="pointer-events-none fixed left-1/2 top-20 z-[80] w-[92%] max-w-md -translate-x-1/2"
          role="status"
          aria-live="polite"
        >
          <div
            className={`pointer-events-auto glass-soft rounded-xl border px-4 py-3 shadow-xl ${
              systemNotice.tone === "success"
                ? "border-emerald-200 bg-emerald-50/95"
                : systemNotice.tone === "error"
                  ? "border-rose-200 bg-rose-50/95"
                  : "border-cyan-200 bg-cyan-50/95"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{systemNotice.title}</p>
                <p className="mt-1 text-xs text-slate-700">{systemNotice.message}</p>
              </div>
              <button
                type="button"
                onClick={() => setSystemNotice(null)}
                className="ui-focus rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isAdmin && editingVehicleKey && editingDetails && editingItem ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/70 p-4" onClick={cancelDetailsEditor}>
          <div role="dialog" aria-modal="true" aria-label="Editar detalle manual" className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
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
