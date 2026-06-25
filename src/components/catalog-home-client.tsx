"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CatalogCard,
  inferVehicleSiniestradoStatus,
  type VehicleCommercialEventBadge,
} from "@/components/catalog-card";
import { CatalogVehicleHighlightStrip } from "@/components/catalog-vehicle-highlight-strip";
import { ShareIcon } from "@/components/share-icon";
import { VehicleDetailMobile } from "@/components/vehicle-detail-mobile";
import type { CatalogFeed, CatalogItem } from "@/types/catalog";
import type { OfferRecord } from "@/types/offers";
import { migrateEditorAuctionIds } from "@/lib/auction-id";
import {
  resolveCatalogHeroDescription,
  resolveCatalogHeroKicker,
  resolveCatalogHeroTitle,
} from "@/lib/catalog-hero-copy";
import {
  collectVehicleImageCandidates,
  filterCatalogPdfSectionsWithPrice,
  generateCatalogPdfDocument,
  getPdfVehicleDisplay,
  loadLogoForPdfAsDataUrl,
  saveCatalogPdfDocument,
  type CatalogPdfSection,
} from "@/lib/catalog-pdf";
import {
  filterPatentDetailFields,
  maskPatentForDisplay,
  maskPatentForPdf,
  shouldShowPatentsToViewer,
} from "@/lib/catalog-patent-visibility";
import { getVisibleCatalogItems, getEditorOverrideForItem } from "@/lib/catalog-public-inventory";
import { applyCatalogDetailsOverride } from "@/lib/catalog-details-override";
import { isCatalogPublishedVehicle } from "@/lib/catalog-publication-rules";
import { clearPublicationBlocksForVehicleKeys } from "@/lib/editor-publication-unblock";
import { normalizePatenteKey } from "@/lib/rainworx-to-editor";
import { cloudinaryRawUrlsInlineInHtml } from "@/lib/cloudinary-delivery";
import {
  inferLotDocumentKind,
  isLotDocumentLabelBlocked,
  lotDocumentKindBadgeClass,
  lotDocumentKindLabel,
  lotDocumentOpenUrl,
  mergeLotDocumentLinks,
  parseLotDocumentsJson,
  serializeLotDocumentsJson,
  type LotDocumentLink,
} from "@/lib/lot-documents";
import {
  normalizeGlo3dViewerInput,
  resolveGlo3dViewerPreviewUrl,
} from "@/lib/glo3d-viewer-url";
import {
  GLO3D_BATCH_IMPORT_MAX,
  isGlo3dRateLimitMessage,
} from "@/lib/glo3d-client-cooldown";
import {
  CATALOG_SYNC_PATENT_DELAY_MS,
  importPatentWithRetries,
  importPatentsBatchWithRetries,
  sleepMs,
} from "@/lib/catalog-sync-patent-client";
import {
  isGlo3dCatalogImageUrl,
  isTasacionesInventoryPhotoUrl,
  mergeVehicleImageSources,
} from "@/lib/catalog-sync-images";
import {
  hydrateCatalogItemsWithEditorConfig,
  mergeEditorConfigsPreferVehicleDetails,
} from "@/lib/catalog-feed-hydrate";
import { patchEditorConfigVehicleDetails } from "@/lib/catalog-editor-vehicle-persist";
import { useGlo3dClientCooldown } from "@/hooks/use-glo3d-client-cooldown";
import { AdminLoginDialog } from "@/components/admin/admin-login-dialog";
import { EditorVehiculoDocumentos } from "@/components/admin/EditorVehiculoDocumentos";
import { AnalyticsDashboard } from "@/components/admin/analytics-dashboard";
import { getSessionAttribution, mergeAnalyticsPayload } from "@/lib/analytics-context";
import { formatHeroNextRemateLabel } from "@/lib/auction-display";
import { CatalogHeroBackgroundVideo } from "@/components/catalog-hero-background-video";
import { CatalogSiteFooter } from "@/components/catalog-site-footer";
import { FloatingWhatsappButton } from "@/components/floating-whatsapp-button";
import { HomeInventorySearch } from "@/components/home-inventory-search";
import {
  RematesEmptyHomeState,
  UpcomingAuctionsSection,
  VentaDirectaEmptyHomeState,
} from "@/components/home-upcoming-auctions-section";
import {
  VehicleListThumbnailWithSync,
  VehicleSyncIcon,
} from "@/components/admin/vehicle-sync-thumbnail";
import {
  resolveVehicleThumbnailSrc,
  vehicleNeedsQuickSync,
  vehicleTitleNeedsSync,
} from "@/lib/vehicle-sync-helpers";
import {
  PRUEBA_DESPLAZAMIENTO_LOOKUP_KEYS,
  PRUEBA_MOTOR_LOOKUP_KEYS,
  resolvePruebaDesplazamientoSiNo,
  resolvePruebaMotorSiNo,
} from "@/lib/prueba-operativa-sino";
import {
  DEFAULT_VENTA_DIRECTA_EVENT_ID,
  DEFAULT_VENTA_DIRECTA_EVENT_NAME,
  preserveEditorBaseSectionVisibility,
  mergeEditorConfigAfterServerPersist,
  reconcileVisibleCommercialSectionVisibility,
  resolveCommercialEventType,
} from "@/lib/catalog-shared-constants";
import {
  applyExclusiveCommercialAssignment,
  enforceCommercialExclusivityInConfig,
  getAuctionCommercialEventType,
  resolveVehicleCommercialLane,
} from "@/lib/commercial-category-exclusivity";
import {
  DEFAULT_EDITOR_CONFIG,
  type CommercialEventOrigin,
  type EditorConfig,
  type EditorVehicleDetails,
  type HomeSectionOrderId,
  type ManagedCategory,
  type ManualPublication,
  type SoldVehicleRecord,
  type UpcomingAuction,
  type CommercialEventType,
  type SectionId,
  type VehicleTypeId,
} from "@/types/editor";

const EDITOR_STORAGE_KEY = "vedisa_editor_config_local";
const HOME_QUICK_FILTERS_STORAGE_KEY = "vedisa_home_quick_filters";
const HOME_SINIESTRO_FILTER_STORAGE_KEY = "vedisa_home_siniestro_filter";

type HomeSiniestradoFilter = "all" | "no_siniestrado" | "siniestrado";

const HOME_BODY_FILTER_IDS = [
  "camioneta",
  "camion",
  "suv",
  "sedan",
  "furgon",
] as const satisfies ReadonlyArray<QuickFilterId>;

const HOME_BODY_FILTER_LABELS: Record<(typeof HOME_BODY_FILTER_IDS)[number], string> = {
  camioneta: "Camionetas",
  camion: "Camiones",
  suv: "SUV",
  sedan: "Sedán",
  furgon: "Furgón",
};

const HOME_SINIESTRO_FILTER_OPTIONS: ReadonlyArray<{
  id: HomeSiniestradoFilter;
  label: string;
}> = [
  { id: "all", label: "Todos" },
  { id: "no_siniestrado", label: "No siniestrados" },
  { id: "siniestrado", label: "Siniestrados" },
];
const HOME_CARD_DENSITY_STORAGE_KEY = "vedisa_home_card_density";
const EDITOR_PAGE_SIZE = 20;
type AdminTabId = "vehiculos" | "categorias" | "layout" | "analytics" | "ofertas";
type InventorySubtabId = "actual" | "vendidas";
type EditorGroupFilter = "all" | SectionId | `managed:${string}`;
type EditorVisibilityFilter = "all" | "visible" | "hidden";
type EditorVehicleCategoryFilter = "all" | "livianos" | "pesados" | "maquinaria" | "chatarra" | "otros";
type BatchAssignTarget =
  | { type: "section"; sectionId: "ventas-directas" }
  | { type: "auction"; auctionId: string };
type GroupManageTarget = BatchAssignTarget;
type SortOption = "recomendado" | "relevancia" | "fecha-remate" | "precio-asc" | "precio-desc" | "titulo";
type QuickFilterId =
  | "sedan"
  | "hatchback"
  | "station_wagon"
  | "coupe"
  | "descapotable"
  | "suv"
  | "crossover"
  | "todoterreno"
  | "minivan"
  | "camioneta"
  | "furgon"
  | "minibus"
  | "deportivo"
  | "city_car"
  | "tractocamion"
  | "camion"
  | "bus"
  | "semiremolque";
type CardDensity = "compact" | "detailed";
type DetailEditorTabId = "descripcion" | "documentos" | "general" | "tecnica" | "publicacion" | "fotos";
type ClientLeadForm = {
  name: string;
  phone: string;
  interest: string;
};
type OfferFormState = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  offerAmount: string;
};
type OfferFilterField = "all" | "vehicleTitle" | "patent" | "customerName" | "customerEmail" | "customerPhone";
type SoldFilterField = "all" | "patent" | "title" | "soldCategory" | "auctionName";
type AnalyticsChartType = "bar" | "line" | "area";
type AnalyticsTimelineMetric = "eventos" | "visitas" | "detalle" | "whatsapp" | "leads";
type VehicleDetailTabId = "general" | "descripcion" | "tecnica" | "fotos";
type SystemNotice = {
  id: number;
  tone: "success" | "error" | "info";
  title: string;
  message: string;
};

type AnalyticsEventPayload = Record<string, unknown> & {
  event?: string;
  timestamp?: string;
  itemKey?: string;
  section?: string;
  sessionId?: string;
  visitorId?: string;
};
type AnalyticsTimelineRow = {
  date: string;
  total: number;
  visits: number;
  detailOpens: number;
  whatsappClicks: number;
  leads: number;
};

const QUICK_FILTER_LABELS: Record<QuickFilterId, string> = {
  sedan: "Sedán",
  hatchback: "Hatchback",
  station_wagon: "Station Wagon",
  coupe: "Coupé",
  descapotable: "Descapotable",
  suv: "SUV",
  crossover: "Crossover (CUV)",
  todoterreno: "Todoterreno (4x4)",
  minivan: "Minivan",
  camioneta: "Camioneta (Pick-up)",
  furgon: "Furgón",
  minibus: "Minibús (Van)",
  deportivo: "Deportivo",
  city_car: "City car",
  tractocamion: "Tractocamión",
  camion: "Camión",
  bus: "Buses",
  semiremolque: "Semiremolques",
};

const QUICK_FILTER_IDS = Object.keys(QUICK_FILTER_LABELS) as QuickFilterId[];

const VEHICLE_BODY_TYPE_MATCHERS: Record<QuickFilterId, RegExp[]> = {
  city_car: [/\bcity\s*car\b/, /\bcitycar\b/, /\bauto\s*urbano\b/, /\bcompacto\s*urbano\b/],
  hatchback: [/\bhatch\s*back\b/, /\bhatchback\b/],
  station_wagon: [/\bstation\s*wagon\b/, /\bstation\b/, /\bwagon\b/, /\bfamiliar\b/, /\bbreak\b/],
  coupe: [/\bcoupe\b/, /\bcupe\b/],
  descapotable: [/\bdescapotable\b/, /\bconvertible\b/, /\bcabrio\b/, /\bcabriolet\b/, /\broadster\b/],
  crossover: [/\bcrossover\b/, /\bcuv\b/],
  suv: [/\bsuv\b/, /\bsport\s*utility\b/],
  todoterreno: [/\btodoterreno\b/, /\b4x4\b/, /\b4wd\b/, /\boff\s*road\b/, /\boffroad\b/],
  minivan: [/\bminivan\b/, /\bmini\s*van\b/],
  camioneta: [/\bcamioneta\b/, /\bpick\s*up\b/, /\bpickup\b/, /\bpick\s*-\s*up\b/],
  furgon: [/\bfurgon\b/, /\bfurgoneta\b/, /\bpanel\s*van\b/, /\bvan\s*comercial\b/],
  minibus: [/\bminibus\b/, /\bmini\s*bus\b/, /\bvan\b/],
  deportivo: [/\bdeportivo\b/, /\bsport\s*car\b/, /\bcoche\s*deportivo\b/],
  sedan: [/\bsedan\b/, /\bberlina\b/, /\bsalon\b/],
  tractocamion: [/\btractocamion\b/, /\btracto\s*camion\b/, /\btruck\s*tractor\b/],
  camion: [/\bcamion\b/],
  bus: [/\bbuses\b/, /\bbus\b/, /\bomnibus\b/, /\bmicrobus\b/],
  semiremolque: [/\bsemiremolque\b/, /\bsemi\s*remolque\b/, /\bremolque\b/, /\brampla\b/, /\btrailer\b/],
};

const VEHICLE_CONDITION_OPTIONS = [
  "Vehículo 100% operativo",
  "No arranca",
  "Con problemas",
  "Desarme",
  "Recuperado por robo sin registrar en la Cia de seguros",
] as const;
const VEHICLE_CATEGORY_OPTIONS = [
  { value: "vehiculo_liviano", label: "Vehículo liviano" },
  { value: "vehiculo_pesado", label: "Vehículo pesado" },
  { value: "maquinaria", label: "Maquinaria" },
  { value: "chatarra", label: "Chatarra" },
  { value: "otros", label: "Otros" },
] as const;

const WHATSAPP_CTA_URL =
  "https://api.whatsapp.com/send/?phone=56989323397&text=Hola%2C+quiero+asesor%C3%ADa+para+ofertar+en+VEDISA&type=phone_number&app_absent=0";
const WHATSAPP_PHONE = "56989323397";
const ANALYTICS_STORAGE_KEY = "vedisa_analytics_events";
const ANALYTICS_VISITOR_ID_KEY = "vedisa_analytics_visitor_id";
const ANALYTICS_SESSION_ID_KEY = "vedisa_analytics_session_id";
const ANALYTICS_SESSION_PAGEVIEW_KEY = "vedisa_analytics_pageview_home";
const OBSERVATIONS_TEMPLATE_STORAGE_KEY = "vedisa_observations_template_html";
const DEFAULT_OBSERVATIONS_TEMPLATE_HTML = `<h3><strong>¿Quieres ofertar y aprovechar esta oportunidad?</strong></h3>
<p>Sigue estos pasos:</p>
<ol>
  <li>
    <p><strong>Inscríbete en nuestra web</strong> y accede con tu usuario registrado.</p>
  </li>
  <li>
    <p><strong>Deposita la garantía</strong> de $300.000 por cada vehículo de interés en nuestra cuenta. Luego, envía tu usuario y el comprobante de depósito a nuestro Contact Center vía WhatsApp al <a href="https://wa.me/56989323397" target="_blank" rel="noreferrer" style="color:#1d4ed8"><strong>+56 9 8932 3397</strong></a>. Recibirás un mensaje cuando estés habilitado para ofertar.</p>
  </li>
  <li>
    <p><strong>Ingresa a nuestro sitio web</strong>, busca el lote que te interesa y elige tu forma de ofertar:</p>
    <ul>
      <li>Haz clic en la <em>oferta mínima</em>.</li>
      <li>Ingresa el monto que deseas ofertar; el sistema pujará automáticamente desde la oferta mínima hasta tu valor máximo indicado.</li>
    </ul>
  </li>
  <li>
    <p><strong>Si te adjudicas el vehículo</strong>, recibirás un correo con el valor total a cancelar.</p>
    <ul>
      <li>Dispones de 48 horas para realizar el pago total y coordinar el retiro de tu vehículo.</li>
      <li>Una vez pagado, envía los comprobantes a nuestro Contact Center.</li>
      <li>Todos los trámites pueden realizarse de forma 100% remota.</li>
    </ul>
  </li>
  <li>
    <p><strong>Si no te adjudicas ningún vehículo</strong>, la garantía se devuelve después de 48 horas del remate garantizado.</p>
  </li>
</ol>
<ul>
  <li>En nuestro portal te asesoramos de manera honesta y transparente, con material audiovisual e información detallada de cada vehículo, garantizando su integridad hasta que sale de nuestras dependencias.</li>
  <li>Si deseas ver el vehículo presencialmente, puedes hacerlo en la ubicación y horarios de exhibición establecidos, una vez depositada la garantía, para tu propia seguridad.</li>
</ul>`;

const SECTION_LABELS: Record<SectionId, string> = {
  "proximos-remates": "Próximos remates",
  "ventas-directas": "Ventas directas",
  novedades: "Novedades",
  catalogo: "Catálogo",
};
const BASE_HOME_SECTION_ORDER: SectionId[] = ["proximos-remates", "ventas-directas"];
const RETIRED_HOME_SECTION_IDS = new Set<SectionId>(["novedades", "catalogo"]);
const sectionCategoryKey = (sectionId: SectionId) => `section:${sectionId}` as const;
const auctionCategoryKey = (auctionId: string) => `auction:${auctionId}`;
const managedCategoryKey = (categoryId: string) => `managed:${categoryId}`;

function detectCommercialEventType(value?: string | null): CommercialEventType {
  const normalized = String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
  if (
    normalized.includes("ventadirecta") ||
    normalized.includes("vtadirecta") ||
    normalized.includes("vtdirecta") ||
    normalized.includes("ventadir")
  ) {
    return "venta_directa";
  }
  return "remate";
}

function sanitizeAuctionTitle(value?: string | null): string {
  const raw = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return "Sin título";
  const parts = raw
    .split(/\s*-\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= 1) return raw;
  const seen = new Set<string>();
  const dedup: string[] = [];
  for (const part of parts) {
    const key = detectCommercialEventType(part) + part.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(part);
    if (dedup.length >= 8) break;
  }
  return dedup.join(" - ") || raw;
}

function getAuctionEventType(auction: UpcomingAuction): CommercialEventType {
  return resolveCommercialEventType({
    id: auction.id,
    name: auction.name,
    eventType: auction.eventType,
  });
}

function resolveEstadoRetiroForBatchTarget(
  target: BatchAssignTarget,
  auctions: UpcomingAuction[],
): string {
  if (target.type === "section") {
    if (target.sectionId === "ventas-directas") return "en_bodega_a_venta_directa";
    return "en_tasacion";
  }
  const auction = auctions.find((entry) => entry.id === target.auctionId);
  return getAuctionEventType(auction ?? { id: target.auctionId, name: "", date: "" }) ===
    "venta_directa"
    ? "en_bodega_a_venta_directa"
    : "en_bodega_a_remate";
}

function isPlaceholderVehicleLabel(value?: string | null): boolean {
  if (!value?.trim()) return true;
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return (
    normalized === "sin marca" ||
    normalized === "sin modelo" ||
    normalized.includes("sin marca sin modelo") ||
    normalized === "no informado" ||
    normalized === "unidad"
  );
}

function isStaleEditorDraftValue(value: string | undefined, patente?: string): boolean {
  if (!value?.trim()) return true;
  if (isPlaceholderVehicleLabel(value)) return true;
  const normalizedPatente = normalizePatentToken(patente ?? "");
  if (normalizedPatente && normalizePatentToken(value) === normalizedPatente) return true;
  if (/^unidad\s+[a-z0-9]{5,10}$/i.test(value.trim())) return true;
  return false;
}

function resolvePatenteDraftField(
  overrideValue: string | undefined,
  itemValue: string,
  fallbackPatente?: string,
): string {
  if (overrideValue?.trim()) return overrideValue.trim();
  if (itemValue?.trim()) return itemValue.trim();
  return fallbackPatente?.trim() ?? "";
}

function resolveEditorDraftField(
  overrideValue: string | undefined,
  itemValue: string,
  patente?: string,
): string {
  if (overrideValue?.trim() && !isStaleEditorDraftValue(overrideValue, patente)) {
    return overrideValue.trim();
  }
  const cleaned = itemValue?.trim() ?? "";
  if (cleaned && !isStaleEditorDraftValue(cleaned, patente)) return cleaned;
  return "";
}

function mergeSyncedVehicleDetails(
  item: CatalogItem,
  synced?: EditorVehicleDetails,
): EditorVehicleDetails {
  const draft = buildDetailsDraft(item, synced);
  const patente = getPatent(item);
  if (!synced) return { ...draft, patente: resolvePatenteDraftField(draft.patente, patente, patente) };
  const pick = (value?: string) => (value?.trim() ? value.trim() : undefined);
  return {
    ...draft,
    patente: resolvePatenteDraftField(synced.patente, draft.patente ?? "", patente),
    title: pick(synced.title) ?? draft.title,
    brand: pick(synced.brand) ?? draft.brand,
    model: pick(synced.model) ?? draft.model,
    year: pick(synced.year) ?? draft.year,
    version: pick(synced.version) ?? draft.version,
    vin: pick(synced.vin) ?? draft.vin,
    nChasis: pick(synced.nChasis) ?? draft.nChasis,
    nMotor: pick(synced.nMotor) ?? draft.nMotor,
    nSerie: pick(synced.nSerie) ?? draft.nSerie,
    nSiniestro: pick(synced.nSiniestro) ?? draft.nSiniestro,
    kilometraje: pick(synced.kilometraje) ?? draft.kilometraje,
    color: pick(synced.color) ?? draft.color,
    combustible: pick(synced.combustible) ?? draft.combustible,
    transmision: pick(synced.transmision) ?? draft.transmision,
    traccion: pick(synced.traccion) ?? draft.traccion,
    aro: pick(synced.aro) ?? draft.aro,
    cilindrada: pick(synced.cilindrada) ?? draft.cilindrada,
    thumbnail: pick(synced.thumbnail) ?? draft.thumbnail ?? item.thumbnail ?? "",
    view3dUrl: (() => {
      const raw = pick(synced.view3dUrl) ?? draft.view3dUrl ?? item.view3dUrl ?? "";
      return normalizeGlo3dViewerInput(raw) ?? raw;
    })(),
    imagesCsv:
      pick(synced.imagesCsv) ??
      draft.imagesCsv ??
      item.images.filter((url) => url.startsWith("http")).join(", "),
    pruebaMotor: (() => {
      const syncedMotor = resolvePruebaMotorSiNo(synced.pruebaMotor);
      if (syncedMotor) return syncedMotor;
      return resolvePruebaMotorSiNo(draft.pruebaMotor) || draft.pruebaMotor;
    })(),
    pruebaDesplazamiento: (() => {
      const syncedMove = resolvePruebaDesplazamientoSiNo(synced.pruebaDesplazamiento);
      if (syncedMove) return syncedMove;
      return resolvePruebaDesplazamientoSiNo(draft.pruebaDesplazamiento) || draft.pruebaDesplazamiento;
    })(),
  };
}

function resolveIdentityDraftField(
  overrideValue: string | undefined,
  itemValue: string,
  patente?: string,
): string {
  return resolveEditorDraftField(overrideValue, itemValue, patente);
}

function buildAutoVehicleTitle(details: EditorVehicleDetails): string {
  const parts = [details.brand, details.model, details.year, details.version].filter(
    (part) => part?.trim() && !isPlaceholderVehicleLabel(part),
  ) as string[];
  return parts.join(" ").trim();
}

function EditorLabeledField({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block space-y-1 ${className}`}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

const DETAIL_EDITOR_TABS: Array<[DetailEditorTabId, string]> = [
  ["general", "Información del vehículo"],
  ["tecnica", "Detalles técnicos"],
  ["publicacion", "Publicación"],
  ["fotos", "Fotos"],
  ["descripcion", "Descripción"],
  ["documentos", "Documentos"],
];

function resolveEstadoRetiroForVehicleKey(
  vehicleKey: string,
  editorConfig: EditorConfig,
  auctions: UpcomingAuction[],
): string {
  if ((editorConfig.sectionVehicleIds?.["ventas-directas"] ?? []).includes(vehicleKey)) {
    return "en_bodega_a_venta_directa";
  }
  const auctionId = editorConfig.vehicleUpcomingAuctionIds?.[vehicleKey];
  if (auctionId) {
    const auction = auctions.find((entry) => entry.id === auctionId);
    return getAuctionEventType(auction ?? { id: auctionId, name: "", date: "" }) ===
      "venta_directa"
      ? "en_bodega_a_venta_directa"
      : "en_bodega_a_remate";
  }
  return "en_tasacion";
}

function vehicleNeedsSourceSync(
  item: CatalogItem,
  vehicleKey: string,
  editorConfig: EditorConfig,
): boolean {
  if (vehicleKey.startsWith("manual-")) return false;
  const details = editorConfig.vehicleDetails?.[vehicleKey];
  const title = details?.title ?? item.title;
  const brand = details?.brand ?? String((item.raw as Record<string, unknown>).marca ?? "");
  const model = details?.model ?? getModel(item);
  const missingIdentity =
    isPlaceholderVehicleLabel(title) ||
    isPlaceholderVehicleLabel(brand) ||
    isPlaceholderVehicleLabel(model);
  const missingMedia = !details?.thumbnail && !item.thumbnail;
  const missingTechnical = !details?.pruebaMotor && !details?.llaves && !details?.kilometraje;
  return (
    missingIdentity ||
    missingMedia ||
    missingTechnical ||
    vehicleTitleNeedsSync(item, vehicleKey, editorConfig, isStaleEditorDraftValue)
  );
}

function vehicleNeedsAssignEnrich(
  item: CatalogItem,
  vehicleKey: string,
  editorConfig: EditorConfig,
): boolean {
  if (vehicleKey.startsWith("manual-")) return false;
  const details = editorConfig.vehicleDetails?.[vehicleKey];
  const brand = details?.brand ?? String((item.raw as Record<string, unknown>).marca ?? "");
  const model = details?.model ?? getModel(item);
  const title = details?.title ?? item.title;
  return (
    isPlaceholderVehicleLabel(title) ||
    isPlaceholderVehicleLabel(brand) ||
    isPlaceholderVehicleLabel(model) ||
    vehicleTitleNeedsSync(item, vehicleKey, editorConfig, isStaleEditorDraftValue)
  );
}

/** Misma regla que la etiqueta "· ficha OK" en el modal de agregar desde inventario. */
function vehicleHasCompleteAssignFicha(
  item: CatalogItem,
  vehicleKey: string,
  editorConfig: EditorConfig,
): boolean {
  if (vehicleKey.startsWith("manual-")) return true;
  return (
    !vehicleNeedsQuickSync(item, vehicleKey, editorConfig, isStaleEditorDraftValue) &&
    !vehicleNeedsAssignEnrich(item, vehicleKey, editorConfig) &&
    !vehicleNeedsSourceSync(item, vehicleKey, editorConfig)
  );
}

function getAuctionEventOrigin(auction: UpcomingAuction): CommercialEventOrigin {
  if (
    auction.eventOrigin === "subastas" ||
    auction.eventOrigin === "catalogo" ||
    auction.eventOrigin === "tasaciones" ||
    auction.eventOrigin === "mixto" ||
    auction.eventOrigin === "desconocido"
  ) {
    return auction.eventOrigin;
  }
  return "desconocido";
}

function auctionOriginLabel(origin: CommercialEventOrigin) {
  if (origin === "subastas") return "Origen: Subastas";
  if (origin === "catalogo") return "Origen: Catálogo";
  if (origin === "tasaciones") return "Origen: Tasaciones";
  if (origin === "mixto") return "Origen: Mixto";
  return "Origen: Sin datos";
}

function auctionOriginClass(origin: CommercialEventOrigin) {
  if (origin === "subastas") return "bg-indigo-100 text-indigo-700";
  if (origin === "catalogo") return "bg-cyan-100 text-cyan-700";
  if (origin === "tasaciones") return "bg-slate-100 text-slate-700";
  if (origin === "mixto") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

function normalizeEditorConfigClient(
  value?: Partial<EditorConfig> | null,
): EditorConfig {
  const migrated = migrateEditorAuctionIds(value);
  const defaults = DEFAULT_EDITOR_CONFIG;
  const normalizedHeroTitle = resolveCatalogHeroTitle(migrated?.homeLayout?.heroTitle);
  const normalizedHeroDescription = resolveCatalogHeroDescription(migrated?.homeLayout?.heroDescription);
  const normalizedHeroKicker = resolveCatalogHeroKicker(migrated?.homeLayout?.heroKicker);
  const requestedPrimaryCta = "Ver vehículos disponibles";
  const requestedSecondaryCta = "Cómo participar en el remate";
  const requestedSecondaryHref = "#como-participar";
  const incomingPrimaryCta = migrated?.homeLayout?.heroPrimaryCtaLabel?.trim();
  const normalizedPrimaryCta =
    !incomingPrimaryCta || incomingPrimaryCta === "Ver catálogo completo"
      ? requestedPrimaryCta
      : migrated?.homeLayout?.heroPrimaryCtaLabel ?? defaults.homeLayout.heroPrimaryCtaLabel;
  const incomingSecondaryCta = migrated?.homeLayout?.heroSecondaryCtaLabel?.trim();
  const normalizedSecondaryCta =
    !incomingSecondaryCta || incomingSecondaryCta === "Explorar secciones"
      ? requestedSecondaryCta
      : migrated?.homeLayout?.heroSecondaryCtaLabel ?? defaults.homeLayout.heroSecondaryCtaLabel;
  const incomingSecondaryHref = migrated?.homeLayout?.heroSecondaryCtaHref?.trim();
  const normalizedSecondaryHref =
    !incomingSecondaryHref || incomingSecondaryHref === "#proximos-remates"
      ? requestedSecondaryHref
      : migrated?.homeLayout?.heroSecondaryCtaHref ?? defaults.homeLayout.heroSecondaryCtaHref;
  const incomingPrimaryHref = migrated?.homeLayout?.heroPrimaryCtaHref?.trim();
  const normalizedPrimaryHref =
    !incomingPrimaryHref || incomingPrimaryHref === "#catalogo"
      ? defaults.homeLayout.heroPrimaryCtaHref
      : migrated?.homeLayout?.heroPrimaryCtaHref ?? defaults.homeLayout.heroPrimaryCtaHref;
  const baseConfig = {
    sectionVehicleIds: {
      "proximos-remates":
        migrated?.sectionVehicleIds?.["proximos-remates"] ??
        defaults.sectionVehicleIds["proximos-remates"],
      "ventas-directas":
        migrated?.sectionVehicleIds?.["ventas-directas"] ??
        defaults.sectionVehicleIds["ventas-directas"],
      novedades:
        migrated?.sectionVehicleIds?.novedades ?? defaults.sectionVehicleIds.novedades,
      catalogo: migrated?.sectionVehicleIds?.catalogo ?? defaults.sectionVehicleIds.catalogo,
    },
    hiddenVehicleIds: migrated?.hiddenVehicleIds ?? defaults.hiddenVehicleIds,
    hiddenCategoryIds: migrated?.hiddenCategoryIds ?? defaults.hiddenCategoryIds,
    soldVehicleIds: migrated?.soldVehicleIds ?? defaults.soldVehicleIds,
    soldVehicleHistory: migrated?.soldVehicleHistory ?? defaults.soldVehicleHistory,
    vehiclePrices: migrated?.vehiclePrices ?? defaults.vehiclePrices,
    vehicleDetails: migrated?.vehicleDetails ?? defaults.vehicleDetails,
    upcomingAuctions: (migrated?.upcomingAuctions ?? defaults.upcomingAuctions).map((auction) => ({
      ...auction,
      name: sanitizeAuctionTitle(auction.name),
      eventType: getAuctionEventType(auction),
    })),
    vehicleUpcomingAuctionIds:
      migrated?.vehicleUpcomingAuctionIds ?? defaults.vehicleUpcomingAuctionIds,
    sectionTexts: {
      "proximos-remates":
        migrated?.sectionTexts?.["proximos-remates"] ??
        defaults.sectionTexts["proximos-remates"],
      "ventas-directas":
        migrated?.sectionTexts?.["ventas-directas"] ??
        defaults.sectionTexts["ventas-directas"],
      novedades: migrated?.sectionTexts?.novedades ?? defaults.sectionTexts.novedades,
      catalogo: migrated?.sectionTexts?.catalogo ?? defaults.sectionTexts.catalogo,
    },
    homeLayout: {
      heroKicker: normalizedHeroKicker,
      heroTitle: normalizedHeroTitle,
      heroDescription: normalizedHeroDescription,
      heroPrimaryCtaLabel: normalizedPrimaryCta,
      heroPrimaryCtaHref: normalizedPrimaryHref,
      heroSecondaryCtaLabel: normalizedSecondaryCta,
      heroSecondaryCtaHref: normalizedSecondaryHref,
      heroAlignment: migrated?.homeLayout?.heroAlignment ?? defaults.homeLayout.heroAlignment,
      heroTheme: migrated?.homeLayout?.heroTheme ?? defaults.homeLayout.heroTheme,
      heroMaxWidth: migrated?.homeLayout?.heroMaxWidth ?? defaults.homeLayout.heroMaxWidth,
      showHeroChips: migrated?.homeLayout?.showHeroChips ?? defaults.homeLayout.showHeroChips,
      showHeroCtas: migrated?.homeLayout?.showHeroCtas ?? defaults.homeLayout.showHeroCtas,
      showFeaturedStrip: false,
      showRecentPublications: false,
      showFavoritesSection: false,
      showHowToSection:
        (migrated?.homeLayout?.showHowToSection ?? defaults.homeLayout.showHowToSection) ||
        normalizedSecondaryHref === "#como-participar",
      showSearchBar: migrated?.homeLayout?.showSearchBar ?? defaults.homeLayout.showSearchBar,
      showQuickFilters:
        migrated?.homeLayout?.showQuickFilters ?? defaults.homeLayout.showQuickFilters,
      showSortSelector:
        migrated?.homeLayout?.showSortSelector ?? defaults.homeLayout.showSortSelector,
      showStickySearchBar:
        migrated?.homeLayout?.showStickySearchBar ?? defaults.homeLayout.showStickySearchBar,
      showCommercialPanel:
        migrated?.homeLayout?.showCommercialPanel ?? defaults.homeLayout.showCommercialPanel,
      defaultCardDensity:
        migrated?.homeLayout?.defaultCardDensity ?? defaults.homeLayout.defaultCardDensity,
      sectionSpacing: migrated?.homeLayout?.sectionSpacing ?? defaults.homeLayout.sectionSpacing,
      sectionOrder: (migrated?.homeLayout?.sectionOrder ?? defaults.homeLayout.sectionOrder).filter(
        (sectionId) =>
          sectionId === "proximos-remates" ||
          sectionId === "ventas-directas" ||
          String(sectionId).startsWith("managed:"),
      ),
    },
    manualPublications: migrated?.manualPublications ?? defaults.manualPublications,
    managedCategories: migrated?.managedCategories ?? defaults.managedCategories,
  };
  const exclusive = enforceCommercialExclusivityInConfig(baseConfig);
  return {
    ...exclusive,
    hiddenCategoryIds: reconcileVisibleCommercialSectionVisibility(
      exclusive.hiddenCategoryIds,
      exclusive.upcomingAuctions,
    ),
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
  normalPrice: string;
  promoEnabled: boolean;
  promoPrice: string;
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
  normalPrice: "",
  promoEnabled: false,
  promoPrice: "",
  upcomingAuctionId: "",
  visible: true,
  sectionIds: ["ventas-directas"],
};

function normalizeText(value?: string): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function toCsvCell(value: unknown): string {
  const text = String(value ?? "").replace(/"/g, "\"\"");
  return `"${text}"`;
}

function isSubsequenceMatch(source: string, query: string): boolean {
  if (!query) return true;
  let qi = 0;
  for (let i = 0; i < source.length && qi < query.length; i += 1) {
    if (source[i] === query[qi]) qi += 1;
  }
  return qi === query.length;
}

function fuzzyMatches(source: string, query: string): boolean {
  if (!query) return true;
  if (source.includes(query)) return true;
  const sourceTokens = source.split(/\s+/).filter(Boolean);
  const queryTokens = query.split(/\s+/).filter(Boolean);
  if (queryTokens.length === 0) return true;
  return queryTokens.every((token) =>
    sourceTokens.some(
      (sourceToken) =>
        sourceToken.startsWith(token) ||
        isSubsequenceMatch(sourceToken, token),
    ),
  );
}

function normalizePatentToken(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function extractPatentTokens(value: string): string[] {
  const raw = value.toUpperCase();
  const matches = raw.match(/[A-Z]{4}\s*-?\s*\d{2}/g) ?? [];
  const normalized = matches
    .map((token) => normalizePatentToken(token))
    .filter((token) => /^[A-Z]{4}\d{2}$/.test(token));
  const compact = normalizePatentToken(raw);
  if (/^[A-Z]{4}\d{2}$/.test(compact)) normalized.push(compact);
  return Array.from(new Set(normalized));
}

function resolveAutoImportPatent(rawTerm: string): string | null {
  const tokens = extractPatentTokens(rawTerm);
  if (tokens.length === 1) return tokens[0];
  const compact = normalizePatentToken(rawTerm.trim());
  if (/^[A-Z]{4}\d{2}$/.test(compact)) return compact;
  return null;
}

function getCatalogItemDedupeKey(item: CatalogItem): string {
  const patent = normalizePatentToken(getPatent(item));
  if (patent && patent !== "—") return patent;
  return getVehicleKey(item);
}

function catalogItemIdentityScore(item: CatalogItem): number {
  const patente = getPatent(item);
  let score = 0;
  if (getModel(item) !== "Sin Modelo") score += 3;
  if (item.title?.trim() && !isStaleEditorDraftValue(item.title, patente)) score += 3;
  if (item.thumbnail?.startsWith("http") && !item.thumbnail.includes("placeholder")) score += 1;
  return score;
}

function dedupeCatalogItemsByVehicleKey(list: CatalogItem[]): CatalogItem[] {
  const map = new Map<string, CatalogItem>();
  for (const item of list) {
    const dedupeKey = getCatalogItemDedupeKey(item);
    const existing = map.get(dedupeKey);
    if (!existing) {
      map.set(dedupeKey, item);
      continue;
    }
    const existingScore = catalogItemIdentityScore(existing);
    const incomingScore = catalogItemIdentityScore(item);
    if (incomingScore >= existingScore) {
      map.set(dedupeKey, item);
    }
  }
  return Array.from(map.values());
}

function resolveVehicleListTitle(
  item: CatalogItem,
  vehicleDetails: Record<string, EditorVehicleDetails>,
): string {
  const patente = getPatent(item);
  const override = getEditorOverrideForItem(item, vehicleDetails);
  const overrideTitle = resolveIdentityDraftField(override?.title, "", patente);
  if (overrideTitle) return overrideTitle;

  const itemTitle = item.title?.trim();
  if (itemTitle && !isStaleEditorDraftValue(itemTitle, patente)) return itemTitle;

  const autoTitle = buildAutoVehicleTitle({
    brand: resolveIdentityDraftField(override?.brand, "", patente),
    model: resolveIdentityDraftField(override?.model, "", patente),
    year: resolveIdentityDraftField(override?.year, "", patente),
    version: override?.version,
    title: override?.title,
    patente,
  } as EditorVehicleDetails);
  if (autoTitle) return autoTitle;

  return getModel(item);
}

function isAssignedVehicleKey(
  assignedKeys: Set<string>,
  item: CatalogItem,
): boolean {
  const key = getVehicleKey(item);
  if (assignedKeys.has(key)) return true;
  const patent = normalizePatentToken(getPatent(item));
  return patent.length > 0 && assignedKeys.has(patent);
}

function isFullPatentToken(value: string): boolean {
  return /^[A-Z]{4}\d{2}$/.test(normalizePatentToken(value));
}

function matchesInventoryPatentSearch(
  item: CatalogItem,
  rawTerm: string,
  patentTokens: string[],
  allowPatentSearch = true,
): boolean {
  if (!allowPatentSearch) return false;
  const patent = normalizePatentToken(getPatent(item));
  const key = normalizePatentToken(getVehicleKey(item));
  if (patentTokens.length > 0) {
    return patentTokens.some((token) => {
      if (isFullPatentToken(token)) {
        return patent === token || key === token;
      }
      return (
        patent === token ||
        key === token ||
        patent.startsWith(token) ||
        key.startsWith(token)
      );
    });
  }
  const query = normalizeText(rawTerm);
  if (!query) return false;
  const patentQuery = normalizePatentToken(rawTerm);
  if (isFullPatentToken(patentQuery)) {
    return patent === patentQuery || key === patentQuery;
  }
  if (patentQuery.length >= 3 && (patent.startsWith(patentQuery) || key.startsWith(patentQuery))) {
    return true;
  }
  const sample = normalizeText(`${patent} ${key} ${getModel(item)} ${item.title} ${item.subtitle ?? ""}`);
  return sample.includes(query);
}

function normalizeLookupKey(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]/g, "");
}

function buildVehicleLookup(
  source: unknown,
  lookup: Map<string, unknown> = new Map(),
  path = "",
): Map<string, unknown> {
  if (!source || typeof source !== "object") return lookup;

  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    const currentPath = path ? `${path}.${key}` : key;
    const normalizedPath = normalizeLookupKey(currentPath);
    const normalizedLeaf = normalizeLookupKey(key);

    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      buildVehicleLookup(value, lookup, currentPath);
      continue;
    }

    if (!lookup.has(normalizedPath)) lookup.set(normalizedPath, value);
    if (!lookup.has(normalizedLeaf)) lookup.set(normalizedLeaf, value);
  }

  return lookup;
}

function getLookupValue(
  lookup: Map<string, unknown>,
  aliases: string[],
): unknown {
  for (const alias of aliases) {
    const value = lookup.get(normalizeLookupKey(alias));
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return undefined;
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function isBaseHomeSectionOrderId(value: string): value is SectionId {
  return (BASE_HOME_SECTION_ORDER as string[]).includes(value);
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

/** Patentes normalizadas del inventario visible (para cruzar lotes de un evento Rainworx). */
function collectInventoryPatentesForRainworx(catalogItems: CatalogItem[]): string[] {
  const set = new Set<string>();
  for (const item of catalogItems) {
    const raw = item.raw as Record<string, unknown>;
    const patent = [raw.patente, raw.PATENTE, raw.PPU, raw.stock_number].find(
      (v) => typeof v === "string" && v.trim(),
    ) as string | undefined;
    const k = normalizePatenteKey(patent);
    if (k) set.add(k);
  }
  return [...set];
}

/** Patente a exigir contra Rainworx: borrador del modal o dato en inventario. */
function getExpectedPatenteForRainworx(item: CatalogItem, details: EditorVehicleDetails): string | undefined {
  const fromDraft = normalizePatenteKey(details.patente);
  if (fromDraft) return fromDraft;
  const label = getPatent(item);
  if (!label || label === "—") return undefined;
  return normalizePatenteKey(label);
}

function isPatenteLikeModelValue(value: string, patent: string): boolean {
  if (!value.trim() || !patent || patent === "—") return false;
  return normalizePatentToken(value) === normalizePatentToken(patent);
}

function getModel(item: CatalogItem): string {
  const raw = item.raw as Record<string, unknown>;
  const patent = getPatent(item);
  const candidates = [raw.modelo, raw.model, raw.model2, item.title];
  for (const value of candidates) {
    if (typeof value !== "string" || !value.trim()) continue;
    const trimmed = value.trim();
    if (isPlaceholderVehicleLabel(trimmed)) continue;
    if (isPatenteLikeModelValue(trimmed, patent)) continue;
    if (/^unidad\s+[a-z0-9]{5,10}$/i.test(trimmed)) continue;
    return trimmed;
  }
  return "Sin Modelo";
}

function inferVehicleType(item: CatalogItem): VehicleTypeId {
  const raw = item.raw as Record<string, unknown>;
  const lookup = buildVehicleLookup(raw);
  const normalizedCategory = normalizeVehicleCategoryValue(
    String(
      getLookupValue(lookup, [
        "categoria",
        "category",
        "tipo_vehiculo",
        "tipo",
        "vehicle_type",
        "aws.categoria",
        "aws.tipo_vehiculo",
        "aws_campos.categoria",
      ]) ?? "",
    ),
  );
  if (normalizedCategory === "vehiculo_liviano") return "livianos";
  if (normalizedCategory === "vehiculo_pesado") return "pesados";
  if (normalizedCategory === "maquinaria") return "maquinaria";

  const sample = normalizeText(
    [item.title, item.subtitle, raw.categoria, raw.tipo_vehiculo, raw.description]
      .filter(Boolean)
      .join(" "),
  );

  if (/(retro|excav|motoniv|bulldo|cargador|grua horquilla|maquinaria)/.test(sample)) return "maquinaria";
  if (/(auto|suv|sedan|hatch|pickup|camioneta|station)/.test(sample)) return "livianos";
  if (/\b(camion(?!eta)|bus|tracto|tolva|pesad|semi|rampla|grua)\b/.test(sample)) return "pesados";
  return "otros";
}

function getVehicleBodyTypeSample(
  item: CatalogItem,
  vehicleDetails?: Record<string, EditorVehicleDetails>,
): string {
  const raw = item.raw as Record<string, unknown>;
  const lookup = buildVehicleLookup(raw);
  const key = getVehicleKey(item);
  const details = vehicleDetails?.[key];
  const parts = [
    item.title,
    item.subtitle,
    details?.tipo,
    details?.tipoVehiculo,
    getLookupValue(lookup, [
      "tipo_de_vehiculo",
      "tipo_vehiculo",
      "vehicle_type",
      "tipo",
      "type",
      "body_type",
      "categoria",
      "glo3d.tipo_de_vehiculo",
      "glo3d.tipo_vehiculo",
    ]),
    raw.description,
  ];
  return normalizeText(parts.filter(Boolean).join(" "));
}

function matchesVehicleBodyTypeFilter(
  item: CatalogItem,
  filterId: QuickFilterId,
  vehicleDetails: Record<string, EditorVehicleDetails>,
): boolean {
  const sample = getVehicleBodyTypeSample(item, vehicleDetails);
  if (filterId === "camion" && /\bcamioneta\b/.test(sample)) return false;
  return VEHICLE_BODY_TYPE_MATCHERS[filterId].some((pattern) => pattern.test(sample));
}

function isAllowedHomeBodyFilter(id: string): id is (typeof HOME_BODY_FILTER_IDS)[number] {
  return (HOME_BODY_FILTER_IDS as readonly string[]).includes(id);
}

function inferVehicleCategoryForAdmin(item: CatalogItem): EditorVehicleCategoryFilter {
  const raw = item.raw as Record<string, unknown>;
  const lookup = buildVehicleLookup(raw);
  const normalizedCategory = normalizeVehicleCategoryValue(
    String(
      getLookupValue(lookup, [
        "categoria",
        "category",
        "tipo_vehiculo",
        "tipo",
        "vehicle_type",
        "aws.categoria",
        "aws.tipo_vehiculo",
        "aws_campos.categoria",
      ]) ?? "",
    ),
  );

  if (normalizedCategory === "vehiculo_liviano") return "livianos";
  if (normalizedCategory === "vehiculo_pesado") return "pesados";
  if (normalizedCategory === "maquinaria") return "maquinaria";
  if (normalizedCategory === "chatarra") return "chatarra";
  if (normalizedCategory === "otros") return "otros";

  const sample = normalizeText(
    [item.title, item.subtitle, raw.categoria, raw.tipo_vehiculo, raw.description]
      .filter(Boolean)
      .join(" "),
  );
  if (/chatarra|scrap/.test(sample)) return "chatarra";
  return inferVehicleType(item);
}

function formatPrice(value?: string): string | null {
  if (!value?.trim()) return null;
  const sample = value.trim();
  const clean = sample.replace(/[^\d]/g, "");
  if (!clean) return null;
  const amount = Number(clean);
  if (!Number.isFinite(amount)) return null;
  const hasIva = /\biva\b/i.test(sample) && !/sin\s*iva/i.test(sample);
  const base = new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(amount);
  return hasIva ? `${base} + IVA` : base;
}

function isPromoEnabledValue(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

function pickFirstTextValue(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function getRawPromoMeta(raw: Record<string, unknown>): {
  promoEnabled: boolean;
  originalPriceLabel: string | null;
  promoPriceLabel: string | null;
} {
  const promoEnabled = isPromoEnabledValue(raw.promo_enabled);
  const originalPriceLabel = pickFirstTextValue([raw.precio_normal, raw.original_price]);
  const promoPriceLabel = pickFirstTextValue([raw.precio_promocional, raw.promo_price]);
  return { promoEnabled, originalPriceLabel, promoPriceLabel };
}

function getConditionBadgeClasses(condition?: string | null): string {
  const sample = normalizeText(condition ?? "");
  if (!sample) return "border-slate-200 bg-slate-100 text-slate-700";
  if (/100% operativo|operativo/.test(sample)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (/no arranca|desarme/.test(sample)) {
    return "border-rose-200 bg-rose-50 text-rose-800";
  }
  if (/problema|recuperado|robo/.test(sample)) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  return "border-indigo-200 bg-indigo-50 text-indigo-800";
}

function normalizeVehicleCategoryValue(value?: string): string {
  const sample = normalizeText(value ?? "");
  if (!sample) return "";
  if (/livian|vehiculoliviano/.test(sample)) return "vehiculo_liviano";
  if (/pesad|vehiculopesado/.test(sample)) return "vehiculo_pesado";
  if (/maquinaria|maquina/.test(sample)) return "maquinaria";
  if (/chatarra|scrap/.test(sample)) return "chatarra";
  if (/otros|other/.test(sample)) return "otros";
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
}

function getVehicleCategoryLabel(value?: string): string {
  const normalized = normalizeVehicleCategoryValue(value);
  const known = VEHICLE_CATEGORY_OPTIONS.find((option) => option.value === normalized);
  if (known) return known.label;
  if (!value) return "—";
  return value.replace(/_/g, " ");
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

function formatAuctionWindowLabel(auction: UpcomingAuction): string {
  const CHILE_TIME_ZONE = "America/Santiago";
  const inicio = auction.startAt ? new Date(auction.startAt) : null;
  const cierre = auction.endAt ? new Date(auction.endAt) : null;
  if (inicio && cierre && !Number.isNaN(inicio.getTime()) && !Number.isNaN(cierre.getTime())) {
    const fmt = (date: Date) =>
      date.toLocaleString("es-CL", {
        timeZone: CHILE_TIME_ZONE,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    return `${fmt(inicio)} → ${fmt(cierre)}`;
  }
  return formatAuctionDateLabel(auction.date);
}

function getTimeZoneOffsetMinutes(timeZone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
  }).formatToParts(date);
  const zonePart = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT+0";
  const match = zonePart.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/i);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] ?? "0");
  const minutes = Number(match[3] ?? "0");
  return sign * (hours * 60 + minutes);
}

function buildDateInTimeZone(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  timeZone: string,
): Date {
  let utcMs = Date.UTC(year, month - 1, day, hours, minutes, 0, 0);
  for (let i = 0; i < 2; i += 1) {
    const offsetMinutes = getTimeZoneOffsetMinutes(timeZone, new Date(utcMs));
    utcMs = Date.UTC(year, month - 1, day, hours, minutes, 0, 0) - offsetMinutes * 60 * 1000;
  }
  return new Date(utcMs);
}

function toChileIsoDateTime(dateYmd: string, timeHm: string): string | null {
  const m = dateYmd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const hhmm = (timeHm || "00:00").match(/^(\d{1,2}):(\d{2})$/);
  if (!hhmm) return null;
  const d = buildDateInTimeZone(
    Number(m[1]),
    Number(m[2]),
    Number(m[3]),
    Number(hhmm[1]),
    Number(hhmm[2]),
    "America/Santiago",
  );
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parseAuctionDateTime(auction: UpcomingAuction): Date | null {
  if (auction.endAt) {
    const end = new Date(auction.endAt);
    if (!Number.isNaN(end.getTime())) return end;
  }
  const rawDate = (auction.date ?? "").trim();
  if (!rawDate) return null;
  const dateMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let year = 0;
  let month = 0;
  let day = 0;
  if (dateMatch) {
    year = Number(dateMatch[1]);
    month = Number(dateMatch[2]);
    day = Number(dateMatch[3]);
  } else {
    const fallback = new Date(rawDate);
    if (Number.isNaN(fallback.getTime())) return null;
    year = fallback.getFullYear();
    month = fallback.getMonth() + 1;
    day = fallback.getDate();
  }
  const timeMatch = auction.name.match(/(\d{1,2}):(\d{2})/);
  let hours = 0;
  let minutes = 0;
  if (timeMatch) {
    hours = Number(timeMatch[1]);
    minutes = Number(timeMatch[2]);
  }

  return buildDateInTimeZone(year, month, day, hours, minutes, "America/Santiago");
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

function pickFirstPriceValue(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return String(Math.round(value));
    }
    if (typeof value === "string") {
      const sample = value.trim();
      if (sample && /\d/.test(sample)) return sample;
    }
  }
  return null;
}

function resolveVehiclePriceRaw(
  item: CatalogItem,
  priceMap: Record<string, string>,
): string | null {
  const key = getVehicleKey(item);
  const configured = priceMap[key];
  if (typeof configured === "string" && configured.trim()) {
    return configured.trim();
  }
  const raw = item.raw as Record<string, unknown>;
  return pickFirstPriceValue([
    raw.precio_minimo_remate,
    raw.precioMinimoRemate,
    raw.precio_minimo,
    raw.precioMinimo,
    raw.valor_minimo,
    raw.valorMinimo,
    raw.precio_base,
    raw.precioBase,
    raw.base_price,
    raw.reference_price,
    raw.precio,
    raw.monto,
  ]);
}

function parseAnalyticsTimestamp(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getAnalyticsEventLabel(eventName: string): string {
  const labels: Record<string, string> = {
    page_view_home: "Vista al home",
    vehicle_detail_open: "Apertura de detalle de vehículo",
    home_search_change: "Búsqueda en home",
    quick_filter_toggle: "Uso de filtro rápido",
    compare_toggle: "Comparar vehículos",
    whatsapp_click_modal_mobile: "Click WhatsApp desde modal (móvil)",
    whatsapp_click_modal: "Click WhatsApp desde modal",
    whatsapp_click_card: "Click WhatsApp en tarjeta",
    whatsapp_click_floating: "Click WhatsApp en botón flotante",
    home_sort_change: "Cambio de orden en listado",
    calendar_pdf_download: "Descarga de PDF del calendario",
    login_modal_open: "Apertura de modal de login",
    offer_modal_open: "Apertura de modal de oferta",
    favorite_toggle: "Agregar/quitar favorito",
    top_filter_click: "Click en sección superior",
    vehicle_share: "Compartir vehículo",
    lead_form_submit: "Envío de formulario de contacto",
    card_open: "Apertura de tarjeta de vehículo",
  };
  if (labels[eventName]) return labels[eventName];
  return eventName
    .replace(/_/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getAnalyticsSectionLabel(sectionName: string): string {
  const labels: Record<string, string> = {
    "sin-seccion": "Sin sección",
    "sin-sección": "Sin sección",
    all: "Todas las secciones",
    "proximos-remates": "Próximos remates",
    "ventas-directas": "Ventas directas",
    novedades: "Novedades",
    catalogo: "Catálogo",
    favoritos: "Favoritos",
    "recien-publicados": "Recién publicados",
    "recién-publicados": "Recién publicados",
  };
  if (labels[sectionName]) return labels[sectionName];
  if (sectionName.startsWith("managed:")) return "Categoría personalizada";
  if (sectionName.startsWith("categoria-")) return "Categoría personalizada";
  return sectionName
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("es-CL").format(value);
}

function parseCurrencyAmount(value?: string | null): number {
  if (!value?.trim()) return 0;
  const digits = value.replace(/[^\d]/g, "");
  const amount = Number(digits);
  return Number.isFinite(amount) ? amount : 0;
}

function formatCurrencyAmount(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "";
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function formatSignedCurrencyAmount(value: number): string {
  if (!Number.isFinite(value)) return "";
  const absolute = formatCurrencyAmount(Math.abs(value));
  if (!absolute) return "";
  if (value > 0) return `+${absolute}`;
  if (value < 0) return `-${absolute}`;
  return absolute;
}

function toCurrencyInput(value: string): string {
  const amount = parseCurrencyAmount(value);
  if (amount <= 0) return "";
  return formatCurrencyAmount(amount);
}

function buildEmptyOfferForm(): OfferFormState {
  return {
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    offerAmount: "",
  };
}

function isValidEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function getOrCreateAnalyticsIds(): { visitorId: string; sessionId: string } {
  if (typeof window === "undefined") return { visitorId: "ssr", sessionId: "ssr" };
  let visitorId = window.localStorage.getItem(ANALYTICS_VISITOR_ID_KEY) ?? "";
  if (!visitorId) {
    visitorId = crypto.randomUUID();
    window.localStorage.setItem(ANALYTICS_VISITOR_ID_KEY, visitorId);
  }
  let sessionId = window.sessionStorage.getItem(ANALYTICS_SESSION_ID_KEY) ?? "";
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    window.sessionStorage.setItem(ANALYTICS_SESSION_ID_KEY, sessionId);
  }
  return { visitorId, sessionId };
}

function trackEvent(eventName: string, payload?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  if (eventName === "page_view_home") {
    const alreadyTracked = window.sessionStorage.getItem(ANALYTICS_SESSION_PAGEVIEW_KEY);
    if (alreadyTracked === "1") return;
    window.sessionStorage.setItem(ANALYTICS_SESSION_PAGEVIEW_KEY, "1");
  }
  const { visitorId, sessionId } = getOrCreateAnalyticsIds();
  const enrichedPayload = mergeAnalyticsPayload(payload);
  const eventPayload = {
    event: eventName,
    timestamp: new Date().toISOString(),
    visitorId,
    sessionId,
    ...enrichedPayload,
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
    window.dispatchEvent(new Event("vedisa-analytics-updated"));
    void fetch("/api/analytics/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: eventName,
        timestamp: eventPayload.timestamp,
        itemKey:
          typeof payload?.itemKey === "string" ? payload.itemKey : undefined,
        section:
          typeof payload?.section === "string" ? payload.section : undefined,
        payload: {
          ...enrichedPayload,
          visitorId: eventPayload.visitorId,
          sessionId: eventPayload.sessionId,
        },
      }),
      keepalive: true,
    }).catch(() => {
      // noop: local analytics remains available even if server tracking fails
    });
  } catch {
    // avoid breaking UX if analytics fails
  }
}

function cleanOptional(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function sanitizeRichHtml(value: string): string {
  let html = value;
  html = html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  html = html.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "");
  html = html.replace(/<\/?(iframe|object|embed|link|meta)[^>]*>/gi, "");
  html = html.replace(/\son\w+\s*=\s*"[^"]*"/gi, "");
  html = html.replace(/\son\w+\s*=\s*'[^']*'/gi, "");
  html = html.replace(/\son\w+\s*=\s*[^\s>]+/gi, "");
  html = html.replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, "");
  return html;
}

function stripRainworxAttributionHtml(html: string): string {
  return html
    .replace(
      /<p[^>]*>\s*(?:<strong>\s*)?Informaci[oó]n importada desde Rainworx(?:\s*<\/strong>)?\s*(?:·|&middot;|&#183;)?\s*<a[^>]*>\s*Ver ficha original\s*<\/a>\s*<\/p>\s*/gi,
      "",
    )
    .replace(/<p[^>]*>\s*Informaci[oó]n importada desde Rainworx[^<]*<\/p>\s*/gi, "")
    .trim();
}

function formatExtendedDescriptionHtml(value?: string | null): string {
  const normalized = String(value ?? "")
    .replace(/\/n/g, "\n")
    .trim();
  if (!normalized) return "Sin descripción adicional para este vehículo.";
  const maybeDecoded =
    /&lt;[a-z][\s\S]*&gt;/i.test(normalized) && !/<[a-z][\s\S]*>/i.test(normalized)
      ? decodeBasicHtmlEntities(normalized)
      : normalized;
  if (/<[a-z][\s\S]*>/i.test(maybeDecoded)) {
    return sanitizeRichHtml(cloudinaryRawUrlsInlineInHtml(stripRainworxAttributionHtml(maybeDecoded)));
  }
  return escapeHtml(normalized).replace(/\n/g, "<br />");
}

function formatHomeHeroHtml(value?: string | null): string {
  const normalized = String(value ?? "")
    .replace(/\/n/g, "\n")
    .trim();
  if (!normalized) return "";
  const maybeDecoded =
    /&lt;[a-z][\s\S]*&gt;/i.test(normalized) && !/<[a-z][\s\S]*>/i.test(normalized)
      ? decodeBasicHtmlEntities(normalized)
      : normalized;
  if (/<[a-z][\s\S]*>/i.test(maybeDecoded)) return sanitizeRichHtml(maybeDecoded);
  return escapeHtml(normalized).replace(/\n/g, "<br />");
}

function normalizeCssColorToHex(value?: string | null): string {
  const sample = String(value ?? "").trim();
  if (!sample) return "#0f172a";
  const hexMatch = sample.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    if (hexMatch[1].length === 3) {
      const [r, g, b] = hexMatch[1].split("");
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    return sample.toLowerCase();
  }
  const rgbMatch = sample.match(
    /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,\/]+[\d.]+)?\s*\)$/i,
  );
  if (!rgbMatch) return "#0f172a";
  const toHex = (raw: string) => {
    const bounded = Math.max(0, Math.min(255, Number(raw)));
    return bounded.toString(16).padStart(2, "0");
  };
  return `#${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`;
}

function normalizeFontFamilyName(value?: string | null): string {
  const normalized = String(value ?? "")
    .replace(/["']/g, "")
    .split(",")[0]
    ?.trim()
    .toLowerCase();
  if (!normalized) return "Inter";
  if (normalized.includes("inter")) return "Inter";
  if (normalized.includes("arial")) return "Arial";
  if (normalized.includes("georgia")) return "Georgia";
  if (normalized.includes("times new roman")) return "Times New Roman";
  if (normalized.includes("courier new")) return "Courier New";
  return normalized
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function stripHtmlToText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeBinaryToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function isValidBinaryValue(value?: string): boolean {
  if (!value?.trim()) return true;
  const normalized = normalizeBinaryToken(value);
  return [
    "si",
    "no",
    "yes",
    "true",
    "false",
    "1",
    "0",
    "s",
    "n",
  ].includes(normalized);
}

function isValidDateValue(value?: string): boolean {
  if (!value?.trim()) return true;
  const sample = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(sample)) {
    const date = new Date(`${sample}T00:00:00`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === sample;
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(sample)) {
    const [dd, mm, yyyy] = sample.split("/").map(Number);
    const date = new Date(yyyy, mm - 1, dd);
    return (
      !Number.isNaN(date.getTime()) &&
      date.getFullYear() === yyyy &&
      date.getMonth() === mm - 1 &&
      date.getDate() === dd
    );
  }
  return false;
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
      precio_normal: entry.originalPrice ?? entry.price,
      precio_promocional: entry.promoPrice ?? (entry.promoEnabled ? entry.price : undefined),
      promo_enabled: entry.promoEnabled ?? false,
      manual_id: entry.id,
    },
  };
}

function extractEstadoRetiroForSection(item: CatalogItem): string {
  const raw = item.raw as Record<string, unknown>;
  const candidate =
    raw.estado_retiro ??
    raw.estadoRetiro ??
    raw.estado_remate ??
    raw.estado ??
    "";
  return String(candidate).trim().toLowerCase();
}

function buildDetailsDraft(item: CatalogItem, override?: EditorVehicleDetails): EditorVehicleDetails {
  const raw = item.raw as Record<string, unknown>;
  const lookup = buildVehicleLookup(raw);
  const cav = (raw.cav_campos as Record<string, unknown> | undefined) ?? {};
  const baseImages = item.images.filter((url) => url.startsWith("http")).join(", ");
  const patente = String(raw.patente ?? raw.PPU ?? raw.stock_number ?? "");
  const itemBrand = String(
    getLookupValue(lookup, ["marca", "brand", "make", "glo3d.make", "autored.marca", "autored_campos.marca"]) ??
      raw.marca ??
      raw.brand ??
      "",
  );
  const itemModel = String(
    getLookupValue(lookup, ["modelo", "model", "model2", "glo3d.model2", "autored.modelo", "autored_campos.modelo"]) ??
      raw.modelo ??
      raw.model ??
      "",
  );
  const itemYear = String(
    getLookupValue(lookup, ["ano", "anio", "year", "glo3d.year", "autored.ano", "autored_campos.ano"]) ??
      raw.ano ??
      raw.anio ??
      raw.year ??
      "",
  );
  return {
    title: resolveIdentityDraftField(override?.title, item.title, patente),
    subtitle: resolveEditorDraftField(override?.subtitle, item.subtitle ?? "", patente),
    patente: resolvePatenteDraftField(override?.patente, patente, getPatent(item)),
    patenteVerifier:
      override?.patenteVerifier ??
      String(
        getLookupValue(lookup, [
          "patente_verifier",
          "patente_dv",
          "ppu_dv",
          "dv",
          "glo3d.patente_verifier",
          "glo3d.ppu_dv",
        ]) ?? "",
      ),
    vin: resolveEditorDraftField(
      override?.vin,
      String(
        getLookupValue(lookup, ["vin", "n_de_vin", "numero_chasis", "nro_chasis", "glo3d.n_de_vin"]) ??
          raw.vin ??
          cav.vin ??
          cav.numero_chasis ??
          "",
      ),
      patente,
    ),
    nChasis: resolveEditorDraftField(
      override?.nChasis,
      String(
        getLookupValue(lookup, [
          "n_de_chasis",
          "numero_chasis",
          "nro_chasis",
          "chasis",
          "glo3d.n_de_chasis",
          "autored.n_de_chasis",
          "autored.numero_chasis",
        ]) ??
          getLookupValue(lookup, ["vin", "n_de_vin", "numero_vin", "extracted_vin", "glo3d.n_de_vin", "autored.vin"]) ??
          "",
      ),
      patente,
    ),
    nMotor: resolveEditorDraftField(
      override?.nMotor,
      String(
        getLookupValue(lookup, ["n_de_motor", "numero_motor", "motor_number", "ndm", "glo3d.n_de_motor", "glo3d.ndm"]) ??
          "",
      ),
      patente,
    ),
    nSerie: resolveEditorDraftField(
      override?.nSerie,
      String(
        getLookupValue(lookup, ["n_de_serie", "numero_serie", "serial_number", "nds", "glo3d.n_de_serie", "glo3d.nds"]) ??
          "",
      ),
      patente,
    ),
    nSiniestro:
      override?.nSiniestro ??
      String(getLookupValue(lookup, ["n_de_siniestro", "numero_siniestro", "n_s", "ns", "glo3d.n_de_siniestro", "glo3d.n_s"]) ?? ""),
    version: resolveEditorDraftField(
      override?.version,
      String(getLookupValue(lookup, ["version", "ver", "trim", "glo3d.version", "glo3d.trim"]) ?? ""),
      patente,
    ),
    tipo:
      override?.tipo ??
      String(getLookupValue(lookup, ["tipo", "type", "tipo_unidad", "glo3d.tipo"]) ?? ""),
    tipoVehiculo:
      override?.tipoVehiculo ??
      String(getLookupValue(lookup, ["tipo_de_vehiculo", "tipo_vehiculo", "vehicle_type", "glo3d.tipo_de_vehiculo"]) ?? ""),
    vehicleCondition:
      override?.vehicleCondition ??
      String(
        getLookupValue(lookup, [
          "condicion",
          "condición",
          "condicion_vehiculo",
          "estado_vehiculo",
          "estado",
          "status",
          "aws.condicion",
          "aws.estado",
        ]) ??
          item.status ??
          "",
      ),
    status: override?.status ?? (item.status ?? ""),
    location: override?.location ?? (item.location ?? ""),
    ubicacionFisica:
      override?.ubicacionFisica ??
      String(getLookupValue(lookup, ["ubicacion_fisica", "ubi", "ubicacion", "location", "glo3d.ubicacion_fisica"]) ?? ""),
    transportista:
      override?.transportista ??
      String(getLookupValue(lookup, ["transportista", "tra", "glo3d.transportista"]) ?? ""),
    taller:
      override?.taller ??
      String(getLookupValue(lookup, ["taller", "tal", "glo3d.taller"]) ?? ""),
    lot: override?.lot ?? (item.lot ?? ""),
    auctionDate: override?.auctionDate ?? (item.auctionDate ?? ""),
    description: override?.description ?? String(raw.descripcion ?? raw.description ?? ""),
    extendedDescription:
      override?.extendedDescription ??
      String(
        getLookupValue(lookup, [
          "descripcion_ampliada",
          "observaciones",
          "detalle",
          "descripcion",
          "description",
          "aws.observaciones",
          "aws.descripcion",
          "aws.description",
          "cav_campos.observaciones",
          "cav_campos.descripcion",
        ]) ?? "",
      ),
    brand: resolveIdentityDraftField(override?.brand, itemBrand, patente),
    model: resolveIdentityDraftField(override?.model, itemModel, patente),
    year: resolveIdentityDraftField(override?.year, itemYear, patente),
    category: override?.category ?? String(raw.categoria ?? ""),
    kilometraje: resolveEditorDraftField(
      override?.kilometraje,
      String(
        getLookupValue(lookup, ["kilometraje", "km", "mileage", "odometro", "glo3d.mileage", "glo3d.kilometraje"]) ??
          raw.kilometraje ??
          cav.kilometraje ??
          cav.km ??
          "",
      ),
      patente,
    ),
    color: resolveEditorDraftField(
      override?.color,
      String(getLookupValue(lookup, ["color", "color_exterior", "glo3d.color"]) ?? raw.color ?? cav.color ?? ""),
      patente,
    ),
    combustible: resolveEditorDraftField(
      override?.combustible,
      String(
        getLookupValue(lookup, [
          "combustible",
          "fuel",
          "fuel_type",
          "glo3d.combustible",
          "glo3d.fuel",
          "autored.combustible",
          "autored.fuel_type",
        ]) ??
          raw.combustible ??
          cav.combustible ??
          "",
      ),
      patente,
    ),
    transmision: resolveEditorDraftField(
      override?.transmision,
      String(
        getLookupValue(lookup, [
          "transmision",
          "caja",
          "transmission",
          "glo3d.transmision",
          "glo3d.caja",
          "autored.transmision",
          "autored.caja",
        ]) ??
          raw.transmision ??
          cav.transmision ??
          cav.caja ??
          "",
      ),
      patente,
    ),
    traccion: resolveEditorDraftField(
      override?.traccion,
      String(
        getLookupValue(lookup, ["traccion", "tipo_traccion", "drive_type", "glo3d.traccion"]) ??
          raw.traccion ??
          cav.traccion ??
          "",
      ),
      patente,
    ),
    aro: resolveEditorDraftField(
      override?.aro,
      String(
        getLookupValue(lookup, ["aro", "rin", "rines", "glo3d.aro", "glo3d.rin", "autored.aro"]) ??
          raw.aro ??
          cav.aro ??
          "",
      ),
      patente,
    ),
    cilindrada: override?.cilindrada ?? String(raw.cilindrada ?? cav.cilindrada ?? ""),
    llaves: resolveEditorDraftField(
      override?.llaves,
      String(getLookupValue(lookup, ["llaves", "keys", "has_keys", "tiene_llaves", "glo3d.llaves", "glo3d.lla"]) ?? ""),
      patente,
    ),
    aireAcondicionado:
      override?.aireAcondicionado ??
      String(getLookupValue(lookup, ["aire_acondicionado", "air_conditioning", "has_ac", "ac", "glo3d.aire_acondicionado"]) ?? ""),
    unicoPropietario:
      override?.unicoPropietario ??
      String(getLookupValue(lookup, ["unico_propietario", "single_owner", "one_owner", "glo3d.unico_propietario"]) ?? ""),
    condicionado:
      override?.condicionado ??
      String(getLookupValue(lookup, ["condicionado", "conditioned", "acondicionado", "glo3d.condicionado"]) ?? ""),
    multas:
      override?.multas ??
      String(getLookupValue(lookup, ["multas", "mul", "glo3d.multas"]) ?? ""),
    tag: override?.tag ?? String(getLookupValue(lookup, ["tag", "glo3d.tag"]) ?? ""),
    vencRevisionTecnica:
      override?.vencRevisionTecnica ??
      String(getLookupValue(lookup, ["vencimiento_revision_tecnica", "vrt", "glo3d.vencimiento_revision_tecnica"]) ?? ""),
    vencPermisoCirculacion:
      override?.vencPermisoCirculacion ??
      String(getLookupValue(lookup, ["vencimiento_permiso_circulacion", "vpc", "glo3d.vencimiento_permiso_circulacion"]) ?? ""),
    vencSeguroObligatorio:
      override?.vencSeguroObligatorio ??
      String(getLookupValue(lookup, ["vencimiento_seguro_obligatorio", "vso", "glo3d.vencimiento_seguro_obligatorio"]) ?? ""),
    pruebaMotor: resolvePruebaMotorSiNo(
      override?.pruebaMotor,
      String(
        getLookupValue(lookup, [
          ...PRUEBA_MOTOR_LOOKUP_KEYS,
          ...PRUEBA_MOTOR_LOOKUP_KEYS.map((key) => `glo3d.${key}`),
        ]) ?? "",
      ),
    ),
    pruebaDesplazamiento: resolvePruebaDesplazamientoSiNo(
      override?.pruebaDesplazamiento,
      String(
        getLookupValue(lookup, [
          ...PRUEBA_DESPLAZAMIENTO_LOOKUP_KEYS,
          ...PRUEBA_DESPLAZAMIENTO_LOOKUP_KEYS.map((key) => `glo3d.${key}`),
        ]) ?? "",
      ),
    ),
    estadoAirbags:
      override?.estadoAirbags ??
      String(getLookupValue(lookup, ["estado_airbags", "eda", "glo3d.estado_airbags"]) ?? ""),
    nombrePropietarioAnterior:
      override?.nombrePropietarioAnterior ??
      String(getLookupValue(lookup, ["nombre_propietario_anterior", "npa", "glo3d.nombre_propietario_anterior"]) ?? ""),
    rutPropietarioAnterior:
      override?.rutPropietarioAnterior ??
      String(getLookupValue(lookup, ["rut_propietario_anterior", "rpa", "glo3d.rut_propietario_anterior"]) ?? ""),
    rutVerificador:
      override?.rutVerificador ??
      String(getLookupValue(lookup, ["rut_verificador", "verifier_rut", "glo3d.rut_verificador"]) ?? ""),
    thumbnail: override?.thumbnail ?? (item.thumbnail ?? ""),
    view3dUrl: override?.view3dUrl ?? (item.view3dUrl ?? ""),
    imagesCsv: override?.imagesCsv ?? baseImages,
    lotDocumentsJson:
      override?.lotDocumentsJson ??
      String(
        getLookupValue(lookup, ["documentos_lote_json", "lot_documents_json", "glo3d.documentos_lote_json"]) ?? "",
      ),
  };
}

function sanitizeDetails(details: EditorVehicleDetails): EditorVehicleDetails | undefined {
  const clean: EditorVehicleDetails = {
    title: cleanOptional(details.title),
    subtitle: cleanOptional(details.subtitle),
    patente: cleanOptional(details.patente),
    patenteVerifier: cleanOptional(details.patenteVerifier),
    vin: cleanOptional(details.vin),
    nChasis: cleanOptional(details.nChasis),
    nMotor: cleanOptional(details.nMotor),
    nSerie: cleanOptional(details.nSerie),
    nSiniestro: cleanOptional(details.nSiniestro),
    version: cleanOptional(details.version),
    tipo: cleanOptional(details.tipo),
    tipoVehiculo: cleanOptional(details.tipoVehiculo),
    vehicleCondition: cleanOptional(details.vehicleCondition),
    status: cleanOptional(details.status),
    location: cleanOptional(details.location),
    ubicacionFisica: cleanOptional(details.ubicacionFisica),
    transportista: cleanOptional(details.transportista),
    taller: cleanOptional(details.taller),
    lot: cleanOptional(details.lot),
    auctionDate: cleanOptional(details.auctionDate),
    description: cleanOptional(details.description),
    extendedDescription: cleanOptional(details.extendedDescription),
    brand: cleanOptional(details.brand),
    model: cleanOptional(details.model),
    year: cleanOptional(details.year),
    category: cleanOptional(details.category),
    kilometraje: cleanOptional(details.kilometraje),
    color: cleanOptional(details.color),
    combustible: cleanOptional(details.combustible),
    transmision: cleanOptional(details.transmision),
    traccion: cleanOptional(details.traccion),
    aro: cleanOptional(details.aro),
    cilindrada: cleanOptional(details.cilindrada),
    llaves: cleanOptional(details.llaves),
    aireAcondicionado: cleanOptional(details.aireAcondicionado),
    unicoPropietario: cleanOptional(details.unicoPropietario),
    condicionado: cleanOptional(details.condicionado),
    multas: cleanOptional(details.multas),
    tag: cleanOptional(details.tag),
    vencRevisionTecnica: cleanOptional(details.vencRevisionTecnica),
    vencPermisoCirculacion: cleanOptional(details.vencPermisoCirculacion),
    vencSeguroObligatorio: cleanOptional(details.vencSeguroObligatorio),
    pruebaMotor: cleanOptional(resolvePruebaMotorSiNo(details.pruebaMotor)),
    pruebaDesplazamiento: cleanOptional(resolvePruebaDesplazamientoSiNo(details.pruebaDesplazamiento)),
    estadoAirbags: cleanOptional(details.estadoAirbags),
    nombrePropietarioAnterior: cleanOptional(details.nombrePropietarioAnterior),
    rutPropietarioAnterior: cleanOptional(details.rutPropietarioAnterior),
    rutVerificador: cleanOptional(details.rutVerificador),
    thumbnail: cleanOptional(details.thumbnail),
    view3dUrl: cleanOptional(normalizeGlo3dViewerInput(details.view3dUrl)),
    imagesCsv: cleanOptional(details.imagesCsv),
    lotDocumentsJson: cleanOptional(details.lotDocumentsJson),
  };

  if (Object.values(clean).every((value) => !value)) return undefined;
  return clean;
}

type SectionProps = {
  id: string;
  title: string;
  subtitle: string;
  items: CatalogItem[];
  priceMap: Record<string, string>;
  upcomingAuctionByVehicleKey?: Record<string, VehicleCommercialEventBadge>;
  onOpenVehicle: (item: CatalogItem) => void;
  cardDensity: CardDensity;
  showPatents?: boolean;
};

const MOBILE_SECTION_PREVIEW_COUNT = 3;

type HorizontalCardsRailProps = {
  sectionKey: string;
  items: CatalogItem[];
  priceMap: Record<string, string>;
  upcomingAuctionByVehicleKey?: Record<string, VehicleCommercialEventBadge>;
  onOpenVehicle: (item: CatalogItem) => void;
  cardDensity: CardDensity;
  showPatents?: boolean;
  loading?: boolean;
};

type CatalogSectionCardsProps = HorizontalCardsRailProps;

function HorizontalCardsRail({
  sectionKey,
  items,
  priceMap,
  upcomingAuctionByVehicleKey,
  onOpenVehicle,
  cardDensity,
  showPatents = true,
  loading = false,
}: HorizontalCardsRailProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const dragStartXRef = useRef(0);
  const dragStartScrollLeftRef = useRef(0);
  const draggedRef = useRef(false);

  const updateScrollArrows = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    const maxScrollLeft = Math.max(0, node.scrollWidth - node.clientWidth);
    const hasOverflow = maxScrollLeft > 4;
    setCanScrollLeft(hasOverflow && node.scrollLeft > 4);
    setCanScrollRight(hasOverflow && node.scrollLeft < maxScrollLeft - 4);
    const firstCard = node.firstElementChild as HTMLElement | null;
    const cardWidth = firstCard?.getBoundingClientRect().width ?? 1;
    const gap = 14;
    const index = cardWidth > 0 ? Math.round(node.scrollLeft / (cardWidth + gap)) : 0;
    setActiveIndex(Math.min(Math.max(index, 0), Math.max(items.length - 1, 0)));
  }, [items.length]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    updateScrollArrows();
    const onScroll = () => updateScrollArrows();
    const onResize = () => updateScrollArrows();
    node.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      node.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [items.length, updateScrollArrows]);

  const scrollByAmount = (direction: "left" | "right") => {
    const node = scrollRef.current;
    if (!node) return;
    const firstCard = node.firstElementChild as HTMLElement | null;
    const cardWidth = firstCard?.getBoundingClientRect().width ?? 300;
    const cardsPerStep = typeof window !== "undefined" && window.innerWidth >= 1200 ? 6 : 1;
    const gap = 16;
    const amount = Math.max(cardWidth + gap, Math.round((cardWidth + gap) * cardsPerStep));
    const offset = direction === "left" ? -amount : amount;
    node.scrollBy({ left: offset, behavior: "smooth" });
    window.setTimeout(() => updateScrollArrows(), 320);
  };

  const onMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    const node = scrollRef.current;
    if (!node) return;
    setIsDragging(true);
    draggedRef.current = false;
    dragStartXRef.current = event.clientX;
    dragStartScrollLeftRef.current = node.scrollLeft;
  };

  const onMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    const node = scrollRef.current;
    if (!node || !isDragging) return;
    const delta = event.clientX - dragStartXRef.current;
    if (Math.abs(delta) > 6) draggedRef.current = true;
    node.scrollLeft = dragStartScrollLeftRef.current - delta;
  };

  const endDrag = () => {
    setIsDragging(false);
    window.setTimeout(() => {
      draggedRef.current = false;
    }, 20);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      scrollByAmount("left");
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      scrollByAmount("right");
    }
  };

  return (
    <div className="catalog-rail-shell relative">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-700" aria-live="polite">
          {items.length > 0 ? `${activeIndex + 1} de ${items.length}` : "Sin unidades"}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => scrollByAmount("left")}
            disabled={!canScrollLeft}
            className={`catalog-rail-nav-btn ui-focus ${canScrollLeft ? "" : "pointer-events-none opacity-40"}`}
            aria-label="Desplazar tarjetas hacia la izquierda"
            title="Anterior"
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M12.78 4.22a.75.75 0 0 1 0 1.06L8.06 10l4.72 4.72a.75.75 0 1 1-1.06 1.06l-5.25-5.25a.75.75 0 0 1 0-1.06l5.25-5.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => scrollByAmount("right")}
            disabled={!canScrollRight}
            className={`catalog-rail-nav-btn ui-focus ${canScrollRight ? "" : "pointer-events-none opacity-40"}`}
            aria-label="Desplazar tarjetas hacia la derecha"
            title="Siguiente"
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M7.22 15.78a.75.75 0 0 1 0-1.06L11.94 10 7.22 5.28a.75.75 0 1 1 1.06-1.06l5.25 5.25a.75.75 0 0 1 0 1.06l-5.25 5.25a.75.75 0 0 1-1.06 0Z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
      {loading ? (
        <div className="catalog-rail">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={`rail-skeleton-${sectionKey}-${index}`} className="catalog-rail-item">
              <div className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
            </div>
          ))}
        </div>
      ) : (
      <div
        ref={scrollRef}
        className={`catalog-rail select-none ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
        tabIndex={0}
        role="region"
        aria-label={`Carrusel ${sectionKey}: usa flechas izquierda y derecha`}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        onKeyDown={onKeyDown}
      >
        {items.map((item) => (
          <div key={`${sectionKey}-${item.id}`} className="catalog-rail-item">
            <CatalogCard
              item={item}
              priceLabel={formatPrice(resolveVehiclePriceRaw(item, priceMap) ?? undefined)}
              commercialEventBadge={upcomingAuctionByVehicleKey?.[getVehicleKey(item)]}
              density={cardDensity}
              showPatents={showPatents}
              onOpen={() => {
                if (draggedRef.current) return;
                onOpenVehicle(item);
              }}
              onWhatsappClick={() =>
                trackEvent("whatsapp_click_card", {
                  section: sectionKey,
                  itemKey: getVehicleKey(item),
                  patent: getPatent(item),
                  vehicleTitle: getModel(item),
                  commercialLane:
                    upcomingAuctionByVehicleKey?.[getVehicleKey(item)]?.kind ?? undefined,
                })
              }
            />
          </div>
        ))}
      </div>
      )}
    </div>
  );
}

function CatalogSectionCards({
  sectionKey,
  items,
  priceMap,
  upcomingAuctionByVehicleKey,
  onOpenVehicle,
  cardDensity,
  showPatents = true,
  loading = false,
}: CatalogSectionCardsProps & { loading?: boolean }) {
  if (items.length === 0 && !loading) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
        No hay unidades visibles en esta sección por ahora.
      </div>
    );
  }

  return (
    <HorizontalCardsRail
      sectionKey={sectionKey}
      items={items}
      priceMap={priceMap}
      upcomingAuctionByVehicleKey={upcomingAuctionByVehicleKey}
      onOpenVehicle={onOpenVehicle}
      cardDensity={cardDensity}
      showPatents={showPatents}
      loading={loading}
    />
  );
}

function Section({
  id,
  title,
  subtitle,
  items,
  priceMap,
  upcomingAuctionByVehicleKey,
  onOpenVehicle,
  cardDensity,
  showPatents = true,
}: SectionProps) {
  const resolvedSubtitle =
    id === "ventas-directas" && subtitle.includes("Stock disponible")
      ? "Compra directa, sin esperar remate · Retiro ágil desde nuestra bodega en Pudahuel."
      : subtitle;

  return (
    <section id={id} className="section-shell home-section-enter scroll-mt-24">
      <header className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="premium-kicker">Sección destacada</p>
          <h2 className="text-2xl font-bold text-slate-900 md:text-3xl">{title}</h2>
          <p className="mt-1 text-sm text-slate-700">{resolvedSubtitle}</p>
        </div>
        <span className="inline-flex w-fit rounded-full bg-cyan-100 px-3 py-1 text-xs font-semibold text-cyan-950">
          {items.length} publicaciones
        </span>
      </header>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
          No encontramos unidades en esta sección. Prueba limpiar filtros o cambiar el tipo de vehículo.
        </div>
      ) : (
        <CatalogSectionCards
          sectionKey={id}
          items={items}
          priceMap={priceMap}
          upcomingAuctionByVehicleKey={upcomingAuctionByVehicleKey}
          onOpenVehicle={onOpenVehicle}
          cardDensity={cardDensity}
          showPatents={showPatents}
        />
      )}
    </section>
  );
}

type Props = {
  feed: CatalogFeed;
  initialConfig: EditorConfig;
  standaloneVehicleKey?: string;
  standaloneBackHref?: string;
  /** Abre el editor directamente (ruta /admin). */
  initialAdminView?: "editor" | "home";
  /** Muestra login si no hay sesión admin (p. ej. en /admin). */
  openLoginIfGuest?: boolean;
};

export function CatalogHomeClient({
  feed,
  initialConfig,
  standaloneVehicleKey,
  standaloneBackHref: standaloneBackHrefProp = "/vehiculos",
  initialAdminView = "home",
  openLoginIfGuest = false,
}: Props) {
  const router = useRouter();
  const isStandaloneDetailPage = Boolean(standaloneVehicleKey?.trim());
  const [canUseDomPortal, setCanUseDomPortal] = useState(false);
  useEffect(() => {
    setCanUseDomPortal(true);
  }, []);
  const [config, setConfig] = useState<EditorConfig>(() =>
    normalizeEditorConfigClient(initialConfig),
  );
  useEffect(() => {
    lastPersistedConfigRef.current = JSON.stringify(normalizeEditorConfigClient(initialConfig));
    autoSaveReadyRef.current = true;
  }, [initialConfig]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminView, setAdminView] = useState<"editor" | "home">("home");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoSaveState, setAutoSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastAutoSaveAt, setLastAutoSaveAt] = useState<string>("");
  const [liveFeedItems, setLiveFeedItems] = useState<CatalogItem[]>(() =>
    hydrateCatalogItemsWithEditorConfig(feed.items, initialConfig),
  );
  const lastAutoImportPatentRef = useRef("");
  const [homeSearchTerm, setHomeSearchTerm] = useState("");
  const [homeSort, setHomeSort] = useState<SortOption>("recomendado");
  const [topSectionFilter, setTopSectionFilter] = useState<"all" | SectionId>("all");
  const [showHomeFiltersMenu, setShowHomeFiltersMenu] = useState(false);
  const homeFiltersMenuRef = useRef<HTMLDivElement>(null);
  const [quickFilters, setQuickFilters] = useState<QuickFilterId[]>([]);
  const [homeSiniestradoFilter, setHomeSiniestradoFilter] = useState<HomeSiniestradoFilter>("all");
  const [cardDensity, setCardDensity] = useState<CardDensity>("detailed");
  const [leadForm, setLeadForm] = useState<ClientLeadForm>({
    name: "",
    phone: "",
    interest: "",
  });
  const [leadMessage, setLeadMessage] = useState("");
  const [systemNotice, setSystemNotice] = useState<SystemNotice | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [adminTab, setAdminTab] = useState<AdminTabId>("categorias");
  const [inventorySubtab, setInventorySubtab] = useState<InventorySubtabId>("actual");
  const [auctionFilterId, setAuctionFilterId] = useState("");
  const [editorGroupFilter, setEditorGroupFilter] = useState<EditorGroupFilter>("all");
  const [editorVisibilityFilter, setEditorVisibilityFilter] =
    useState<EditorVisibilityFilter>("all");
  const [editorVehicleCategoryFilter, setEditorVehicleCategoryFilter] =
    useState<EditorVehicleCategoryFilter>("all");
  const [showEditorFiltersMenu, setShowEditorFiltersMenu] = useState(false);
  const [editorPage, setEditorPage] = useState(1);
  const [selectedInventoryKeys, setSelectedInventoryKeys] = useState<string[]>([]);
  const [editingVehicleKey, setEditingVehicleKey] = useState<string | null>(null);
  const [managingVehicleKey, setManagingVehicleKey] = useState<string | null>(null);
  const [syncingVehicleKey, setSyncingVehicleKey] = useState<string | null>(null);
  const [loadingTasacionesMedia, setLoadingTasacionesMedia] = useState(false);
  const [groupSyncAllState, setGroupSyncAllState] = useState<{
    running: boolean;
    current: number;
    total: number;
    patente?: string;
  } | null>(null);
  const [editingDetails, setEditingDetails] = useState<EditorVehicleDetails | null>(null);
  const [newAuctionName, setNewAuctionName] = useState("");
  const [newAuctionDate, setNewAuctionDate] = useState("");
  const [newAuctionEndDate, setNewAuctionEndDate] = useState("");
  const [newAuctionStartTime, setNewAuctionStartTime] = useState("10:00");
  const [newAuctionEndTime, setNewAuctionEndTime] = useState("15:00");
  const [newAuctionEventType, setNewAuctionEventType] = useState<CommercialEventType>("remate");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryDescription, setNewCategoryDescription] = useState("");
  const [showCreateCategoryForm, setShowCreateCategoryForm] = useState(false);
  const [createGroupKind, setCreateGroupKind] = useState<"categoria" | "remate" | "venta_directa">("categoria");
  const [assignCategoryId, setAssignCategoryId] = useState<string | null>(null);
  const [assignSearchTerm, setAssignSearchTerm] = useState("");
  const [finalizeAuctionId, setFinalizeAuctionId] = useState<string | null>(null);
  const [finalizeAuctionSearchTerm, setFinalizeAuctionSearchTerm] = useState("");
  const [finalizeSoldVehicleKeys, setFinalizeSoldVehicleKeys] = useState<string[]>([]);
  const [batchAssignTarget, setBatchAssignTarget] = useState<BatchAssignTarget | null>(null);
  const [batchAssignSearchTerm, setBatchAssignSearchTerm] = useState("");
  const [batchAssignSelectedKeys, setBatchAssignSelectedKeys] = useState<string[]>([]);
  const [groupManageTarget, setGroupManageTarget] = useState<GroupManageTarget | null>(null);
  const [groupManageSearchTerm, setGroupManageSearchTerm] = useState("");
  const [groupManageSelectedKeys, setGroupManageSelectedKeys] = useState<string[]>([]);
  const [importedInventoryItems, setImportedInventoryItems] = useState<CatalogItem[]>([]);
  const [batchAssignImporting, setBatchAssignImporting] = useState(false);
  const [manualDraft, setManualDraft] = useState<ManualPublicationDraft>(
    EMPTY_MANUAL_PUBLICATION_DRAFT,
  );
  const [showManualCreateModal, setShowManualCreateModal] = useState(false);
  const [manualUploadedImages, setManualUploadedImages] = useState<string[]>([]);
  const [manualUploading, setManualUploading] = useState(false);
  const [manualDropActive, setManualDropActive] = useState(false);
  const [editorDocumentUploading, setEditorDocumentUploading] = useState(false);
  const [editorDocumentDropActive, setEditorDocumentDropActive] = useState(false);
  const [draggedImageIndex, setDraggedImageIndex] = useState<number | null>(null);
  const manualFileInputRef = useRef<HTMLInputElement | null>(null);
  const editorDocumentFileInputRef = useRef<HTMLInputElement | null>(null);
  const [loginEmail, setLoginEmail] = useState("jpmontero@vedisaremates.cl");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [selectedVehicle, setSelectedVehicle] = useState<CatalogItem | null>(null);
  const [selectedVehicleImageIndex, setSelectedVehicleImageIndex] = useState(0);
  const [selectedVehicleLightboxIndex, setSelectedVehicleLightboxIndex] = useState<number | null>(null);
  const [selectedVehicleLightboxZoom, setSelectedVehicleLightboxZoom] = useState(1);
  const [detailEditorTab, setDetailEditorTab] = useState<DetailEditorTabId>("general");
  const [selectedVehicleTab, setSelectedVehicleTab] = useState<VehicleDetailTabId>("descripcion");
  const [revalidating, setRevalidating] = useState(false);
  const [sharedSyncStatus, setSharedSyncStatus] = useState<{
    ventaDirectaCatalog: {
      present: boolean;
      vehicleCount: number;
      sharedItemsCount?: number;
      needsReconcile?: boolean;
    };
    remateAuctions: number;
    ventaDirectaAuctions: number;
    checkedAt?: string;
  } | null>(null);
  const autoReconcileInFlightRef = useRef(false);
  const [rainworxLotUrl, setRainworxLotUrl] = useState("");
  const [rainworxCatalogId, setRainworxCatalogId] = useState("");
  const [rainworxImporting, setRainworxImporting] = useState(false);
  const [detailRainworxUrl, setDetailRainworxUrl] = useState("");
  const [detailRainworxImporting, setDetailRainworxImporting] = useState(false);
  const [groupRainworxEventUrl, setGroupRainworxEventUrl] = useState("");
  const [groupRainworxAddMissing, setGroupRainworxAddMissing] = useState(true);
  const [groupRainworxImporting, setGroupRainworxImporting] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const buildVehicleAnalyticsContextRef = useRef<
    (item: CatalogItem, section?: string) => Record<string, unknown>
  >(() => ({}));
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [offerForm, setOfferForm] = useState<OfferFormState>(buildEmptyOfferForm);
  const [offerSending, setOfferSending] = useState(false);
  const [offersRows, setOffersRows] = useState<OfferRecord[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [offersError, setOffersError] = useState("");
  const [offersSearch, setOffersSearch] = useState("");
  const [offersSearchField, setOffersSearchField] = useState<OfferFilterField>("all");
  const [offersVehicleFilter, setOffersVehicleFilter] = useState("all");
  const [offersClientFilter, setOffersClientFilter] = useState("all");
  const [offersDateFrom, setOffersDateFrom] = useState("");
  const [offersDateTo, setOffersDateTo] = useState("");
  const [showOffersFiltersMenu, setShowOffersFiltersMenu] = useState(false);
  const [deletingOfferId, setDeletingOfferId] = useState<string | null>(null);
  const [soldSearch, setSoldSearch] = useState("");
  const [soldSearchField, setSoldSearchField] = useState<SoldFilterField>("all");
  const [soldAuctionFilter, setSoldAuctionFilter] = useState("all");
  const [soldDateFrom, setSoldDateFrom] = useState("");
  const [soldDateTo, setSoldDateTo] = useState("");
  const [showSoldFiltersMenu, setShowSoldFiltersMenu] = useState(false);
  const [pendingRevertSale, setPendingRevertSale] = useState<SoldVehicleRecord | null>(null);
  const [draggedLayoutSectionId, setDraggedLayoutSectionId] = useState<HomeSectionOrderId | null>(null);
  const [activeHeroRichEditor, setActiveHeroRichEditor] = useState<"title" | "subtitle">("subtitle");
  const [isDownloadingCalendarPdf, setIsDownloadingCalendarPdf] = useState(false);
  const [heroToolbarState, setHeroToolbarState] = useState(() => ({
    formatBlock: "p" as "p" | "h2" | "h3",
    fontFamily: "Inter",
    fontSize: "16px",
    foreColor: "#0f172a",
    hiliteColor: "#ffffff",
    bold: false,
    italic: false,
    underline: false,
    align: "left" as "left" | "center" | "right",
    unorderedList: false,
    orderedList: false,
  }));
  const manualObservationsEditorRef = useRef<HTMLDivElement | null>(null);
  const heroTitleEditorRef = useRef<HTMLDivElement | null>(null);
  const heroSubtitleEditorRef = useRef<HTMLDivElement | null>(null);
  const deletedAuctionIdsRef = useRef<Set<string>>(new Set());
  const [observationsTemplateHtml, setObservationsTemplateHtml] = useState(
    DEFAULT_OBSERVATIONS_TEMPLATE_HTML,
  );
  const autoSaveReadyRef = useRef(false);
  const lastPersistedConfigRef = useRef("");
  const groupSyncInProgressRef = useRef(false);
  const configRef = useRef(config);
  configRef.current = config;
  const persistEditorConfigRef = useRef<
    (config: EditorConfig) => Promise<{ ok: boolean; syncOk?: boolean; syncSkipped?: string[] }>
  >(async () => ({ ok: false }));

  const editingValidationErrors = useMemo(() => {
    const errors: Partial<Record<keyof EditorVehicleDetails, string>> = {};
    if (!editingDetails) return errors;

    const binaryFields: Array<keyof EditorVehicleDetails> = [
      "llaves",
      "aireAcondicionado",
      "unicoPropietario",
      "condicionado",
      "pruebaMotor",
      "pruebaDesplazamiento",
    ];
    for (const field of binaryFields) {
      if (!isValidBinaryValue(String(editingDetails[field] ?? ""))) {
        errors[field] = "Usa SI o NO.";
      }
    }

    const dateFields: Array<keyof EditorVehicleDetails> = [
      "auctionDate",
      "vencRevisionTecnica",
      "vencPermisoCirculacion",
      "vencSeguroObligatorio",
    ];
    for (const field of dateFields) {
      if (!isValidDateValue(String(editingDetails[field] ?? ""))) {
        errors[field] = "Formato válido: YYYY-MM-DD o DD/MM/YYYY.";
      }
    }

    return errors;
  }, [editingDetails]);

  const setEditingDetailField = (
    field: keyof EditorVehicleDetails,
    value: string,
  ) => {
    setEditingDetails((prev) => ({ ...(prev ?? {}), [field]: value }));
  };

  const getEditorInputClass = (field: keyof EditorVehicleDetails): string =>
    `rounded border px-3 py-2 text-sm ${
      editingValidationErrors[field]
        ? "border-rose-400 bg-rose-50"
        : "border-slate-300"
    }`;

  const getEditorFieldError = (field: keyof EditorVehicleDetails): string | null =>
    editingValidationErrors[field] ?? null;

  const blockingValidationErrors = useMemo(() => {
    if (detailEditorTab === "general") {
      const errors: Partial<Record<keyof EditorVehicleDetails, string>> = {};
      if (editingValidationErrors.auctionDate) {
        errors.auctionDate = editingValidationErrors.auctionDate;
      }
      return errors;
    }
    const errors = { ...editingValidationErrors };
    delete errors.auctionDate;
    return errors;
  }, [detailEditorTab, editingValidationErrors]);

  const syncManualObservations = useCallback((html: string) => {
    const text = stripHtmlToText(html);
    setEditingDetails((prev) => ({
      ...(prev ?? {}),
      extendedDescription: html,
      description: text,
    }));
  }, []);

  const runObservationsCommand = useCallback((command: string, value?: string) => {
    const editor = manualObservationsEditorRef.current;
    if (!editor || typeof document === "undefined") return;
    editor.focus();
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(command, false, value);
    syncManualObservations(editor.innerHTML);
  }, [syncManualObservations]);

  const applyObservationsTemplate = useCallback((html: string) => {
    const editor = manualObservationsEditorRef.current;
    if (!editor) return;
    editor.innerHTML = html;
    syncManualObservations(html);
  }, [syncManualObservations]);

  useEffect(() => {
    if (!editingDetails || detailEditorTab !== "descripcion") return;
    const editor = manualObservationsEditorRef.current;
    if (!editor) return;
    const desiredHtml =
      editingDetails.extendedDescription?.trim() ||
      escapeHtml(editingDetails.description ?? "").replace(/\n/g, "<br />");
    const normalized = desiredHtml || "";
    if (editor.innerHTML !== normalized) {
      editor.innerHTML = normalized;
    }
  }, [editingVehicleKey, detailEditorTab, editingDetails]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(OBSERVATIONS_TEMPLATE_STORAGE_KEY);
    if (saved?.trim()) {
      setObservationsTemplateHtml(saved);
    }
  }, []);

  const getActiveHeroEditor = useCallback(() => (
    activeHeroRichEditor === "title"
      ? heroTitleEditorRef.current
      : heroSubtitleEditorRef.current
  ), [activeHeroRichEditor]);

  const syncHeroToolbarState = useCallback(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const selection = window.getSelection();
    const titleEditor = heroTitleEditorRef.current;
    const subtitleEditor = heroSubtitleEditorRef.current;
    const anchorNode = selection?.anchorNode ?? null;
    const anchorElement =
      anchorNode && anchorNode.nodeType === Node.ELEMENT_NODE
        ? (anchorNode as Element)
        : anchorNode?.parentElement ?? null;
    const isInTitle = Boolean(titleEditor && anchorElement && titleEditor.contains(anchorElement));
    const isInSubtitle = Boolean(subtitleEditor && anchorElement && subtitleEditor.contains(anchorElement));
    if (isInTitle && activeHeroRichEditor !== "title") {
      setActiveHeroRichEditor("title");
    } else if (isInSubtitle && activeHeroRichEditor !== "subtitle") {
      setActiveHeroRichEditor("subtitle");
    }
    const editor =
      (isInTitle ? titleEditor : isInSubtitle ? subtitleEditor : getActiveHeroEditor()) ?? titleEditor;
    if (!editor) return;
    const styleTarget = (anchorElement && editor.contains(anchorElement))
      ? anchorElement
      : editor;
    const computedStyle = window.getComputedStyle(styleTarget);
    const formatBlockRaw = String(document.queryCommandValue("formatBlock") ?? "")
      .replace(/[<>]/g, "")
      .toLowerCase();
    const formatBlock: "p" | "h2" | "h3" =
      formatBlockRaw === "h2" || formatBlockRaw === "h3" ? formatBlockRaw : "p";
    const align: "left" | "center" | "right" =
      document.queryCommandState("justifyCenter")
        ? "center"
        : document.queryCommandState("justifyRight")
          ? "right"
          : "left";
    const fontNameFromCommand = String(document.queryCommandValue("fontName") ?? "").trim();
    const nextState = {
      formatBlock,
      fontFamily: normalizeFontFamilyName(fontNameFromCommand || computedStyle.fontFamily),
      fontSize: computedStyle.fontSize || "16px",
      foreColor: normalizeCssColorToHex(
        String(document.queryCommandValue("foreColor") || computedStyle.color),
      ),
      hiliteColor: normalizeCssColorToHex(
        String(
          document.queryCommandValue("hiliteColor") ||
          document.queryCommandValue("backColor") ||
          computedStyle.backgroundColor ||
          "#ffffff",
        ),
      ),
      bold: Boolean(document.queryCommandState("bold")),
      italic: Boolean(document.queryCommandState("italic")),
      underline: Boolean(document.queryCommandState("underline")),
      align,
      unorderedList: Boolean(document.queryCommandState("insertUnorderedList")),
      orderedList: Boolean(document.queryCommandState("insertOrderedList")),
    };
    setHeroToolbarState((prev) =>
      JSON.stringify(prev) === JSON.stringify(nextState) ? prev : nextState,
    );
  }, [activeHeroRichEditor, getActiveHeroEditor]);

  const runHeroHtmlCommand = useCallback((command: string, value?: string) => {
    const editor =
      getActiveHeroEditor();
    if (!editor || typeof document === "undefined") return;
    editor.focus();
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(command, false, value);
    setConfig((prev) => ({
      ...prev,
      homeLayout: {
        ...prev.homeLayout,
        [activeHeroRichEditor === "title" ? "heroTitle" : "heroDescription"]: editor.innerHTML,
      },
    }));
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => syncHeroToolbarState());
    }
  }, [activeHeroRichEditor, getActiveHeroEditor, syncHeroToolbarState]);

  useEffect(() => {
    if (adminTab !== "layout" || typeof document === "undefined") return;
    const handleSelectionChange = () => syncHeroToolbarState();
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [adminTab, syncHeroToolbarState]);

  useEffect(() => {
    if (adminTab !== "layout") return;
    const titleEditor = heroTitleEditorRef.current;
    if (titleEditor) {
      const normalizedTitle = formatHomeHeroHtml(config.homeLayout.heroTitle);
      if (titleEditor.innerHTML !== normalizedTitle) {
        titleEditor.innerHTML = normalizedTitle;
      }
    }
    const subtitleEditor = heroSubtitleEditorRef.current;
    if (subtitleEditor) {
      const normalizedSubtitle = formatHomeHeroHtml(config.homeLayout.heroDescription);
      if (subtitleEditor.innerHTML !== normalizedSubtitle) {
        subtitleEditor.innerHTML = normalizedSubtitle;
      }
    }
    syncHeroToolbarState();
  }, [adminTab, config.homeLayout.heroTitle, config.homeLayout.heroDescription, syncHeroToolbarState]);

  const heroToolbarButtonClass = useCallback((isActive: boolean) => (
    `ui-focus rounded border px-2 py-1 text-xs font-semibold transition ${
      isActive
        ? "border-cyan-400 bg-cyan-100 text-cyan-800"
        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
    }`
  ), []);

  const rawItems = liveFeedItems;

  useEffect(() => {
    setLiveFeedItems((prev) => {
      const hydratedIncoming = hydrateCatalogItemsWithEditorConfig(
        feed.items,
        configRef.current,
      );
      return dedupeCatalogItemsByVehicleKey([...hydratedIncoming, ...prev]);
    });
  }, [feed.items]);
  const updateVehicleUrlParam = useCallback((vehicleKey?: string) => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (vehicleKey) {
      url.searchParams.set("vehiculo", vehicleKey);
      if (!url.hash) url.hash = "proximos-remates";
    } else {
      url.searchParams.delete("vehiculo");
    }
    window.history.replaceState(null, "", url.toString());
  }, []);
  const openVehicleDetail = useCallback(
    (item: CatalogItem) => {
      setSelectedVehicle(item);
      updateVehicleUrlParam(getVehicleKey(item));
      trackEvent("vehicle_detail_open", {
        ...buildVehicleAnalyticsContextRef.current(item, topSectionFilter),
      });
    },
    [updateVehicleUrlParam, topSectionFilter],
  );
  const closeSelectedVehicle = useCallback(() => {
    setSelectedVehicle(null);
    updateVehicleUrlParam();
  }, [updateVehicleUrlParam]);
  const navigateBackFromVehicleDetail = useCallback(() => {
    if (isStandaloneDetailPage) {
      router.push(standaloneBackHrefProp);
      return;
    }
    closeSelectedVehicle();
  }, [closeSelectedVehicle, isStandaloneDetailPage, router, standaloneBackHrefProp]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") navigateBackFromVehicleDetail();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigateBackFromVehicleDetail]);

  useEffect(() => {
    setSelectedVehicleImageIndex(0);
  }, [selectedVehicle]);

  useEffect(() => {
    if (isStandaloneDetailPage) return;
    if (!selectedVehicle || typeof window === "undefined") return;
    const scrollY = window.scrollY;
    const { style } = document.body;
    const previous = {
      position: style.position,
      top: style.top,
      width: style.width,
      overflow: style.overflow,
    };
    style.position = "fixed";
    style.top = `-${scrollY}px`;
    style.width = "100%";
    style.overflow = "hidden";
    return () => {
      style.position = previous.position;
      style.top = previous.top;
      style.width = previous.width;
      style.overflow = previous.overflow;
      window.scrollTo({ top: scrollY, behavior: "auto" });
    };
  }, [isStandaloneDetailPage, selectedVehicle]);

  useEffect(() => {
    if (selectedVehicle) return;
    setShowOfferModal(false);
    setOfferForm(buildEmptyOfferForm());
    setOfferSending(false);
  }, [selectedVehicle]);

  useEffect(() => {
    if (!showOfferModal) return;
    const selectedKey = selectedVehicle ? getVehicleKey(selectedVehicle) : "";
    const selectedPriceLabel = selectedVehicle
      ? formatPrice(resolveVehiclePriceRaw(selectedVehicle, config.vehiclePrices) ?? undefined)
      : selectedKey
        ? formatPrice(config.vehiclePrices[selectedKey])
        : null;
    const selectedReferenceAmount = parseCurrencyAmount(selectedPriceLabel);
    if (selectedReferenceAmount <= 0) return;
    setOfferForm((prev) => {
      if (prev.offerAmount.trim()) return prev;
      return { ...prev, offerAmount: formatCurrencyAmount(selectedReferenceAmount) };
    });
  }, [showOfferModal, selectedVehicle, config.vehiclePrices]);

  useEffect(() => {
    void (async () => {
      try {
        const sessionRes = await fetch("/api/admin/session", { cache: "no-store" });
        const session = (await sessionRes.json()) as { loggedIn?: boolean };
        const loggedIn = Boolean(session.loggedIn);
        setIsAdmin(loggedIn);
        setAdminView(loggedIn && initialAdminView === "editor" ? "editor" : "home");
        if (!loggedIn && openLoginIfGuest) {
          setShowLogin(true);
        }

        const configEndpoint = loggedIn ? "/api/admin/editor-config" : "/api/public/editor-config";
        const configRes = await fetch(configEndpoint, { cache: "no-store" });
        if (configRes.ok) {
          const payload = (await configRes.json()) as { config?: EditorConfig; persisted?: boolean };
          if (payload.config) {
            const fromServer = normalizeEditorConfigClient(payload.config);
            const merged = mergeEditorConfigsPreferVehicleDetails(
              normalizeEditorConfigClient(initialConfig),
              fromServer,
            );
            setConfig(merged);
            lastPersistedConfigRef.current = JSON.stringify(merged);
            autoSaveReadyRef.current = true;
            localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify(merged));
            setLiveFeedItems((prev) =>
              hydrateCatalogItemsWithEditorConfig(
                dedupeCatalogItemsByVehicleKey([...feed.items, ...prev]),
                merged,
              ),
            );
            return;
          }
        }

        const local = localStorage.getItem(EDITOR_STORAGE_KEY);
        if (local) {
          const parsed = JSON.parse(local) as Partial<EditorConfig>;
          setConfig(normalizeEditorConfigClient(parsed));
        }
      } finally {
        setIsBootstrapping(false);
      }
    })();
  }, [initialAdminView, openLoginIfGuest]);

  useEffect(() => {
    if (isBootstrapping || isStandaloneDetailPage) return;
    if (isAdmin && adminView === "editor") return;

    let cancelled = false;
    const refreshPublicHome = async () => {
      try {
        const [configRes, feedRes] = await Promise.all([
          fetch("/api/public/editor-config", { cache: "no-store" }),
          fetch("/api/public/catalog-feed", { cache: "no-store" }),
        ]);
        if (cancelled) return;
        if (configRes.ok) {
          const payload = (await configRes.json()) as { config?: EditorConfig };
          if (payload.config) {
            setConfig(normalizeEditorConfigClient(payload.config));
          }
        }
        if (feedRes.ok) {
          const payload = (await feedRes.json()) as { items?: CatalogItem[] };
          if (payload.items) {
            setLiveFeedItems(payload.items);
          }
        }
      } catch {
        // ignore transient refresh errors
      }
    };

    const interval = window.setInterval(() => void refreshPublicHome(), 300_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshPublicHome();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [adminView, isAdmin, isBootstrapping, isStandaloneDetailPage]);

  const applyMergedAdminConfig = useCallback((mergedConfig: EditorConfig) => {
    const normalized = normalizeEditorConfigClient(mergedConfig);
    setConfig(normalized);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify(normalized));
    }
    lastPersistedConfigRef.current = JSON.stringify(normalized);
    autoSaveReadyRef.current = true;
  }, []);

  useEffect(() => {
    if (!isAdmin || adminView !== "editor" || isBootstrapping) return;

    let cancelled = false;
    const refreshAdminSharedConfig = async () => {
      try {
        const response = await fetch("/api/admin/sync-status", { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const payload = (await response.json()) as {
          config?: EditorConfig;
          status?: {
            checkedAt: string;
            remateAuctions: number;
            ventaDirectaAuctions: number;
            ventaDirectaCatalog: {
              present: boolean;
              vehicleCount: number;
              sharedItemsCount?: number;
              needsReconcile?: boolean;
            };
          };
        };
        if (payload.config && !cancelled) {
          applyMergedAdminConfig(payload.config);
        }
        if (payload.status && !cancelled) {
          setSharedSyncStatus(payload.status);
        }
      } catch {
        // ignore transient refresh errors
      }
    };

    void refreshAdminSharedConfig();
    const interval = window.setInterval(() => void refreshAdminSharedConfig(), 180_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshAdminSharedConfig();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [adminView, applyMergedAdminConfig, isAdmin, isBootstrapping]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const rawQuickFilters = window.localStorage.getItem(HOME_QUICK_FILTERS_STORAGE_KEY);
      const parsedQuickFilters = rawQuickFilters ? (JSON.parse(rawQuickFilters) as QuickFilterId[]) : [];
      if (Array.isArray(parsedQuickFilters)) {
        setQuickFilters(parsedQuickFilters.filter((id): id is QuickFilterId => isAllowedHomeBodyFilter(id)));
      }
    } catch {
      // ignore invalid persisted filters
    }
    const rawSiniestro = window.localStorage.getItem(HOME_SINIESTRO_FILTER_STORAGE_KEY);
    if (rawSiniestro === "siniestrado" || rawSiniestro === "no_siniestrado" || rawSiniestro === "all") {
      setHomeSiniestradoFilter(rawSiniestro);
    }
    const rawDensity = window.localStorage.getItem(HOME_CARD_DENSITY_STORAGE_KEY);
    if (rawDensity === "compact" || rawDensity === "detailed") {
      setCardDensity(rawDensity);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(HOME_QUICK_FILTERS_STORAGE_KEY, JSON.stringify(quickFilters));
  }, [quickFilters]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(HOME_SINIESTRO_FILTER_STORAGE_KEY, homeSiniestradoFilter);
  }, [homeSiniestradoFilter]);

  useEffect(() => {
    if (!showHomeFiltersMenu || typeof window === "undefined") return;
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showHomeFiltersMenu]);

  useEffect(() => {
    if (!showHomeFiltersMenu) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowHomeFiltersMenu(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showHomeFiltersMenu]);

  useEffect(() => {
    if (!showHomeFiltersMenu || typeof window === "undefined") return;
    const onPointerDown = (event: globalThis.MouseEvent) => {
      if (window.innerWidth < 768) return;
      const target = event.target as Node;
      if (homeFiltersMenuRef.current?.contains(target)) return;
      setShowHomeFiltersMenu(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [showHomeFiltersMenu]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(HOME_CARD_DENSITY_STORAGE_KEY, cardDensity);
  }, [cardDensity]);


  useEffect(() => {
    const shouldLoadOffers = isAdmin && adminView === "editor" && adminTab === "ofertas";
    if (!shouldLoadOffers) return;
    let cancelled = false;
    const fetchOffers = async () => {
      setOffersLoading(true);
      setOffersError("");
      try {
        const response = await fetch("/api/admin/offers?limit=5000", { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          offers?: OfferRecord[];
          error?: string;
        };
        if (!response.ok || !payload.ok || !Array.isArray(payload.offers)) {
          if (!cancelled) {
            setOffersRows([]);
            setOffersError(payload.error ?? "No se pudieron cargar las ofertas.");
          }
          return;
        }
        if (!cancelled) {
          setOffersRows(payload.offers);
        }
      } catch {
        if (!cancelled) {
          setOffersRows([]);
          setOffersError("No se pudieron cargar las ofertas.");
        }
      } finally {
        if (!cancelled) setOffersLoading(false);
      }
    };
    void fetchOffers();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, adminView, adminTab]);

  useEffect(() => {
    if (adminTab !== "vehiculos" || inventorySubtab !== "vendidas") {
      setShowSoldFiltersMenu(false);
      setPendingRevertSale(null);
    }
  }, [adminTab, inventorySubtab]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hasPersistedDensity = window.localStorage.getItem(HOME_CARD_DENSITY_STORAGE_KEY);
    if (hasPersistedDensity) return;
    setCardDensity(config.homeLayout.defaultCardDensity);
  }, [config.homeLayout.defaultCardDensity]);

  useEffect(() => {
    trackEvent("page_view_home", { mode: "catalogo" });
    const attribution = getSessionAttribution();
    if (attribution.referrerHost) {
      trackEvent("catalog_external_referral", { referrerHost: attribution.referrerHost });
    }
  }, []);

  useEffect(() => {
    if (!systemNotice) return;
    const timeout = window.setTimeout(() => setSystemNotice(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [systemNotice]);

  const showSystemNotice = useCallback(
    (tone: SystemNotice["tone"], title: string, message: string) => {
      setSystemNotice({ id: Date.now(), tone, title, message });
    },
    [],
  );

  const { cooldownLabel } = useGlo3dClientCooldown();

  const manualItems = useMemo(
    () => (config.manualPublications ?? []).map(mapManualPublicationToCatalogItem),
    [config.manualPublications],
  );

  const items = useMemo(() => {
    const merged = dedupeCatalogItemsByVehicleKey([
      ...rawItems,
      ...manualItems,
      ...importedInventoryItems,
    ]);
    return merged.map((item) =>
      applyCatalogDetailsOverride(item, getEditorOverrideForItem(item, config.vehicleDetails)),
    );
  }, [rawItems, manualItems, importedInventoryItems, config.vehicleDetails]);

  const itemsByKey = useMemo(() => {
    const map = new Map<string, CatalogItem>();
    for (const item of items) {
      map.set(getVehicleKey(item), item);
    }
    return map;
  }, [items]);

  const soldVehicleIdsSet = useMemo(
    () => new Set(config.soldVehicleIds ?? []),
    [config.soldVehicleIds],
  );

  useEffect(() => {
    if (isStandaloneDetailPage) return;
    if (typeof window === "undefined") return;
    if (itemsByKey.size === 0) return;
    if (selectedVehicle) return;
    const requestedKey = new URLSearchParams(window.location.search).get("vehiculo");
    if (!requestedKey) return;
    const directMatch = itemsByKey.get(requestedKey);
    const normalizedMatch =
      directMatch ??
      itemsByKey.get(requestedKey.toUpperCase()) ??
      itemsByKey.get(requestedKey.toLowerCase());
    if (normalizedMatch) setSelectedVehicle(normalizedMatch);
  }, [isStandaloneDetailPage, itemsByKey, selectedVehicle]);

  const mergedHiddenVehicleIds = useMemo(() => {
    const set = new Set(config.hiddenVehicleIds);
    for (const soldVehicleId of config.soldVehicleIds ?? []) {
      set.add(soldVehicleId);
    }
    for (const manual of config.manualPublications ?? []) {
      if (!manual.visible) set.add(`manual-${manual.id}`);
    }
    return set;
  }, [config.hiddenVehicleIds, config.manualPublications, config.soldVehicleIds]);

  const activeInventoryItems = useMemo(
    () => items.filter((item) => !soldVehicleIdsSet.has(getVehicleKey(item))),
    [items, soldVehicleIdsSet],
  );

  const publicFeedItems = useMemo(
    () => dedupeCatalogItemsByVehicleKey([...rawItems, ...importedInventoryItems]),
    [rawItems, importedInventoryItems],
  );

  const visibleItems = useMemo(
    () => getVisibleCatalogItems({ ...feed, items: publicFeedItems }, config),
    [feed, publicFeedItems, config],
  );

  useLayoutEffect(() => {
    if (!isStandaloneDetailPage || !standaloneVehicleKey?.trim()) return;
    if (visibleItems.length === 0) return;
    const rawKey = decodeURIComponent(standaloneVehicleKey.trim());
    const normalizedKey = normalizePatentToken(rawKey);
    const visibleByKey = new Map(visibleItems.map((item) => [getVehicleKey(item), item] as const));
    const directMatch =
      visibleByKey.get(rawKey) ??
      visibleByKey.get(rawKey.toUpperCase()) ??
      visibleByKey.get(normalizedKey) ??
      visibleItems.find((item) => normalizePatentToken(getVehicleKey(item)) === normalizedKey);
    setSelectedVehicle(directMatch ?? null);
  }, [isStandaloneDetailPage, standaloneVehicleKey, visibleItems]);

  const showPatents = shouldShowPatentsToViewer(isAdmin);

  const homeFilteredItems = useMemo(() => {
    const query = normalizeText(homeSearchTerm);
    if (!query) return visibleItems;
    const patentTokens = extractPatentTokens(homeSearchTerm);
    if (patentTokens.length > 0) {
      if (!showPatents) return [];
      return visibleItems.filter((item) =>
        matchesInventoryPatentSearch(item, homeSearchTerm, patentTokens, showPatents),
      );
    }
    return visibleItems.filter((item) => {
      const raw = item.raw as Record<string, unknown>;
      const source = [
        item.title,
        item.subtitle,
        item.status,
        item.location,
        item.lot,
        ...(showPatents ? [raw.patente, raw.PATENTE, raw.PPU, raw.stock_number] : []),
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
      return fuzzyMatches(normalizeText(source), query);
    });
  }, [visibleItems, homeSearchTerm, showPatents]);

  const effectiveSectionVehicleIds = useMemo<Record<SectionId, string[]>>(() => {
    const sectionSets: Record<SectionId, Set<string>> = {
      "proximos-remates": new Set(config.sectionVehicleIds["proximos-remates"] ?? []),
      "ventas-directas": new Set(config.sectionVehicleIds["ventas-directas"] ?? []),
      novedades: new Set(config.sectionVehicleIds.novedades ?? []),
      catalogo: new Set(config.sectionVehicleIds.catalogo ?? []),
    };

    for (const item of items) {
      const key = getVehicleKey(item);
      if (!isCatalogPublishedVehicle(item, config)) continue;
      const lane = resolveVehicleCommercialLane(key, config, extractEstadoRetiroForSection(item));
      if (lane === "proximos-remates") {
        sectionSets["proximos-remates"].add(key);
        sectionSets["ventas-directas"].delete(key);
      } else if (lane === "ventas-directas") {
        sectionSets["ventas-directas"].add(key);
        sectionSets["proximos-remates"].delete(key);
      }
    }

    return {
      "proximos-remates": Array.from(sectionSets["proximos-remates"]),
      "ventas-directas": Array.from(sectionSets["ventas-directas"]),
      novedades: Array.from(sectionSets.novedades),
      catalogo: Array.from(sectionSets.catalogo),
    };
  }, [items, config]);

  const homeQuickFilteredItems = useMemo(() => {
    const byTopSection =
      topSectionFilter === "all"
        ? homeFilteredItems
        : homeFilteredItems.filter((item) => {
            const key = getVehicleKey(item);
            if (topSectionFilter === "proximos-remates") {
              return Boolean(config.vehicleUpcomingAuctionIds[key]);
            }
            return (effectiveSectionVehicleIds[topSectionFilter] ?? []).includes(key);
          });
    let result = byTopSection;
    if (homeSiniestradoFilter !== "all") {
      result = result.filter(
        (item) => inferVehicleSiniestradoStatus(item) === homeSiniestradoFilter,
      );
    }
    if (quickFilters.length === 0) return result;
    return result.filter((item) =>
      quickFilters.some((filter) => matchesVehicleBodyTypeFilter(item, filter, config.vehicleDetails)),
    );
  }, [
    homeFilteredItems,
    topSectionFilter,
    homeSiniestradoFilter,
    quickFilters,
    config.vehicleDetails,
    config.vehicleUpcomingAuctionIds,
    effectiveSectionVehicleIds,
  ]);

  const homeVisibleItems = useMemo(() => {
    const sorted = [...homeQuickFilteredItems];
    if (homeSort === "recomendado") {
      sorted.sort((a, b) => {
        const score = (item: CatalogItem): number => {
          const hasPrice = formatPrice(resolveVehiclePriceRaw(item, config.vehiclePrices) ?? undefined)
            ? 1
            : 0;
          const has3d = item.view3dUrl ? 1 : 0;
          const isRecent = isRecentAuctionDate(item.auctionDate) ? 1 : 0;
          return hasPrice * 3 + has3d * 2 + isRecent;
        };
        return score(b) - score(a);
      });
      return sorted;
    }
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
          getPriceAmount(resolveVehiclePriceRaw(a, config.vehiclePrices) ?? undefined) -
          getPriceAmount(resolveVehiclePriceRaw(b, config.vehiclePrices) ?? undefined),
      );
      return sorted;
    }
    if (homeSort === "precio-desc") {
      sorted.sort(
        (a, b) =>
          getPriceAmount(resolveVehiclePriceRaw(b, config.vehiclePrices) ?? undefined) -
          getPriceAmount(resolveVehiclePriceRaw(a, config.vehiclePrices) ?? undefined),
      );
      return sorted;
    }
    if (homeSort === "titulo") {
      sorted.sort((a, b) => a.title.localeCompare(b.title, "es"));
      return sorted;
    }
    return sorted;
  }, [homeQuickFilteredItems, homeSort, config.vehiclePrices]);

  const homeVisibleKeys = useMemo(
    () => new Set(homeVisibleItems.map((item) => getVehicleKey(item))),
    [homeVisibleItems],
  );
  const hiddenHomeCategoryIds = useMemo(
    () => new Set(config.hiddenCategoryIds ?? []),
    [config.hiddenCategoryIds],
  );

  const getSectionItems = (sectionId: SectionId): CatalogItem[] => {
    const selected = effectiveSectionVehicleIds[sectionId] ?? [];
    return selected
      .map((id) => itemsByKey.get(id))
      .filter((item): item is CatalogItem => !!item)
      .filter((item) => homeVisibleKeys.has(getVehicleKey(item)));
  };

  const upcomingAuctionByVehicleKey = useMemo(() => {
    const labels: Record<string, VehicleCommercialEventBadge> = {};
    const auctionsById = new Map(
      (config.upcomingAuctions ?? []).map((auction) => [auction.id, auction] as const),
    );
    for (const [vehicleKey, auctionId] of Object.entries(config.vehicleUpcomingAuctionIds ?? {})) {
      const auction = auctionsById.get(auctionId);
      if (!auction) continue;
      const eventType = getAuctionEventType(auction);
      if (eventType === "venta_directa") {
        labels[vehicleKey] = { kind: "venta_directa", label: "Venta directa" };
        continue;
      }
      const dateLabel = formatAuctionWindowLabel(auction);
      const name = sanitizeAuctionTitle(auction.name);
      labels[vehicleKey] = {
        kind: "remate",
        label: dateLabel ? `${name} · ${dateLabel}` : name,
      };
    }
    return labels;
  }, [config.upcomingAuctions, config.vehicleUpcomingAuctionIds]);

  const buildVehicleAnalyticsContext = useCallback(
    (item: CatalogItem, section?: string) => {
      const key = getVehicleKey(item);
      const auctionId = config.vehicleUpcomingAuctionIds?.[key];
      const auction = (config.upcomingAuctions ?? []).find((entry) => entry.id === auctionId);
      const badge = upcomingAuctionByVehicleKey[key];
      const priceRaw = resolveVehiclePriceRaw(item, config.vehiclePrices ?? {});
      const priceAmount = getPriceAmount(priceRaw ?? undefined);
      const lane =
        badge?.kind ??
        (section === "ventas-directas"
          ? "venta_directa"
          : section === "proximos-remates"
            ? "remate"
            : undefined);

      return {
        itemKey: key,
        patent: getPatent(item),
        vehicleTitle: getModel(item),
        section: section && section !== "all" ? section : topSectionFilter !== "all" ? topSectionFilter : undefined,
        auctionId,
        auctionName: auction?.name,
        commercialLane: lane,
        vehicleType: inferVehicleType(item),
        priceAmount:
          Number.isFinite(priceAmount) && priceAmount !== Number.POSITIVE_INFINITY
            ? priceAmount
            : undefined,
        has3d: Boolean(item.view3dUrl),
        hasPrice: Boolean(priceRaw),
      };
    },
    [config.upcomingAuctions, config.vehiclePrices, config.vehicleUpcomingAuctionIds, upcomingAuctionByVehicleKey, topSectionFilter],
  );
  buildVehicleAnalyticsContextRef.current = buildVehicleAnalyticsContext;

  const lastSearchNoResultsRef = useRef("");
  const lastViewer3dKeyRef = useRef("");

  useEffect(() => {
    const term = homeSearchTerm.trim();
    if (!term || homeVisibleItems.length > 0) return;
    if (lastSearchNoResultsRef.current === term) return;
    lastSearchNoResultsRef.current = term;
    trackEvent("search_no_results", { query: term });
  }, [homeSearchTerm, homeVisibleItems.length]);

  useEffect(() => {
    if (!selectedVehicle?.view3dUrl) return;
    const key = getVehicleKey(selectedVehicle);
    if (lastViewer3dKeyRef.current === key) return;
    lastViewer3dKeyRef.current = key;
    trackEvent("viewer_3d_open", buildVehicleAnalyticsContextRef.current(selectedVehicle));
  }, [selectedVehicle]);

  const sortedUpcomingAuctions = useMemo(
    () =>
      [...(config.upcomingAuctions ?? [])].sort((a, b) =>
        (a.date ?? "").localeCompare(b.date ?? "", "es"),
      ),
    [config.upcomingAuctions],
  );
  const sortedRemateAuctions = useMemo(
    () => sortedUpcomingAuctions.filter((auction) => getAuctionEventType(auction) === "remate"),
    [sortedUpcomingAuctions],
  );
  const sortedVentaDirectaAuctions = useMemo(
    () => sortedUpcomingAuctions.filter((auction) => getAuctionEventType(auction) === "venta_directa"),
    [sortedUpcomingAuctions],
  );

  const upcomingAuctionGroups = useMemo(() => {
    const auctionsByType = (type: CommercialEventType) =>
      sortedUpcomingAuctions.filter((auction) => getAuctionEventType(auction) === type);

    return sortedUpcomingAuctions.map((auction) => {
      const eventType = getAuctionEventType(auction);
      const sectionId: SectionId = eventType === "venta_directa" ? "ventas-directas" : "proximos-remates";
      const sectionKeys = new Set(effectiveSectionVehicleIds[sectionId] ?? []);
      const soloEventoDelTipo = auctionsByType(eventType).length === 1;

      const items = homeVisibleItems.filter((item) => {
        const key = getVehicleKey(item);
        const assignedId = config.vehicleUpcomingAuctionIds[key] ?? "";
        if (assignedId === auction.id) return true;
        if (assignedId) return false;
        if (!sectionKeys.has(key)) return false;
        return soloEventoDelTipo;
      });

      return { auction, items };
    });
  }, [
    sortedUpcomingAuctions,
    homeVisibleItems,
    config.vehicleUpcomingAuctionIds,
    effectiveSectionVehicleIds,
  ]);
  const visibleUpcomingAuctionGroups = useMemo(
    () =>
      upcomingAuctionGroups.filter(
        (group) => !hiddenHomeCategoryIds.has(auctionCategoryKey(group.auction.id)),
      ),
    [upcomingAuctionGroups, hiddenHomeCategoryIds],
  );

  const visibleUpcomingRemateGroups = useMemo(
    () =>
      visibleUpcomingAuctionGroups.filter(
        (group) => getAuctionEventType(group.auction) === "remate",
      ),
    [visibleUpcomingAuctionGroups],
  );
  const visibleUpcomingRemateGroupsWithVehicles = useMemo(
    () => visibleUpcomingRemateGroups.filter((group) => group.items.length > 0),
    [visibleUpcomingRemateGroups],
  );
  const hasScheduledRematesWithoutVehicles = useMemo(
    () =>
      visibleUpcomingRemateGroups.length > 0 && visibleUpcomingRemateGroupsWithVehicles.length === 0,
    [visibleUpcomingRemateGroups, visibleUpcomingRemateGroupsWithVehicles],
  );
  const visibleUpcomingVentaDirectaGroups = useMemo(
    () =>
      visibleUpcomingAuctionGroups.filter(
        (group) => getAuctionEventType(group.auction) === "venta_directa",
      ),
    [visibleUpcomingAuctionGroups],
  );
  const visibleUpcomingVentaDirectaGroupsWithVehicles = useMemo(
    () => visibleUpcomingVentaDirectaGroups.filter((group) => group.items.length > 0),
    [visibleUpcomingVentaDirectaGroups],
  );
  const hasScheduledVentaDirectaWithoutVehicles = useMemo(
    () =>
      visibleUpcomingVentaDirectaGroups.length > 0 &&
      visibleUpcomingVentaDirectaGroupsWithVehicles.length === 0,
    [visibleUpcomingVentaDirectaGroups, visibleUpcomingVentaDirectaGroupsWithVehicles],
  );

  const hasUpcomingRemateCategories = visibleUpcomingRemateGroupsWithVehicles.length > 0;
  const hasUpcomingVentaDirectaCategories = visibleUpcomingVentaDirectaGroups.length > 0;

  const proximosRemates = getSectionItems("proximos-remates");
  const ventasDirectas = getSectionItems("ventas-directas");
  const ventaDirectaInventoryOnlyKeys = useMemo(() => {
    const ventaDirectaAuctionIds = new Set(sortedVentaDirectaAuctions.map((auction) => auction.id));
    return (effectiveSectionVehicleIds["ventas-directas"] ?? []).filter((key) => {
      const assignedId = config.vehicleUpcomingAuctionIds[key];
      return !assignedId || !ventaDirectaAuctionIds.has(assignedId);
    });
  }, [sortedVentaDirectaAuctions, effectiveSectionVehicleIds, config.vehicleUpcomingAuctionIds]);
  const ventaDirectaInventoryOnlyCount = useMemo(
    () => ventaDirectaInventoryOnlyKeys.filter((key) => homeVisibleKeys.has(key)).length,
    [ventaDirectaInventoryOnlyKeys, homeVisibleKeys],
  );
  const managedCategorySections = useMemo(
    () =>
      (config.managedCategories ?? [])
        .filter((category) => {
          const categoryHidden = hiddenHomeCategoryIds.has(managedCategoryKey(category.id));
          return category.visible !== false && !categoryHidden;
        })
        .map((category) => ({
          ...category,
          items: (category.vehicleIds ?? [])
            .map((vehicleId) => itemsByKey.get(vehicleId))
            .filter((item): item is CatalogItem => !!item)
            .filter((item) => homeVisibleKeys.has(getVehicleKey(item))),
        }))
        .filter((category) => category.items.length > 0),
    [config.managedCategories, itemsByKey, homeVisibleKeys, hiddenHomeCategoryIds],
  );
  const managedCategoryOrderEntries = useMemo(
    () =>
      (config.managedCategories ?? []).map((category) => ({
        id: `managed:${category.id}` as HomeSectionOrderId,
        name: category.name,
      })),
    [config.managedCategories],
  );
  const managedCategoryOrderLabelById = useMemo(
    () => new Map(managedCategoryOrderEntries.map((entry) => [entry.id, entry.name])),
    [managedCategoryOrderEntries],
  );
  const managedCategoryCountById = useMemo(
    () => new Map(managedCategorySections.map((section) => [`managed:${section.id}`, section.items.length])),
    [managedCategorySections],
  );
  const resolvedHomeSectionOrder = useMemo(() => {
    const managedIds = managedCategoryOrderEntries.map((entry) => entry.id);
    const validManagedIds = new Set(managedIds);
    const managedFromConfig: HomeSectionOrderId[] = [];
    for (const rawSectionId of config.homeLayout.sectionOrder ?? []) {
      const sectionId = rawSectionId as HomeSectionOrderId;
      if (
        sectionId.startsWith("managed:") &&
        validManagedIds.has(sectionId) &&
        !managedFromConfig.includes(sectionId)
      ) {
        managedFromConfig.push(sectionId);
      }
    }
    for (const managedId of managedIds) {
      if (!managedFromConfig.includes(managedId)) managedFromConfig.push(managedId);
    }
    return [...BASE_HOME_SECTION_ORDER, ...managedFromConfig];
  }, [config.homeLayout.sectionOrder, managedCategoryOrderEntries]);
  const homeSectionCountById = useMemo(() => {
    const map = new Map<HomeSectionOrderId, number>();
    map.set(
      "proximos-remates",
      hasUpcomingRemateCategories
        ? visibleUpcomingRemateGroups.reduce((acc, group) => acc + group.items.length, 0)
        : proximosRemates.length,
    );
    map.set(
      "ventas-directas",
      hasUpcomingVentaDirectaCategories
        ? visibleUpcomingVentaDirectaGroups.reduce((acc, group) => acc + group.items.length, 0)
        : ventasDirectas.length,
    );
    for (const [managedId, count] of managedCategoryCountById.entries()) {
      map.set(managedId as HomeSectionOrderId, count);
    }
    return map;
  }, [
    hasUpcomingRemateCategories,
    visibleUpcomingRemateGroups,
    hasUpcomingVentaDirectaCategories,
    visibleUpcomingVentaDirectaGroups,
    proximosRemates.length,
    ventasDirectas.length,
    managedCategoryCountById,
  ]);

  const calendarPdfSections = useMemo<CatalogPdfSection[]>(() => {
    const buildRow = (item: CatalogItem) => {
      const vehicleDisplay = getPdfVehicleDisplay(item);
      return {
        vehiclePrimary: vehicleDisplay.primary,
        vehicleSecondary: vehicleDisplay.secondary,
        patent: maskPatentForPdf(getPatent(item), showPatents),
        model: getModel(item),
        priceLabel:
          formatPrice(resolveVehiclePriceRaw(item, config.vehiclePrices) ?? undefined) ?? "Sin precio",
        thumbnailUrls: collectVehicleImageCandidates(item),
        vehicleKey: getVehicleKey(item),
      };
    };

    const sections: CatalogPdfSection[] = [];

    if (hasUpcomingRemateCategories) {
      for (const group of visibleUpcomingRemateGroups) {
        if (group.items.length === 0) continue;
        sections.push({
          categoryTitle: `Remates disponibles - ${group.auction.name}`,
          categorySubtitle: "Unidades disponibles para ofertar en remate.",
          rows: group.items.map(buildRow),
        });
      }
    } else if (proximosRemates.length > 0) {
      sections.push({
        categoryTitle: "Remates disponibles",
        categorySubtitle: "Vehículos activos en próximos remates.",
        rows: proximosRemates.map(buildRow),
      });
    }

    if (hasUpcomingVentaDirectaCategories) {
      for (const group of visibleUpcomingVentaDirectaGroups) {
        if (group.items.length === 0) continue;
        sections.push({
          categoryTitle: `Ventas directas - ${group.auction.name}`,
          categorySubtitle:
            config.sectionTexts["ventas-directas"].subtitle || "Stock disponible para cierre rapido.",
          rows: group.items.map(buildRow),
        });
      }
    } else if (ventasDirectas.length > 0) {
      sections.push({
        categoryTitle: "Ventas directas",
        categorySubtitle: config.sectionTexts["ventas-directas"].subtitle || "Stock disponible para cierre rápido.",
        rows: ventasDirectas.map(buildRow),
      });
    }

    const excludedKeys = new Set([
      ...proximosRemates.map((item) => getVehicleKey(item)),
      ...ventasDirectas.map((item) => getVehicleKey(item)),
    ]);
    const otrosRematesItems = homeVisibleItems.filter((item) => (
      inferVehicleType(item) === "otros" && !excludedKeys.has(getVehicleKey(item))
    ));
    if (otrosRematesItems.length > 0) {
      sections.push({
        categoryTitle: "Otros remates",
        categorySubtitle: "Publicaciones activas clasificadas como otros remates.",
        rows: otrosRematesItems.map(buildRow),
      });
    }
    return filterCatalogPdfSectionsWithPrice(sections);
  }, [
    hasUpcomingRemateCategories,
    visibleUpcomingRemateGroups,
    hasUpcomingVentaDirectaCategories,
    visibleUpcomingVentaDirectaGroups,
    proximosRemates,
    ventasDirectas,
    homeVisibleItems,
    config.vehiclePrices,
    config.sectionTexts,
    showPatents,
  ]);

  const downloadVisibleCalendarPdf = useCallback(async () => {
    if (isDownloadingCalendarPdf) return;
    if (calendarPdfSections.length === 0) {
      showSystemNotice(
        "info",
        "Sin publicaciones con precio",
        "No hay publicaciones con precio visible para incluir en el PDF con los filtros actuales.",
      );
      return;
    }
    setIsDownloadingCalendarPdf(true);
    try {
      const logoDataUrl = await loadLogoForPdfAsDataUrl();
      const catalogBaseUrl =
        typeof window !== "undefined" ? window.location.origin : "https://catalogo.vedisaremates.cl";
      const { doc, exportFileName, totalRows } = await generateCatalogPdfDocument(
        calendarPdfSections,
        logoDataUrl,
        { showPatents, catalogBaseUrl },
      );
      saveCatalogPdfDocument(doc, exportFileName);
      trackEvent("calendar_pdf_download", {
        categories: calendarPdfSections.length,
        publications: totalRows,
        pages: doc.getNumberOfPages(),
      });
      showSystemNotice(
        "success",
        "PDF generado",
        `Se descargó correctamente: ${exportFileName}`,
      );
    } catch (error) {
      console.error("[catalog-pdf]", error);
      showSystemNotice(
        "error",
        "No se pudo generar el PDF",
        "Intenta nuevamente. Si el problema persiste, recarga la página.",
      );
    } finally {
      setIsDownloadingCalendarPdf(false);
    }
  }, [calendarPdfSections, isDownloadingCalendarPdf, showPatents, showSystemNotice]);

  const nextAuction = useMemo(() => {
    const today = new Date();
    const upcoming = sortedRemateAuctions
      .map((auction) => ({ auction, date: parseAuctionDateTime(auction) }))
      .filter((entry): entry is { auction: UpcomingAuction; date: Date } => !!entry.date)
      .filter((entry) => !Number.isNaN(entry.date.getTime()) && entry.date.getTime() >= today.getTime())
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    return upcoming[0] ?? null;
  }, [sortedRemateAuctions]);

  const heroAuctionCountdown = useMemo(() => {
    if (!nextAuction) return null;
    const label = formatHeroNextRemateLabel(nextAuction.auction);
    return label ? { label } : null;
  }, [nextAuction]);

  const toggleQuickFilter = (filterId: QuickFilterId) => {
    if (!isAllowedHomeBodyFilter(filterId)) return;
    trackEvent("quick_filter_toggle", { filterId });
    setQuickFilters((prev) => {
      const set = new Set(prev);
      if (set.has(filterId)) set.delete(filterId);
      else set.add(filterId);
      return Array.from(set).filter(isAllowedHomeBodyFilter);
    });
  };

  const clearHomeFilters = useCallback(() => {
    setHomeSiniestradoFilter("all");
    setQuickFilters([]);
    setHomeSort("recomendado");
    trackEvent("home_filters_clear");
  }, []);

  const selectedVehicleLookup = useMemo(
    () =>
      selectedVehicle
        ? buildVehicleLookup(selectedVehicle.raw as Record<string, unknown>)
        : new Map<string, unknown>(),
    [selectedVehicle],
  );

  const selectedVehicleKey = useMemo(
    () => (selectedVehicle ? getVehicleKey(selectedVehicle) : ""),
    [selectedVehicle],
  );

  const selectedVehicleOverride = useMemo(
    () =>
      selectedVehicle
        ? getEditorOverrideForItem(selectedVehicle, config.vehicleDetails)
        : undefined,
    [config.vehicleDetails, selectedVehicle],
  );

  const selectedVehiclePriceLabel = useMemo(
    () =>
      selectedVehicle
        ? formatPrice(resolveVehiclePriceRaw(selectedVehicle, config.vehiclePrices) ?? undefined)
        : null,
    [config.vehiclePrices, selectedVehicle],
  );
  const selectedVehicleReferencePriceAmount = useMemo(
    () => parseCurrencyAmount(selectedVehiclePriceLabel),
    [selectedVehiclePriceLabel],
  );
  const selectedVehiclePromoMeta = useMemo(() => {
    if (!selectedVehicle) return { promoEnabled: false, originalPriceLabel: null as string | null };
    const raw = selectedVehicle.raw as Record<string, unknown>;
    const rawMeta = getRawPromoMeta(raw);
    const override = selectedVehicleOverride;
    const promoEnabled =
      typeof override?.promoEnabled === "boolean" ? override.promoEnabled : rawMeta.promoEnabled;
    const originalPriceLabel = override?.originalPrice?.trim()
      ? override.originalPrice.trim()
      : rawMeta.originalPriceLabel;
    return { promoEnabled, originalPriceLabel };
  }, [selectedVehicle, selectedVehicleOverride]);

  const selectedVehicleShareUrl = useMemo(() => {
    if (!selectedVehicle) return "";
    const vehiclePath = `/vehiculos/${encodeURIComponent(selectedVehicleKey)}`;
    if (typeof window === "undefined") return vehiclePath;
    if (isStandaloneDetailPage) {
      return `${window.location.origin}${vehiclePath}`;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("vehiculo", selectedVehicleKey);
    if (!url.hash) url.hash = "proximos-remates";
    return url.toString();
  }, [isStandaloneDetailPage, selectedVehicle, selectedVehicleKey]);

  const selectedVehicleWhatsappUrl = useMemo(() => {
    if (!selectedVehicle) return "";
    const patent = maskPatentForDisplay(getPatent(selectedVehicle), showPatents);
    const label = getModel(selectedVehicle);
    const shareLink = selectedVehicleShareUrl || "https://catalogo.vedisaremates.cl/#proximos-remates";
    const vehicleLabel = patent ? `${patent} - ${label}` : label;
    const text = `Hola, me interesa este vehículo: ${vehicleLabel}. ¿Me puedes asesorar? ${shareLink}`;
    return `https://api.whatsapp.com/send/?phone=${WHATSAPP_PHONE}&text=${encodeURIComponent(
      text,
    )}&type=phone_number&app_absent=0`;
  }, [selectedVehicle, selectedVehicleShareUrl, showPatents]);

  const selectedVehicleConditionLabel = useMemo(() => {
    if (!selectedVehicle) return null;
    const overrideValue = selectedVehicleOverride?.vehicleCondition;
    if (overrideValue?.trim()) return overrideValue.trim();
    const rawValue = getLookupValue(selectedVehicleLookup, [
      "condicion",
      "condición",
      "condicion_vehiculo",
      "estado_vehiculo",
      "estado",
      "status",
      "aws.condicion",
      "aws.estado",
    ]);
    return hasValue(rawValue) ? String(rawValue) : null;
  }, [selectedVehicle, selectedVehicleLookup, selectedVehicleOverride]);

  const selectedVehicleConditionClasses = useMemo(
    () => getConditionBadgeClasses(selectedVehicleConditionLabel),
    [selectedVehicleConditionLabel],
  );
  const selectedVehiclePrimaryCtaLabel = useMemo(() => {
    const sample = normalizeText(selectedVehicleConditionLabel ?? "");
    if (!sample) return "Solicitar asesoría por WhatsApp";
    if (/100% operativo|operativo/.test(sample)) return "Me interesa este vehículo";
    if (/no arranca|desarme/.test(sample)) return "Consultar condición y retiro";
    return "Quiero más información de esta unidad";
  }, [selectedVehicleConditionLabel]);

  const selectedVehicleReferencePriceDisplay = useMemo(
    () => formatCurrencyAmount(selectedVehicleReferencePriceAmount),
    [selectedVehicleReferencePriceAmount],
  );

  const selectedVehicleGalleryImages = useMemo(() => {
    if (!selectedVehicle) return [] as string[];
    const list = [selectedVehicle.thumbnail, ...selectedVehicle.images].filter(
      (entry): entry is string => typeof entry === "string" && entry.startsWith("http"),
    );
    const unique = Array.from(new Set(list));
    const glo3dImages = unique.filter(isGlo3dCatalogImageUrl);
    const tasacionesImages = unique.filter(isTasacionesInventoryPhotoUrl);
    const rest = unique.filter(
      (url) => !glo3dImages.includes(url) && !tasacionesImages.includes(url),
    );
    return mergeVehicleImageSources({
      glo3dImages,
      autoredImages: rest,
      inventarioImages: tasacionesImages,
    }).images;
  }, [selectedVehicle]);

  const selectedVehicleMainImage = useMemo(() => {
    if (selectedVehicleGalleryImages.length === 0) return "/placeholder-car.svg";
    const idx = Math.min(selectedVehicleImageIndex, selectedVehicleGalleryImages.length - 1);
    return selectedVehicleGalleryImages[idx] ?? "/placeholder-car.svg";
  }, [selectedVehicleGalleryImages, selectedVehicleImageIndex]);

  const selectedVehicleLightboxImage = useMemo(() => {
    if (
      selectedVehicleLightboxIndex === null ||
      selectedVehicleLightboxIndex < 0 ||
      selectedVehicleLightboxIndex >= selectedVehicleGalleryImages.length
    ) {
      return null;
    }
    return selectedVehicleGalleryImages[selectedVehicleLightboxIndex] ?? null;
  }, [selectedVehicleGalleryImages, selectedVehicleLightboxIndex]);

  const selectedVehicleExpandedDescription = useMemo(() => {
    if (!selectedVehicle) return null;
    const overrideText =
      selectedVehicleOverride?.extendedDescription ?? selectedVehicleOverride?.description;
    if (overrideText?.trim()) return overrideText.trim();
    const rawText = getLookupValue(selectedVehicleLookup, [
      "descripcion_ampliada",
      "observaciones",
      "detalle",
      "descripcion",
      "description",
      "aws.observaciones",
      "aws.descripcion",
      "aws.description",
      "cav_campos.observaciones",
      "cav_campos.descripcion",
      "comentarios",
      "notas",
    ]);
    return hasValue(rawText) ? String(rawText) : null;
  }, [selectedVehicle, selectedVehicleLookup, selectedVehicleOverride]);

  const selectedVehicleLotDocuments = useMemo(() => {
    if (!selectedVehicle) return [] as LotDocumentLink[];
    const j =
      selectedVehicleOverride?.lotDocumentsJson?.trim() ||
      String(
        getLookupValue(selectedVehicleLookup, [
          "documentos_lote_json",
          "lot_documents_json",
          "glo3d.documentos_lote_json",
        ]) ?? "",
      );
    return parseLotDocumentsJson(j);
  }, [selectedVehicle, selectedVehicleLookup, selectedVehicleOverride]);

  const [tasacionesVehicleDocuments, setTasacionesVehicleDocuments] = useState<LotDocumentLink[]>([]);
  const [nombresArchivoOcultosTasaciones, setNombresArchivoOcultosTasaciones] = useState<string[]>([]);
  const [tasacionesDocsStatus, setTasacionesDocsStatus] = useState<"idle" | "loading" | "ready">("idle");

  useEffect(() => {
    if (!selectedVehicle) {
      setTasacionesVehicleDocuments([]);
      setNombresArchivoOcultosTasaciones([]);
      setTasacionesDocsStatus("idle");
      return;
    }
    const patente = normalizePatentToken(getPatent(selectedVehicle));
    if (!patente) {
      setTasacionesVehicleDocuments([]);
      setNombresArchivoOcultosTasaciones([]);
      setTasacionesDocsStatus("ready");
      return;
    }

    let cancelled = false;
    setTasacionesDocsStatus("loading");
    void fetch(`/api/public/vehiculo-documentos?patente=${encodeURIComponent(patente)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled) return;
        if (!payload || payload.ok !== true) {
          setTasacionesVehicleDocuments([]);
          setNombresArchivoOcultosTasaciones([]);
          return;
        }
        const rows = Array.isArray(payload.documentos) ? payload.documentos : [];
        setTasacionesVehicleDocuments(
          rows.filter(
            (doc: LotDocumentLink) =>
              typeof doc?.url === "string" && doc.url.trim().startsWith("http"),
          ),
        );
        setNombresArchivoOcultosTasaciones(
          Array.isArray(payload.nombres_archivo_ocultos) ? payload.nombres_archivo_ocultos : [],
        );
      })
      .catch(() => {
        if (!cancelled) {
          setTasacionesVehicleDocuments([]);
          setNombresArchivoOcultosTasaciones([]);
        }
      })
      .finally(() => {
        if (!cancelled) setTasacionesDocsStatus("ready");
      });

    return () => {
      cancelled = true;
    };
  }, [selectedVehicle]);

  const selectedVehicleLotDocumentsSinOcultos = useMemo(
    () =>
      selectedVehicleLotDocuments.filter(
        (doc) =>
          doc.visibleInCatalog !== false &&
          !isLotDocumentLabelBlocked(doc.label, nombresArchivoOcultosTasaciones),
      ),
    [selectedVehicleLotDocuments, nombresArchivoOcultosTasaciones],
  );

  /** Tasaciones primero; importados externos después, sin repetir URL ni nombre. */
  const selectedVehicleDisplayDocuments = useMemo(() => {
    if (tasacionesDocsStatus !== "ready") return [];
    return mergeLotDocumentLinks(tasacionesVehicleDocuments, selectedVehicleLotDocumentsSinOcultos);
  }, [tasacionesDocsStatus, tasacionesVehicleDocuments, selectedVehicleLotDocumentsSinOcultos]);

  const selectedVehicleTabs = useMemo(
    () => {
      const tabs: Array<{ id: VehicleDetailTabId; label: string }> = [
        { id: "descripcion", label: "Descripción" },
        { id: "general", label: "Información del vehículo" },
        { id: "tecnica", label: "Detalles técnicos" },
      ];
      if (selectedVehicleGalleryImages.length > 0) {
        tabs.push({ id: "fotos", label: "Fotos" });
      }
      return tabs;
    },
    [selectedVehicleGalleryImages.length],
  );

  const closeSelectedVehicleLightbox = useCallback(() => {
    setSelectedVehicleLightboxIndex(null);
    setSelectedVehicleLightboxZoom(1);
  }, []);

  const openSelectedVehicleLightboxAt = useCallback(
    (index: number) => {
      if (selectedVehicleGalleryImages.length === 0) return;
      const boundedIndex = Math.max(0, Math.min(index, selectedVehicleGalleryImages.length - 1));
      setSelectedVehicleLightboxIndex(boundedIndex);
      setSelectedVehicleImageIndex(boundedIndex);
      setSelectedVehicleLightboxZoom(1);
    },
    [selectedVehicleGalleryImages.length],
  );

  const moveSelectedVehicleLightbox = useCallback(
    (direction: "prev" | "next") => {
      if (selectedVehicleGalleryImages.length <= 1) return;
      setSelectedVehicleLightboxIndex((prev) => {
        const current = prev ?? 0;
        const delta = direction === "next" ? 1 : -1;
        const next =
          (current + delta + selectedVehicleGalleryImages.length) %
          selectedVehicleGalleryImages.length;
        setSelectedVehicleImageIndex(next);
        return next;
      });
      setSelectedVehicleLightboxZoom(1);
    },
    [selectedVehicleGalleryImages.length],
  );

  const zoomSelectedVehicleLightbox = useCallback((direction: "in" | "out" | "reset") => {
    setSelectedVehicleLightboxZoom((prev) => {
      if (direction === "reset") return 1;
      const next = direction === "in" ? prev + 0.2 : prev - 0.2;
      return Math.max(1, Math.min(next, 3));
    });
  }, []);

  const onSelectedVehicleLightboxWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (event.deltaY < 0) {
        zoomSelectedVehicleLightbox("in");
      } else {
        zoomSelectedVehicleLightbox("out");
      }
    },
    [zoomSelectedVehicleLightbox],
  );

  useEffect(() => {
    if (selectedVehicle) {
      setSelectedVehicleTab("descripcion");
      setSelectedVehicleLightboxIndex(null);
      setSelectedVehicleLightboxZoom(1);
    }
  }, [selectedVehicle]);

  useEffect(() => {
    if (selectedVehicleLightboxIndex === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSelectedVehicleLightbox();
      else if (event.key === "ArrowLeft") moveSelectedVehicleLightbox("prev");
      else if (event.key === "ArrowRight") moveSelectedVehicleLightbox("next");
      else if (event.key === "+" || event.key === "=") zoomSelectedVehicleLightbox("in");
      else if (event.key === "-" || event.key === "_") zoomSelectedVehicleLightbox("out");
      else if (event.key.toLowerCase() === "0") zoomSelectedVehicleLightbox("reset");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    selectedVehicleLightboxIndex,
    closeSelectedVehicleLightbox,
    moveSelectedVehicleLightbox,
    zoomSelectedVehicleLightbox,
  ]);

  const selectedVehicleFieldsByTab = useMemo(() => {
    if (!selectedVehicle) {
      return {
        general: [] as Array<[string, string]>,
        descripcion: [] as Array<[string, string]>,
        tecnica: [] as Array<[string, string]>,
      };
    }

    const raw = selectedVehicle.raw as Record<string, unknown>;
    const toPairs = (
      entries: Array<{
        label: string;
        value: unknown;
        formatter?: (value: unknown) => string;
      }>,
    ): Array<[string, string]> =>
      entries
        .filter((entry) => hasValue(entry.value))
        .map((entry) => [
          entry.label,
          entry.formatter ? entry.formatter(entry.value) : String(entry.value),
        ]);

    const formatYesNo = (value: unknown): string => {
      const sample = String(value ?? "").trim().toLowerCase();
      if (["si", "sí", "yes", "y", "true", "1"].includes(sample)) return "Sí";
      if (["no", "false", "0", "n"].includes(sample)) return "No";
      return String(value);
    };

    const fields = {
      general: toPairs([
        { label: "Patente", value: getPatent(selectedVehicle) },
        {
          label: "Patente verificador",
          value: getLookupValue(selectedVehicleLookup, [
            "patente_verifier",
            "patente_dv",
            "ppu_dv",
            "dv",
            "verificador_patente",
            "glo3d.patente_verifier",
            "glo3d.patente_dv",
            "glo3d.ppu_dv",
            "glo3d.dv",
          ]),
        },
        {
          label: "VIN",
          value: getLookupValue(selectedVehicleLookup, [
            "vin",
            "n_de_vin",
            "numero_chasis",
            "nro_chasis",
            "chasis",
            "glo3d.n_de_vin",
            "glo3d.vin",
          ]),
        },
        {
          label: "N° de chasis",
          value: getLookupValue(selectedVehicleLookup, [
            "n_de_chasis",
            "numero_chasis",
            "nro_chasis",
            "chasis",
            "glo3d.n_de_chasis",
          ]),
        },
        {
          label: "Marca",
          value:
            selectedVehicleOverride?.brand ??
            getLookupValue(selectedVehicleLookup, ["marca", "brand", "make", "glo3d.make", "autored.marca"]) ??
            raw.marca,
        },
        {
          label: "Modelo",
          value:
            selectedVehicleOverride?.model ??
            getLookupValue(selectedVehicleLookup, ["modelo", "model", "model2", "glo3d.model2", "autored.modelo"]) ??
            getModel(selectedVehicle),
        },
        {
          label: "Año",
          value:
            selectedVehicleOverride?.year ??
            getLookupValue(selectedVehicleLookup, ["ano", "anio", "year", "glo3d.year", "autored.ano"]),
        },
        {
          label: "Tipo de vehículo",
          value: getLookupValue(selectedVehicleLookup, [
            "tipo_de_vehiculo",
            "tipo_vehiculo",
            "vehicle_type",
            "vehicle_type_name",
            "glo3d.tipo_de_vehiculo",
            "glo3d.tipo_vehiculo",
            "glo3d.vehicle_type",
          ]),
        },
        {
          label: "Categoría",
          value: getVehicleCategoryLabel(
            String(
              selectedVehicleOverride?.category ??
                getLookupValue(selectedVehicleLookup, ["categoria", "tipo_vehiculo", "tipo"]) ??
                inferVehicleType(selectedVehicle),
            ),
          ),
        },
        {
          label: "Condición",
          value:
            selectedVehicleOverride?.vehicleCondition ??
            getLookupValue(selectedVehicleLookup, [
              "condicion",
              "condición",
              "condicion_vehiculo",
              "estado_vehiculo",
              "estado",
              "status",
            ]),
        },
      ]),
      descripcion: [] as Array<[string, string]>,
      tecnica: toPairs([
        {
          label: "Kilometraje",
          value: getLookupValue(selectedVehicleLookup, [
            "kilometraje",
            "km",
            "kms",
            "odometro",
            "odómetro",
            "mileage",
            "odometer",
            "cav_campos.kilometraje",
            "cav_campos.km",
            "autored.kilometraje",
            "autored.km",
            "autored.odometro",
            "autored.odometer",
          ]),
        },
        {
          label: "Color",
          value: getLookupValue(selectedVehicleLookup, [
            "color",
            "color_exterior",
            "color_vehiculo",
            "cav_campos.color",
            "autored.color",
            "autored.color_exterior",
            "autored.exterior_color",
          ]),
        },
        {
          label: "Combustible",
          value: getLookupValue(selectedVehicleLookup, [
            "combustible",
            "tipo_combustible",
            "fuel",
            "fuel_type",
            "cav_campos.combustible",
            "autored.combustible",
            "autored.tipo_combustible",
            "autored.fuel",
            "autored.fuel_type",
          ]),
        },
        {
          label: "Transmisión",
          value: getLookupValue(selectedVehicleLookup, [
            "transmision",
            "transmisión",
            "caja",
            "tipo_caja",
            "transmission",
            "gearbox",
            "cav_campos.transmision",
            "cav_campos.caja",
            "autored.transmision",
            "autored.transmission",
            "autored.caja",
            "autored.tipo_caja",
            "glo3d.transmission",
          ]),
        },
        {
          label: "Tracción",
          value: getLookupValue(selectedVehicleLookup, [
            "traccion",
            "tracción",
            "tipo_traccion",
            "drivetrain",
            "traction",
            "cav_campos.traccion",
            "autored.traccion",
            "autored.tipo_traccion",
            "autored.drivetrain",
            "drive_type",
            "glo3d.drive_type",
          ]),
        },
        {
          label: "Llaves",
          value: getLookupValue(selectedVehicleLookup, [
            "llaves",
            "keys",
            "has_keys",
            "tiene_llaves",
            "glo3d.llaves",
            "glo3d.keys",
            "glo3d.has_keys",
          ]),
          formatter: formatYesNo,
        },
        {
          label: "Aire acondicionado",
          value: getLookupValue(selectedVehicleLookup, [
            "aire_acondicionado",
            "air_conditioning",
            "has_ac",
            "ac",
            "glo3d.aire_acondicionado",
            "glo3d.air_conditioning",
            "glo3d.has_ac",
          ]),
          formatter: formatYesNo,
        },
        {
          label: "Único propietario",
          value: getLookupValue(selectedVehicleLookup, [
            "unico_propietario",
            "único_propietario",
            "single_owner",
            "one_owner",
            "glo3d.unico_propietario",
            "glo3d.single_owner",
          ]),
          formatter: formatYesNo,
        },
        {
          label: "Condicionado",
          value: getLookupValue(selectedVehicleLookup, [
            "condicionado",
            "conditioned",
            "acondicionado",
            "glo3d.condicionado",
          ]),
          formatter: formatYesNo,
        },
        {
          label: "Aro",
          value: getLookupValue(selectedVehicleLookup, [
            "aro",
            "aro_llanta",
            "rin",
            "rines",
            "wheel_size",
            "cav_campos.aro",
            "autored.aro",
            "autored.rin",
            "autored.rines",
            "autored.wheel_size",
            "glo3d.aro",
          ]),
        },
        {
          label: "Cilindrada",
          value: getLookupValue(selectedVehicleLookup, [
            "cilindrada",
            "cc",
            "motor_cc",
            "engine_cc",
            "cav_campos.cilindrada",
            "autored.cilindrada",
            "autored.cc",
            "autored.motor_cc",
            "autored.engine_cc",
            "glo3d.engine",
          ]),
        },
        {
          label: "Tipo",
          value: getLookupValue(selectedVehicleLookup, [
            "tipo",
            "type",
            "tipo_unidad",
            "condition_type",
            "glo3d.tipo",
            "glo3d.type",
          ]),
        },
        {
          label: "Versión",
          value: getLookupValue(selectedVehicleLookup, [
            "version",
            "ver",
            "trim",
            "glo3d.version",
            "glo3d.ver",
            "glo3d.trim",
          ]),
        },
        {
          label: "N° de siniestro",
          value: getLookupValue(selectedVehicleLookup, [
            "n_de_siniestro",
            "numero_siniestro",
            "n_s",
            "ns",
            "n°s",
            "glo3d.n_de_siniestro",
            "glo3d.n_s",
            "glo3d.ns",
          ]),
        },
        {
          label: "N° de motor",
          value: getLookupValue(selectedVehicleLookup, [
            "n_de_motor",
            "numero_motor",
            "motor_number",
            "ndm",
            "glo3d.n_de_motor",
            "glo3d.ndm",
          ]),
        },
        {
          label: "N° de serie",
          value: getLookupValue(selectedVehicleLookup, [
            "n_de_serie",
            "numero_serie",
            "serial_number",
            "nds",
            "glo3d.n_de_serie",
            "glo3d.nds",
          ]),
        },
        {
          label: "Ubicación física",
          value: getLookupValue(selectedVehicleLookup, [
            "ubicacion_fisica",
            "ubicacion",
            "ubi",
            "location",
            "glo3d.ubicacion_fisica",
            "glo3d.ubi",
          ]),
        },
        {
          label: "Transportista",
          value: getLookupValue(selectedVehicleLookup, [
            "transportista",
            "tra",
            "glo3d.transportista",
            "glo3d.tra",
          ]),
        },
        {
          label: "Taller",
          value: getLookupValue(selectedVehicleLookup, [
            "taller",
            "tal",
            "glo3d.taller",
            "glo3d.tal",
          ]),
        },
        {
          label: "Multas",
          value: getLookupValue(selectedVehicleLookup, [
            "multas",
            "mul",
            "glo3d.multas",
            "glo3d.mul",
          ]),
        },
        {
          label: "TAG",
          value: getLookupValue(selectedVehicleLookup, [
            "tag",
            "glo3d.tag",
          ]),
        },
        {
          label: "Vencimiento revisión técnica",
          value: getLookupValue(selectedVehicleLookup, [
            "vencimiento_revision_tecnica",
            "revision_tecnica_vencimiento",
            "vrt",
            "glo3d.vencimiento_revision_tecnica",
            "glo3d.vrt",
          ]),
        },
        {
          label: "Vencimiento permiso circulación",
          value: getLookupValue(selectedVehicleLookup, [
            "vencimiento_permiso_circulacion",
            "permiso_circulacion_vencimiento",
            "vpc",
            "glo3d.vencimiento_permiso_circulacion",
            "glo3d.vpc",
          ]),
        },
        {
          label: "Vencimiento seguro obligatorio",
          value: getLookupValue(selectedVehicleLookup, [
            "vencimiento_seguro_obligatorio",
            "seguro_obligatorio_vencimiento",
            "vso",
            "glo3d.vencimiento_seguro_obligatorio",
            "glo3d.vso",
          ]),
        },
        {
          label: "Prueba de motor (arranca)",
          value: getLookupValue(selectedVehicleLookup, [
            "prueba_motor",
            "prueba_motor_arranca",
            "pdm",
            "glo3d.prueba_motor",
            "glo3d.pdm",
          ]),
          formatter: formatYesNo,
        },
        {
          label: "Prueba de desplazamiento (se mueve)",
          value: getLookupValue(selectedVehicleLookup, [
            "prueba_desplazamiento",
            "prueba_desplazamiento_mueve",
            "pdd",
            "glo3d.prueba_desplazamiento",
            "glo3d.pdd",
          ]),
          formatter: formatYesNo,
        },
        {
          label: "Estado de airbags",
          value: getLookupValue(selectedVehicleLookup, [
            "estado_airbags",
            "airbags_estado",
            "eda",
            "glo3d.estado_airbags",
            "glo3d.eda",
          ]),
        },
        {
          label: "Nombre propietario anterior",
          value: getLookupValue(selectedVehicleLookup, [
            "nombre_propietario_anterior",
            "previous_owner_name",
            "owner_previous_name",
            "npa",
            "glo3d.nombre_propietario_anterior",
            "glo3d.previous_owner_name",
            "glo3d.npa",
          ]),
        },
        {
          label: "RUT propietario anterior",
          value: getLookupValue(selectedVehicleLookup, [
            "rut_propietario_anterior",
            "previous_owner_rut",
            "owner_previous_rut",
            "rpa",
            "glo3d.rut_propietario_anterior",
            "glo3d.previous_owner_rut",
            "glo3d.rpa",
          ]),
        },
        {
          label: "RUT verificador",
          value: getLookupValue(selectedVehicleLookup, [
            "rut_verificador",
            "verifier_rut",
            "rut_verifier",
            "glo3d.rut_verificador",
            "glo3d.verifier_rut",
          ]),
        },
      ]),
    };
    return {
      general: filterPatentDetailFields(fields.general, showPatents),
      descripcion: fields.descripcion,
      tecnica: filterPatentDetailFields(fields.tecnica, showPatents),
    };
  }, [selectedVehicle, selectedVehicleLookup, selectedVehicleOverride, showPatents]);

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

  const openOfferModal = useCallback(() => {
    if (!selectedVehicle) return;
    if (selectedVehicleReferencePriceAmount <= 0) {
      showSystemNotice(
        "info",
        "Precio no disponible",
        "Este vehículo no tiene precio referencial cargado. Contáctanos por WhatsApp para ofertar.",
      );
      return;
    }
    setShowOfferModal(true);
    trackEvent("offer_modal_open", {
      ...(selectedVehicle
        ? buildVehicleAnalyticsContextRef.current(selectedVehicle)
        : { itemKey: selectedVehicleKey }),
    });
  }, [selectedVehicle, selectedVehicleKey, selectedVehicleReferencePriceAmount, showSystemNotice]);

  const closeOfferModal = useCallback(() => {
    setShowOfferModal(false);
    setOfferSending(false);
    setOfferForm(buildEmptyOfferForm());
  }, []);

  const submitOffer = useCallback(async () => {
    if (!selectedVehicle) return;
    const customerName = offerForm.customerName.trim();
    const customerEmail = offerForm.customerEmail.trim();
    const customerPhone = offerForm.customerPhone.trim();
    const offerAmount = parseCurrencyAmount(offerForm.offerAmount);

    if (!customerName || !customerEmail || !customerPhone || offerAmount <= 0) {
      showSystemNotice("error", "Campos obligatorios", "Completa nombre, mail, teléfono y oferta para enviar.");
      trackEvent("offer_submit_invalid", { itemKey: selectedVehicleKey });
      return;
    }
    if (!isValidEmailAddress(customerEmail)) {
      showSystemNotice("error", "Correo inválido", "Ingresa un mail válido para contactarte.");
      trackEvent("offer_submit_invalid_email", { itemKey: selectedVehicleKey });
      return;
    }
    if (selectedVehicleReferencePriceAmount <= 0) {
      showSystemNotice(
        "error",
        "Precio referencial no disponible",
        "No podemos registrar la oferta porque falta el precio referencial de este vehículo.",
      );
      return;
    }

    setOfferSending(true);
    try {
      const response = await fetch("/api/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemKey: selectedVehicleKey,
          vehicleTitle: getModel(selectedVehicle),
          patent: getPatent(selectedVehicle),
          referencePrice: selectedVehicleReferencePriceAmount,
          offerAmount,
          customerName,
          customerEmail,
          customerPhone,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        showSystemNotice(
          "error",
          "No pudimos registrar tu oferta",
          payload.error ?? "Intenta nuevamente en unos segundos.",
        );
        trackEvent("offer_submit_error", { itemKey: selectedVehicleKey });
        return;
      }
      trackEvent("offer_submit_success", {
        ...(selectedVehicle
          ? buildVehicleAnalyticsContextRef.current(selectedVehicle)
          : { itemKey: selectedVehicleKey }),
        offerAmount,
      });
      showSystemNotice(
        "success",
        "Oferta recibida",
        "Ya recibimos tu oferta y nos pondremos en contacto contigo en caso de adjudicarse.",
      );
      setOfferForm(buildEmptyOfferForm());
      setShowOfferModal(false);
    } catch {
      showSystemNotice(
        "error",
        "No pudimos registrar tu oferta",
        "Intenta nuevamente en unos segundos.",
      );
      trackEvent("offer_submit_error", { itemKey: selectedVehicleKey });
    } finally {
      setOfferSending(false);
    }
  }, [
    offerForm,
    selectedVehicle,
    selectedVehicleKey,
    selectedVehicleReferencePriceAmount,
    showSystemNotice,
  ]);

  const shareSelectedVehicle = useCallback(async () => {
    if (!selectedVehicle) return;
    const shareUrl = selectedVehicleShareUrl;
    if (!shareUrl) return;
    const patent = maskPatentForDisplay(getPatent(selectedVehicle), showPatents);
    const model = getModel(selectedVehicle);
    const title = patent ? `${patent} · ${model}` : model;
    const text = `Revisa este vehículo en Catálogo Vedisa: ${title}`;
    const canUseNativeShare = typeof navigator.share === "function";
    try {
      if (canUseNativeShare) {
        await navigator.share({ title, text, url: shareUrl });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        window.open(shareUrl, "_blank", "noreferrer");
      }
      trackEvent("vehicle_share", buildVehicleAnalyticsContextRef.current(selectedVehicle));
      showSystemNotice(
        "success",
        "Enlace listo",
        canUseNativeShare
          ? "Se compartió el vehículo correctamente."
          : "Copiamos el enlace del vehículo para compartir.",
      );
    } catch {
      showSystemNotice("error", "No se pudo compartir", "Intenta nuevamente en unos segundos.");
    }
  }, [selectedVehicle, selectedVehicleShareUrl, showPatents, showSystemNotice]);

  const catalogSiteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://catalogo.vedisaremates.cl";

  const organizationSchema = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "VEDISA REMATES",
      url: catalogSiteUrl,
      logo: `${catalogSiteUrl}/favicon.png`,
      contactPoint: {
        "@type": "ContactPoint",
        telephone: "+56-9-8932-3397",
        contactType: "customer service",
        areaServed: "CL",
        availableLanguage: "es",
      },
      sameAs: ["https://vehiculoschocados.cl/"],
    }),
    [catalogSiteUrl],
  );

  const websiteSchema = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Catálogo VEDISA REMATES",
      url: catalogSiteUrl,
      potentialAction: {
        "@type": "SearchAction",
        target: `${catalogSiteUrl}/vehiculos?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    }),
    [catalogSiteUrl],
  );

  const filteredEditorItems = useMemo(() => {
    const query = normalizeText(searchTerm);
    const patentTokens = extractPatentTokens(searchTerm);
    const source = query
      ? activeInventoryItems.filter((item) => {
          if (patentTokens.length > 0) {
            const itemPatent = getPatent(item);
            if (itemPatent !== "—") {
              return patentTokens.includes(normalizePatentToken(itemPatent));
            }
            return patentTokens.includes(normalizePatentToken(getVehicleKey(item)));
          }
          return normalizeText(`${item.title} ${item.subtitle ?? ""}`).includes(query);
        })
      : activeInventoryItems;
    const byGroup =
      editorGroupFilter === "all"
        ? source
        : editorGroupFilter === "proximos-remates"
          ? source.filter((item) =>
              Boolean(config.vehicleUpcomingAuctionIds[getVehicleKey(item)]),
            )
          : editorGroupFilter.startsWith("managed:")
            ? source.filter((item) => {
                const managedCategoryId = editorGroupFilter.replace("managed:", "");
                const managedCategory = (config.managedCategories ?? []).find(
                  (category) => category.id === managedCategoryId,
                );
                if (!managedCategory) return false;
                return (managedCategory.vehicleIds ?? []).includes(getVehicleKey(item));
              })
          : source.filter((item) => {
              const sectionGroup = editorGroupFilter as Exclude<EditorGroupFilter, "all" | `managed:${string}`>;
              return (config.sectionVehicleIds[sectionGroup] ?? []).includes(getVehicleKey(item));
            });
    const byVisibility =
      editorVisibilityFilter === "all"
        ? byGroup
        : byGroup.filter((item) => {
            const isHidden = mergedHiddenVehicleIds.has(getVehicleKey(item));
            return editorVisibilityFilter === "hidden" ? isHidden : !isHidden;
          });
    const byVehicleCategory =
      editorVehicleCategoryFilter === "all"
        ? byVisibility
        : byVisibility.filter(
            (item) =>
              inferVehicleCategoryForAdmin(item) === editorVehicleCategoryFilter,
          );
    if (!auctionFilterId) return byVehicleCategory;
    return byVehicleCategory.filter(
      (item) =>
        (config.vehicleUpcomingAuctionIds[getVehicleKey(item)] ?? "") === auctionFilterId,
    );
  }, [
    activeInventoryItems,
    searchTerm,
    auctionFilterId,
    editorGroupFilter,
    editorVisibilityFilter,
    editorVehicleCategoryFilter,
    mergedHiddenVehicleIds,
    config.vehicleUpcomingAuctionIds,
    config.sectionVehicleIds,
    config.managedCategories,
  ]);

  const totalEditorPages = Math.max(1, Math.ceil(filteredEditorItems.length / EDITOR_PAGE_SIZE));
  const currentEditorPage = Math.min(editorPage, totalEditorPages);
  const paginatedEditorItems = useMemo(() => {
    const start = (currentEditorPage - 1) * EDITOR_PAGE_SIZE;
    return filteredEditorItems.slice(start, start + EDITOR_PAGE_SIZE);
  }, [filteredEditorItems, currentEditorPage]);
  const paginatedEditorKeys = useMemo(
    () => paginatedEditorItems.map((item) => getVehicleKey(item)),
    [paginatedEditorItems],
  );
  const selectedInventorySet = useMemo(
    () => new Set(selectedInventoryKeys),
    [selectedInventoryKeys],
  );
  const allPaginatedSelected =
    paginatedEditorKeys.length > 0 && paginatedEditorKeys.every((key) => selectedInventorySet.has(key));

  useEffect(() => {
    // Limpia selección de inventario cuando cambia la vista base.
    if (adminTab !== "vehiculos" || inventorySubtab !== "actual") {
      setSelectedInventoryKeys([]);
    }
  }, [adminTab, inventorySubtab]);

  useEffect(() => {
    // Mantiene solo selección válida en el set actual filtrado.
    const valid = new Set(filteredEditorItems.map((item) => getVehicleKey(item)));
    setSelectedInventoryKeys((prev) => prev.filter((key) => valid.has(key)));
  }, [filteredEditorItems]);

  const activeManagedCategory = useMemo(
    () =>
      assignCategoryId
        ? (config.managedCategories ?? []).find((category) => category.id === assignCategoryId) ?? null
        : null,
    [assignCategoryId, config.managedCategories],
  );

  const managedCategoryAssignCandidates = useMemo(() => {
    if (!activeManagedCategory) return [] as CatalogItem[];
    const query = normalizeText(assignSearchTerm);
    const source = items.filter((item) => {
      if (!query) return true;
      const sample = normalizeText(
        `${getPatent(item)} ${getModel(item)} ${item.title} ${item.subtitle ?? ""}`,
      );
      return sample.includes(query);
    });
    return source;
  }, [activeManagedCategory, assignSearchTerm, items]);

  const batchAssignPatentTokens = useMemo(
    () => extractPatentTokens(batchAssignSearchTerm),
    [batchAssignSearchTerm],
  );

  const batchAssignCandidates = useMemo(() => {
    if (!batchAssignTarget) return [] as CatalogItem[];
    if (!batchAssignSearchTerm.trim()) return [] as CatalogItem[];
    return dedupeCatalogItemsByVehicleKey(
      items.filter((item) =>
        matchesInventoryPatentSearch(item, batchAssignSearchTerm, batchAssignPatentTokens),
      ),
    );
  }, [batchAssignSearchTerm, batchAssignPatentTokens, batchAssignTarget, items]);

  const batchAssignSelectedNeedsImport = useMemo(
    () =>
      batchAssignSelectedKeys.some((vehicleKey) => {
        const item =
          itemsByKey.get(vehicleKey) ??
          items.find(
            (entry) =>
              normalizePatentToken(getPatent(entry)) === normalizePatentToken(vehicleKey) ||
              normalizePatentToken(getVehicleKey(entry)) === normalizePatentToken(vehicleKey),
          );
        if (!item) return false;
        const key = getVehicleKey(item);
        return !vehicleHasCompleteAssignFicha(item, key, config);
      }),
    [batchAssignSelectedKeys, config, items, itemsByKey],
  );

  useEffect(() => {
    if (!batchAssignTarget) return;
    const visible = new Set(batchAssignCandidates.map((item) => getVehicleKey(item)));
    setBatchAssignSelectedKeys((prev) => prev.filter((key) => visible.has(key)));
  }, [batchAssignCandidates, batchAssignTarget]);

  const batchAssignTargetLabel = useMemo(() => {
    if (!batchAssignTarget) return "";
    if (batchAssignTarget.type === "auction") {
      const auction = sortedUpcomingAuctions.find((entry) => entry.id === batchAssignTarget.auctionId);
      return auction
        ? `${auction.name} (${formatAuctionWindowLabel(auction)})`
        : "Remate seleccionado";
    }
    return SECTION_LABELS[batchAssignTarget.sectionId];
  }, [batchAssignTarget, sortedUpcomingAuctions]);

  const groupManageTargetLabel = useMemo(() => {
    if (!groupManageTarget) return "";
    if (groupManageTarget.type === "auction") {
      const auction = sortedUpcomingAuctions.find((entry) => entry.id === groupManageTarget.auctionId);
      return auction
        ? `${auction.name} (${formatAuctionWindowLabel(auction)})`
        : "Evento seleccionado";
    }
    return SECTION_LABELS[groupManageTarget.sectionId];
  }, [groupManageTarget, sortedUpcomingAuctions]);

  const groupManageBaseItems = useMemo(() => {
    if (!groupManageTarget) return [] as CatalogItem[];
    const assignedKeys = new Set(
      groupManageTarget.type === "auction"
        ? Object.entries(config.vehicleUpcomingAuctionIds)
            .filter(([, auctionId]) => auctionId === groupManageTarget.auctionId)
            .map(([vehicleKey]) => vehicleKey)
        : groupManageTarget.sectionId === "ventas-directas"
          ? ventaDirectaInventoryOnlyKeys
          : (effectiveSectionVehicleIds[groupManageTarget.sectionId] ?? []),
    );
    return dedupeCatalogItemsByVehicleKey(
      activeInventoryItems.filter((item) => isAssignedVehicleKey(assignedKeys, item)),
    );
  }, [
    groupManageTarget,
    activeInventoryItems,
    config.vehicleUpcomingAuctionIds,
    effectiveSectionVehicleIds,
    ventaDirectaInventoryOnlyKeys,
  ]);

  const groupManageItems = useMemo(() => {
    if (!groupManageSearchTerm.trim()) return groupManageBaseItems;
    const patentTokens = extractPatentTokens(groupManageSearchTerm);
    return groupManageBaseItems.filter((item) =>
      matchesInventoryPatentSearch(item, groupManageSearchTerm, patentTokens),
    );
  }, [groupManageBaseItems, groupManageSearchTerm]);

  useEffect(() => {
    const visible = new Set(groupManageItems.map((item) => getVehicleKey(item)));
    setGroupManageSelectedKeys((prev) => prev.filter((key) => visible.has(key)));
  }, [groupManageItems]);

  const sectionVehicleCounts = useMemo(
    () =>
      ({
        "proximos-remates": Object.values(config.vehicleUpcomingAuctionIds).filter(Boolean).length,
        "ventas-directas": (config.sectionVehicleIds["ventas-directas"] ?? []).length,
        novedades: (config.sectionVehicleIds.novedades ?? []).length,
        catalogo: (config.sectionVehicleIds.catalogo ?? []).length,
      }) satisfies Record<SectionId, number>,
    [config.vehicleUpcomingAuctionIds, config.sectionVehicleIds],
  );

  const availableGroupFilterOptions = useMemo(() => {
    const options: Array<{ value: EditorGroupFilter; label: string }> = [];
    if (sectionVehicleCounts["proximos-remates"] > 0) options.push({ value: "proximos-remates", label: "Próximos remates" });
    if (sectionVehicleCounts["ventas-directas"] > 0) options.push({ value: "ventas-directas", label: "Ventas directas" });
    for (const category of config.managedCategories ?? []) {
      if ((category.vehicleIds ?? []).length > 0) {
        options.push({ value: `managed:${category.id}` as EditorGroupFilter, label: category.name });
      }
    }
    return options;
  }, [config.managedCategories, sectionVehicleCounts]);

  const applyBulkVisibility = useCallback(
    (visible: boolean) => {
      if (selectedInventoryKeys.length === 0) return;
      setConfig((prev) => {
        const set = new Set(prev.hiddenVehicleIds ?? []);
        for (const key of selectedInventoryKeys) {
          if (visible) set.delete(key);
          else set.add(key);
        }
        const manualPublications = (prev.manualPublications ?? []).map((entry) => {
          const key = `manual-${entry.id}`;
          if (!selectedInventoryKeys.includes(key)) return entry;
          return { ...entry, visible };
        });
        return { ...prev, hiddenVehicleIds: Array.from(set), manualPublications };
      });
      showSystemNotice("success", visible ? "Visibilidad masiva" : "Ocultado masivo", `${selectedInventoryKeys.length} unidad(es).`);
    },
    [selectedInventoryKeys, showSystemNotice],
  );

  const applyBulkDelete = useCallback(() => {
    if (selectedInventoryKeys.length === 0) return;
    if (!window.confirm(`¿Eliminar/ocultar ${selectedInventoryKeys.length} unidad(es) seleccionadas?`)) return;
    setConfig((prev) => {
      const selected = new Set(selectedInventoryKeys);
      const hidden = new Set(prev.hiddenVehicleIds ?? []);
      const nextAssignments = { ...prev.vehicleUpcomingAuctionIds };
      for (const key of selected) {
        hidden.add(key);
        delete nextAssignments[key];
      }
      const nextSectionVehicleIds = {
        "proximos-remates": (prev.sectionVehicleIds["proximos-remates"] ?? []).filter((id) => !selected.has(id)),
        "ventas-directas": (prev.sectionVehicleIds["ventas-directas"] ?? []).filter((id) => !selected.has(id)),
        novedades: (prev.sectionVehicleIds.novedades ?? []).filter((id) => !selected.has(id)),
        catalogo: (prev.sectionVehicleIds.catalogo ?? []).filter((id) => !selected.has(id)),
      };
      const nextManagedCategories = (prev.managedCategories ?? []).map((category) => ({
        ...category,
        vehicleIds: (category.vehicleIds ?? []).filter((id) => !selected.has(id)),
      }));
      const manualPublications = (prev.manualPublications ?? []).filter((entry) => !selected.has(`manual-${entry.id}`));
      return {
        ...prev,
        hiddenVehicleIds: Array.from(hidden),
        vehicleUpcomingAuctionIds: nextAssignments,
        sectionVehicleIds: nextSectionVehicleIds,
        managedCategories: nextManagedCategories,
        manualPublications,
      };
    });
    setSelectedInventoryKeys([]);
    showSystemNotice("success", "Acción masiva aplicada", "Unidades eliminadas/ocultadas.");
  }, [selectedInventoryKeys, showSystemNotice]);

  const applyBulkSetVentaDirecta = useCallback(
    (enabled: boolean) => {
      if (selectedInventoryKeys.length === 0) return;
      setConfig((prev) => {
        const selected = new Set(selectedInventoryKeys);
        const vdSet = new Set(prev.sectionVehicleIds["ventas-directas"] ?? []);
        const proxSet = new Set(prev.sectionVehicleIds["proximos-remates"] ?? []);
        const nextAssignments = { ...prev.vehicleUpcomingAuctionIds };
        for (const key of selected) {
          if (enabled) {
            vdSet.add(key);
            proxSet.delete(key);
            delete nextAssignments[key];
          } else {
            vdSet.delete(key);
          }
        }
        const publicationUnblocked = enabled
          ? clearPublicationBlocksForVehicleKeys(prev, selected)
          : null;
        return {
          ...prev,
          ...(publicationUnblocked ?? {}),
          vehicleUpcomingAuctionIds: nextAssignments,
          sectionVehicleIds: {
            ...prev.sectionVehicleIds,
            "ventas-directas": Array.from(vdSet),
            "proximos-remates": Array.from(proxSet),
          },
        };
      });
      showSystemNotice("success", "Venta directa masiva", `${selectedInventoryKeys.length} unidad(es).`);
    },
    [selectedInventoryKeys, showSystemNotice],
  );

  const applyBulkAssignAuction = useCallback(() => {
    if (selectedInventoryKeys.length === 0) return;
    const options = sortedUpcomingAuctions.map((a, i) => `${i + 1}. ${a.name} (${formatAuctionWindowLabel(a)})`).join("\n");
    if (!options) return;
    const raw = window.prompt(`Seleccione remate (número):\n${options}`);
    const idx = Number(raw);
    if (!Number.isFinite(idx) || idx < 1 || idx > sortedUpcomingAuctions.length) return;
    const target = sortedUpcomingAuctions[idx - 1];
    setConfig((prev) => {
      const selected = new Set(selectedInventoryKeys);
      const proxSet = new Set(prev.sectionVehicleIds["proximos-remates"] ?? []);
      const vdSet = new Set(prev.sectionVehicleIds["ventas-directas"] ?? []);
      const nextAssignments = { ...prev.vehicleUpcomingAuctionIds };
      for (const key of selected) {
        nextAssignments[key] = target.id;
        proxSet.add(key);
        vdSet.delete(key);
      }
      const publicationUnblocked = clearPublicationBlocksForVehicleKeys(prev, selected);
      return {
        ...prev,
        ...publicationUnblocked,
        vehicleUpcomingAuctionIds: nextAssignments,
        sectionVehicleIds: {
          ...prev.sectionVehicleIds,
          "proximos-remates": Array.from(proxSet),
          "ventas-directas": Array.from(vdSet),
        },
      };
    });
    showSystemNotice("success", "Remate asignado", `${selectedInventoryKeys.length} unidad(es) en ${target.name}.`);
  }, [selectedInventoryKeys, showSystemNotice, sortedUpcomingAuctions]);

  const applyBulkMoveCategory = useCallback(() => {
    if (selectedInventoryKeys.length === 0) return;
    const managed = (config.managedCategories ?? []).map((c) => ({ id: `managed:${c.id}`, label: c.name }));
    if (managed.length === 0) {
      showSystemNotice("info", "Sin categorías", "Crea una categoría personalizada antes de mover unidades.");
      return;
    }
    const menu = managed.map((o, i) => `${i + 1}. ${o.label}`).join("\n");
    const raw = window.prompt(`Mover a categoría personalizada (número):\n${menu}\n0. Quitar categoría`);
    const idx = Number(raw);
    if (!Number.isFinite(idx) || idx < 0 || idx > managed.length) return;
    const target = idx === 0 ? null : managed[idx - 1];
    setConfig((prev) => {
      const selected = new Set(selectedInventoryKeys);
      const nextSectionVehicleIds = {
        ...prev.sectionVehicleIds,
        novedades: (prev.sectionVehicleIds.novedades ?? []).filter((id) => !selected.has(id)),
        catalogo: (prev.sectionVehicleIds.catalogo ?? []).filter((id) => !selected.has(id)),
      };
      const nextManagedCategories = (prev.managedCategories ?? []).map((category) => ({
        ...category,
        vehicleIds: (category.vehicleIds ?? []).filter((id) => !selected.has(id)),
      }));
      if (target?.id?.startsWith("managed:")) {
        const managedId = target.id.replace("managed:", "");
        for (const category of nextManagedCategories) {
          if (category.id === managedId) {
            const set = new Set(category.vehicleIds ?? []);
            for (const key of selected) set.add(key);
            category.vehicleIds = Array.from(set);
          }
        }
      }
      return {
        ...prev,
        sectionVehicleIds: nextSectionVehicleIds,
        managedCategories: nextManagedCategories,
      };
    });
    showSystemNotice("success", "Categoría actualizada", `${selectedInventoryKeys.length} unidad(es).`);
  }, [config.managedCategories, selectedInventoryKeys, showSystemNotice]);

  const toggleItemInSection = (sectionId: SectionId, itemKey: string) => {
    setConfig((prev) => {
      const current = new Set(prev.sectionVehicleIds[sectionId] ?? []);
      const adding = !current.has(itemKey);
      if (adding) current.add(itemKey);
      else current.delete(itemKey);

      if (adding && (sectionId === "ventas-directas" || sectionId === "proximos-remates")) {
        const lane = sectionId as "ventas-directas" | "proximos-remates";
        const exclusive = applyExclusiveCommercialAssignment(prev, [itemKey], { lane }, prev.upcomingAuctions ?? []);
        return {
          ...prev,
          ...exclusive,
          sectionVehicleIds: {
            ...exclusive.sectionVehicleIds,
            [sectionId]: Array.from(current),
          },
        };
      }

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

  const toggleCategoryHidden = useCallback(
    (categoryKey: string, label: string) => {
      setConfig((prev) => {
        const set = new Set(prev.hiddenCategoryIds ?? []);
        const willHide = !set.has(categoryKey);
        if (willHide) set.add(categoryKey);
        else set.delete(categoryKey);
        if (categoryKey === "section:ventas-directas") {
          const defaultVentaDirectaAuctionKey = `auction:${DEFAULT_VENTA_DIRECTA_EVENT_ID}`;
          if (willHide) set.add(defaultVentaDirectaAuctionKey);
          else set.delete(defaultVentaDirectaAuctionKey);
        }
        if (categoryKey.startsWith("auction:") && !willHide) {
          const auctionId = categoryKey.slice("auction:".length);
          const auction = (prev.upcomingAuctions ?? []).find((entry) => entry.id === auctionId);
          if (auction && getAuctionEventType(auction) === "remate") {
            set.delete("section:proximos-remates");
          }
        }
        showSystemNotice(
          "success",
          willHide ? "Categoría oculta del home" : "Categoría visible en home",
          willHide
            ? `${label} quedó oculta del home sin eliminar vehículos.`
            : `${label} volvió a mostrarse en el home.`,
        );
        return { ...prev, hiddenCategoryIds: Array.from(set) };
      });
    },
    [showSystemNotice],
  );

  const resolveSoldCategory = useCallback(
    (
      vehicleKey: string,
      currentConfig: EditorConfig,
      context?: {
        auctionId?: string;
        auctionName?: string;
        soldCategory?: string;
      },
    ): string => {
      const explicit = context?.soldCategory?.trim();
      if (explicit) return explicit;

      if (
        context?.auctionId ||
        context?.auctionName ||
        Boolean(currentConfig.vehicleUpcomingAuctionIds[vehicleKey])
      ) {
        return "Remate";
      }

      if ((currentConfig.sectionVehicleIds["ventas-directas"] ?? []).includes(vehicleKey)) {
        return "Venta directa";
      }
      if ((currentConfig.sectionVehicleIds.novedades ?? []).includes(vehicleKey)) {
        return "Novedades";
      }
      if ((currentConfig.sectionVehicleIds.catalogo ?? []).includes(vehicleKey)) {
        return "Catálogo";
      }

      const managedCategory = (currentConfig.managedCategories ?? []).find((category) =>
        (category.vehicleIds ?? []).includes(vehicleKey),
      );
      if (managedCategory) {
        return managedCategory.name?.trim()
          ? `Categoría: ${managedCategory.name.trim()}`
          : "Categoría personalizada";
      }

      return "Sin categoría";
    },
    [],
  );

  const buildSoldVehicleRecord = useCallback(
    (
      item: CatalogItem,
      context?: {
        auctionId?: string;
        auctionName?: string;
        soldCategory?: string;
      },
    ): SoldVehicleRecord => ({
      vehicleKey: getVehicleKey(item),
      patent: getPatent(item),
      title: getModel(item),
      soldAt: new Date().toISOString(),
      soldCategory: context?.soldCategory,
      auctionId: context?.auctionId,
      auctionName: context?.auctionName,
    }),
    [],
  );

  const buildConfigAfterMarkSold = useCallback(
    (
      prev: EditorConfig,
      vehicleKey: string,
      item: CatalogItem,
      context?: {
        auctionId?: string;
        auctionName?: string;
        soldCategory?: string;
      },
    ): EditorConfig => {
      const soldRecord = buildSoldVehicleRecord(item, {
        ...context,
        soldCategory: resolveSoldCategory(vehicleKey, prev, context),
      });
      const soldSet = new Set(prev.soldVehicleIds ?? []);
      soldSet.add(vehicleKey);

      const hiddenSet = new Set(prev.hiddenVehicleIds ?? []);
      hiddenSet.add(vehicleKey);

      const nextAssignments = { ...prev.vehicleUpcomingAuctionIds };
      delete nextAssignments[vehicleKey];

      const nextSectionVehicleIds = {
        "proximos-remates": (prev.sectionVehicleIds["proximos-remates"] ?? []).filter(
          (id) => id !== vehicleKey,
        ),
        "ventas-directas": (prev.sectionVehicleIds["ventas-directas"] ?? []).filter(
          (id) => id !== vehicleKey,
        ),
        novedades: (prev.sectionVehicleIds.novedades ?? []).filter((id) => id !== vehicleKey),
        catalogo: (prev.sectionVehicleIds.catalogo ?? []).filter((id) => id !== vehicleKey),
      };

      const nextManagedCategories = (prev.managedCategories ?? []).map((category) => ({
        ...category,
        vehicleIds: (category.vehicleIds ?? []).filter((id) => id !== vehicleKey),
      }));

      const existingHistory = prev.soldVehicleHistory ?? [];
      const nextHistory = [soldRecord, ...existingHistory.filter((entry) => entry.vehicleKey !== vehicleKey)];

      return {
        ...prev,
        soldVehicleIds: Array.from(soldSet),
        soldVehicleHistory: nextHistory,
        hiddenVehicleIds: Array.from(hiddenSet),
        vehicleUpcomingAuctionIds: nextAssignments,
        sectionVehicleIds: nextSectionVehicleIds,
        managedCategories: nextManagedCategories,
      };
    },
    [buildSoldVehicleRecord, resolveSoldCategory],
  );

  const markVehicleAsSold = useCallback(
    (
      vehicleKey: string,
      context?: {
        auctionId?: string;
        auctionName?: string;
        soldCategory?: string;
      },
    ) => {
      const item = itemsByKey.get(vehicleKey);
      if (!item) return;
      let nextConfig: EditorConfig | null = null;
      setConfig((prev) => {
        nextConfig = buildConfigAfterMarkSold(prev, vehicleKey, item, context);
        return nextConfig;
      });
      if (isAdmin && nextConfig) {
        lastPersistedConfigRef.current = JSON.stringify(nextConfig);
        void persistEditorConfigRef.current(nextConfig);
      }
    },
    [buildConfigAfterMarkSold, isAdmin, itemsByKey],
  );

  const markVehiclesAsSoldBulk = useCallback(
    (
      vehicleKeys: string[],
      context?: {
        auctionId?: string;
        auctionName?: string;
        soldCategory?: string;
      },
    ) => {
      const uniqueKeys = Array.from(new Set(vehicleKeys)).filter(Boolean);
      if (uniqueKeys.length === 0) return 0;
      let nextConfig: EditorConfig | null = null;
      let markedCount = 0;
      setConfig((prev) => {
        let current = prev;
        for (const vehicleKey of uniqueKeys) {
          const item = itemsByKey.get(vehicleKey);
          if (!item) continue;
          current = buildConfigAfterMarkSold(current, vehicleKey, item, context);
          markedCount += 1;
        }
        nextConfig = current;
        return current;
      });
      if (isAdmin && nextConfig && markedCount > 0) {
        lastPersistedConfigRef.current = JSON.stringify(nextConfig);
        void persistEditorConfigRef.current(nextConfig);
      }
      return markedCount;
    },
    [buildConfigAfterMarkSold, isAdmin, itemsByKey],
  );

  const groupManageSoldContext = useMemo(() => {
    if (!groupManageTarget || groupManageTarget.type !== "auction") return undefined;
    const auction = sortedUpcomingAuctions.find((entry) => entry.id === groupManageTarget.auctionId);
    return {
      auctionId: groupManageTarget.auctionId,
      auctionName: auction?.name,
    };
  }, [groupManageTarget, sortedUpcomingAuctions]);

  const groupManageCommercialEventType = useMemo((): "remate" | "venta_directa" => {
    if (!groupManageTarget || groupManageTarget.type !== "auction") return "remate";
    const auction = sortedUpcomingAuctions.find((entry) => entry.id === groupManageTarget.auctionId);
    return getAuctionCommercialEventType(
      auction ?? { id: groupManageTarget.auctionId, name: "", date: "" },
    );
  }, [groupManageTarget, sortedUpcomingAuctions]);

  const toggleGroupManageVehicle = useCallback((vehicleKey: string) => {
    setGroupManageSelectedKeys((prev) =>
      prev.includes(vehicleKey)
        ? prev.filter((key) => key !== vehicleKey)
        : [...prev, vehicleKey],
    );
  }, []);

  const selectGroupManageFiltered = useCallback(() => {
    setGroupManageSelectedKeys((prev) =>
      Array.from(new Set([...prev, ...groupManageItems.map((item) => getVehicleKey(item))])),
    );
  }, [groupManageItems]);

  const selectGroupManagePatentsFromSearch = useCallback(
    (rawTerm: string) => {
      const tokens = extractPatentTokens(rawTerm).filter(isFullPatentToken);
      if (tokens.length < 2) return;
      const matchingKeys = groupManageBaseItems
        .filter((item) => {
          const patent = normalizePatentToken(getPatent(item));
          const key = normalizePatentToken(getVehicleKey(item));
          return tokens.some((token) => patent === token || key === token);
        })
        .map((item) => getVehicleKey(item));
      if (matchingKeys.length === 0) return;
      setGroupManageSelectedKeys((prev) => Array.from(new Set([...prev, ...matchingKeys])));
    },
    [groupManageBaseItems],
  );

  const revertVehicleSale = useCallback((vehicleKey: string) => {
    setConfig((prev) => {
      const soldSet = new Set(prev.soldVehicleIds ?? []);
      soldSet.delete(vehicleKey);

      const hiddenSet = new Set(prev.hiddenVehicleIds ?? []);
      hiddenSet.delete(vehicleKey);

      const manualPublications = (prev.manualPublications ?? []).map((entry) => {
        if (`manual-${entry.id}` !== vehicleKey) return entry;
        return { ...entry, visible: true };
      });

      return {
        ...prev,
        soldVehicleIds: Array.from(soldSet),
        soldVehicleHistory: (prev.soldVehicleHistory ?? []).filter(
          (entry) => entry.vehicleKey !== vehicleKey,
        ),
        hiddenVehicleIds: Array.from(hiddenSet),
        manualPublications,
      };
    });
  }, []);

  const setPrice = (itemKey: string, value: string) => {
    setConfig((prev) => {
      const nextVehiclePrices = { ...prev.vehiclePrices, [itemKey]: value };
      const nextManualPublications = (prev.manualPublications ?? []).map((entry) => {
        if (`manual-${entry.id}` !== itemKey) return entry;
        const promoEnabled = Boolean(entry.promoEnabled && (entry.promoPrice ?? "").trim());
        return {
          ...entry,
          price: value,
          promoPrice: promoEnabled ? value : entry.promoPrice,
        };
      });
      return {
        ...prev,
        vehiclePrices: nextVehiclePrices,
        manualPublications: nextManualPublications,
      };
    });
  };

  const updateVehiclePromoSettings = (
    itemKey: string,
    patch: Partial<Pick<EditorVehicleDetails, "originalPrice" | "promoPrice" | "promoEnabled">>,
  ) => {
    setConfig((prev) => {
      const nextDetails = { ...prev.vehicleDetails };
      const currentDetails = { ...(nextDetails[itemKey] ?? {}) };
      const nextPromoEnabled =
        typeof patch.promoEnabled === "boolean"
          ? patch.promoEnabled
          : typeof currentDetails.promoEnabled === "boolean"
            ? currentDetails.promoEnabled
            : false;
      const nextOriginalPriceRaw =
        typeof patch.originalPrice === "string"
          ? patch.originalPrice
          : (currentDetails.originalPrice ?? "");
      const nextPromoPriceRaw =
        typeof patch.promoPrice === "string" ? patch.promoPrice : (currentDetails.promoPrice ?? "");
      const nextOriginalPrice = nextOriginalPriceRaw.trim();
      const nextPromoPrice = nextPromoPriceRaw.trim();
      const activePrice = nextPromoEnabled && nextPromoPrice ? nextPromoPriceRaw : nextOriginalPriceRaw;

      currentDetails.originalPrice = nextOriginalPriceRaw;
      currentDetails.promoPrice = nextPromoPriceRaw;
      currentDetails.promoEnabled = nextPromoEnabled;
      nextDetails[itemKey] = currentDetails;

      const nextVehiclePrices = { ...prev.vehiclePrices, [itemKey]: activePrice };
      const nextManualPublications = (prev.manualPublications ?? []).map((entry) => {
        if (`manual-${entry.id}` !== itemKey) return entry;
        return {
          ...entry,
          originalPrice: nextOriginalPrice || undefined,
          promoPrice: nextPromoPrice || undefined,
          promoEnabled: nextPromoEnabled,
          price: activePrice,
        };
      });

      return {
        ...prev,
        vehicleDetails: nextDetails,
        vehiclePrices: nextVehiclePrices,
        manualPublications: nextManualPublications,
      };
    });
  };

  const setVehicleCategory = (itemKey: string, value: string) => {
    setConfig((prev) => {
      const nextDetails = { ...prev.vehicleDetails };
      const current = { ...(nextDetails[itemKey] ?? {}) };
      const normalized = normalizeVehicleCategoryValue(value);
      if (normalized) current.category = normalized;
      else delete current.category;
      if (Object.values(current).every((fieldValue) => !fieldValue)) {
        delete nextDetails[itemKey];
      } else {
        nextDetails[itemKey] = current;
      }
      return { ...prev, vehicleDetails: nextDetails };
    });
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
    value: string | boolean | HomeSectionOrderId[],
  ) => {
    setConfig((prev) => ({
      ...prev,
      homeLayout: {
        ...prev.homeLayout,
        [field]: value,
      },
    }));
  };

  const toggleHomeLayoutFlag = (
    field:
      | "showCommercialPanel"
      | "showHowToSection"
      | "showFavoritesSection"
      | "showRecentPublications"
      | "showSearchBar"
      | "showStickySearchBar"
      | "showQuickFilters"
      | "showSortSelector",
    checked: boolean,
  ) => {
    setHomeLayout(field, checked);
    if (field === "showSearchBar" && !checked) {
      setHomeSearchTerm("");
      setQuickFilters([]);
      setTopSectionFilter("all");
    }
    if (field === "showQuickFilters" && !checked) {
      setQuickFilters([]);
    }
  };

  const resetHomeLayoutToDefault = () => {
    setConfig((prev) => ({
      ...prev,
      homeLayout: {
        ...DEFAULT_EDITOR_CONFIG.homeLayout,
      },
    }));
    showSystemNotice(
      "info",
      "Layout restablecido",
      "Se restauró la configuración base del Home Layout.",
    );
  };

  const moveSectionOrder = (sectionId: HomeSectionOrderId, direction: "up" | "down") => {
    setConfig((prev) => {
      const order = [...resolvedHomeSectionOrder];
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

  const reorderHomeSectionOrder = useCallback(
    (fromSectionId: HomeSectionOrderId, toSectionId: HomeSectionOrderId) => {
      if (fromSectionId === toSectionId) return;
      setConfig((prev) => {
        const order = [...resolvedHomeSectionOrder];
        const fromIndex = order.indexOf(fromSectionId);
        const toIndex = order.indexOf(toSectionId);
        if (fromIndex < 0 || toIndex < 0) return prev;
        const [dragged] = order.splice(fromIndex, 1);
        order.splice(toIndex, 0, dragged);
        return {
          ...prev,
          homeLayout: {
            ...prev.homeLayout,
            sectionOrder: order,
          },
        };
      });
    },
    [resolvedHomeSectionOrder],
  );

  const createUpcomingAuction = (eventType: CommercialEventType) => {
    const name = newAuctionName.trim();
    const date = newAuctionDate.trim();
    const endDate = eventType === "venta_directa" ? (newAuctionEndDate.trim() || date) : date;
    const startAt = toChileIsoDateTime(date, newAuctionStartTime);
    const endAt = toChileIsoDateTime(endDate, newAuctionEndTime);
    if (!name || !date) {
      showSystemNotice("error", "Datos incompletos", "Debes completar nombre y fecha del remate.");
      return;
    }
    if (!startAt || !endAt) {
      showSystemNotice("error", "Horario inválido", "Debes ingresar hora de inicio y cierre válidas.");
      return;
    }
    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      showSystemNotice(
        "error",
        "Horario inválido",
        eventType === "venta_directa"
          ? "La fecha y hora de cierre deben ser posteriores al inicio."
          : "La hora de cierre debe ser posterior a la hora de inicio.",
      );
      return;
    }
    const id = crypto.randomUUID();
    setConfig((prev) => ({
      ...prev,
      upcomingAuctions: [...prev.upcomingAuctions, { id, name, date, startAt, endAt, eventType }],
    }));
    setNewAuctionName("");
    setNewAuctionDate("");
    setNewAuctionEndDate("");
    setNewAuctionStartTime("10:00");
    setNewAuctionEndTime("15:00");
    setNewAuctionEventType("remate");
  };

  const createManagedCategory = (openAssign = false) => {
    const name = newCategoryName.trim();
    const description = newCategoryDescription.trim();
    if (!name) {
      showSystemNotice("error", "Categoría", "Ingresa un nombre para la nueva categoría.");
      return;
    }
    const normalizedName = normalizeText(name);
    const exists = (config.managedCategories ?? []).some(
      (category) => normalizeText(category.name) === normalizedName,
    );
    if (exists) {
      showSystemNotice("error", "Categoría duplicada", "Ya existe una categoría con ese nombre.");
      return;
    }
    const next: ManagedCategory = {
      id: `cat-${crypto.randomUUID()}`,
      name,
      description: description || "Categoría personalizada",
      vehicleIds: [],
      visible: true,
    };
    setConfig((prev) => ({
      ...prev,
      managedCategories: [...(prev.managedCategories ?? []), next],
    }));
    if (openAssign) {
      setAssignCategoryId(next.id);
      setAssignSearchTerm("");
    }
    setNewCategoryName("");
    setNewCategoryDescription("");
    setShowCreateCategoryForm(false);
    showSystemNotice(
      "success",
      "Categoría creada",
      openAssign ? "Selecciona las unidades para esta categoría." : "Ahora puedes asignar vehículos.",
    );
  };

  const updateManagedCategory = (
    categoryId: string,
    patch: Partial<Pick<ManagedCategory, "name" | "description" | "visible">>,
  ) => {
    setConfig((prev) => ({
      ...prev,
      managedCategories: (prev.managedCategories ?? []).map((category) =>
        category.id === categoryId ? { ...category, ...patch } : category,
      ),
    }));
  };

  const deleteManagedCategory = (categoryId: string) => {
    setConfig((prev) => {
      const hidden = new Set(prev.hiddenCategoryIds ?? []);
      hidden.delete(managedCategoryKey(categoryId));
      return {
        ...prev,
        managedCategories: (prev.managedCategories ?? []).filter((category) => category.id !== categoryId),
        hiddenCategoryIds: Array.from(hidden),
      };
    });
    if (assignCategoryId === categoryId) setAssignCategoryId(null);
  };

  const toggleVehicleInManagedCategory = (categoryId: string, vehicleKey: string) => {
    setConfig((prev) => ({
      ...prev,
      managedCategories: (prev.managedCategories ?? []).map((category) => {
        if (category.id !== categoryId) return category;
        const set = new Set(category.vehicleIds ?? []);
        if (set.has(vehicleKey)) set.delete(vehicleKey);
        else set.add(vehicleKey);
        return { ...category, vehicleIds: Array.from(set) };
      }),
    }));
  };

  const toggleBatchAssignVehicle = (vehicleKey: string) => {
    setBatchAssignSelectedKeys((prev) => {
      if (prev.includes(vehicleKey)) return prev.filter((key) => key !== vehicleKey);
      return [...prev, vehicleKey];
    });
  };

  const openBatchAssignModal = (target: BatchAssignTarget, keepGroupManageOpen = false) => {
    if (!keepGroupManageOpen) setGroupManageTarget(null);
    setBatchAssignTarget(target);
    setBatchAssignSearchTerm("");
    setBatchAssignSelectedKeys([]);
    lastAutoImportPatentRef.current = "";
  };

  const mergeImportedVehicleDetails = (
    previous: EditorVehicleDetails | undefined,
    imported: EditorVehicleDetails,
  ): EditorVehicleDetails => {
    const manualPreserveKeys: Array<keyof EditorVehicleDetails> = [
      "extendedDescription",
      "description",
      "lot",
      "auctionDate",
      "location",
      "status",
      "vehicleCondition",
      "originalPrice",
      "precioMinimoRemate",
      "promoPrice",
      "promoEnabled",
      "lotDocumentsJson",
      "subtitle",
    ];
    const merged: EditorVehicleDetails = { ...imported };
    for (const key of manualPreserveKeys) {
      const previousValue = previous?.[key];
      const importedValue = imported[key];
      const importedEmpty =
        importedValue === undefined ||
        importedValue === null ||
        importedValue === "" ||
        importedValue === false;
      const previousPresent =
        previousValue !== undefined && previousValue !== null && previousValue !== "";
      if (importedEmpty && previousPresent) {
        Object.assign(merged, { [key]: previousValue });
      }
    }
    const prevThumb = previous?.thumbnail?.trim();
    const nextThumb = imported.thumbnail?.trim();
    if (nextThumb?.startsWith("http") && isGlo3dCatalogImageUrl(nextThumb)) {
      merged.thumbnail = nextThumb;
    } else if (prevThumb?.startsWith("http") && isGlo3dCatalogImageUrl(prevThumb)) {
      merged.thumbnail = prevThumb;
    } else if (nextThumb?.startsWith("http")) {
      merged.thumbnail = nextThumb;
    }
    if (imported.view3dUrl?.includes("glo3d")) {
      merged.view3dUrl = imported.view3dUrl;
    }
    return merged;
  };

  const applyImportedPatentPayload = useCallback(
    (payload: {
      item: CatalogItem;
      vehicleDetails?: EditorVehicleDetails;
      patente?: string;
      correctedPatente?: boolean;
      requestedPatente?: string;
      created?: boolean;
      hasGlo3dViewer?: boolean;
    }): { vehicleKey: string; nextConfig: EditorConfig } => {
      const vehicleKey = getVehicleKey(payload.item);
      const patentKey = normalizePatentToken(getPatent(payload.item));
      const importedVehicleDetails = payload.vehicleDetails;
      const mergedVehicleDetails = importedVehicleDetails
        ? mergeImportedVehicleDetails(
            configRef.current.vehicleDetails?.[vehicleKey] ??
              (patentKey ? configRef.current.vehicleDetails?.[patentKey] : undefined),
            importedVehicleDetails,
          )
        : undefined;
      const enrichedItem = mergedVehicleDetails
        ? applyCatalogDetailsOverride(payload.item, mergedVehicleDetails)
        : payload.item;
      setImportedInventoryItems((prev) => {
        const next = prev.filter((entry) => getVehicleKey(entry) !== vehicleKey);
        return [...next, enrichedItem];
      });
      setLiveFeedItems((prev) =>
        dedupeCatalogItemsByVehicleKey([
          ...prev.filter((entry) => getVehicleKey(entry) !== vehicleKey),
          enrichedItem,
        ]),
      );
      let nextConfig = configRef.current;
      if (importedVehicleDetails) {
        const priceSeed = importedVehicleDetails.originalPrice?.trim();
        const mergedDetails = mergeImportedVehicleDetails(
          configRef.current.vehicleDetails?.[vehicleKey] ??
            (patentKey ? configRef.current.vehicleDetails?.[patentKey] : undefined) ??
            (payload.item.id ? configRef.current.vehicleDetails?.[payload.item.id] : undefined),
          importedVehicleDetails,
        );
        nextConfig = {
          ...configRef.current,
          vehicleDetails: {
            ...configRef.current.vehicleDetails,
            [vehicleKey]: mergedDetails,
            ...(patentKey && patentKey !== vehicleKey ? { [patentKey]: mergedDetails } : {}),
            ...(payload.item.id && payload.item.id !== vehicleKey && payload.item.id !== patentKey
              ? { [payload.item.id]: mergedDetails }
              : {}),
          },
          ...(payload.created && priceSeed
            ? {
                vehiclePrices: {
                  ...configRef.current.vehiclePrices,
                  [vehicleKey]: priceSeed,
                },
              }
            : {}),
        };
        configRef.current = nextConfig;
        setConfig(nextConfig);
      }
      return { vehicleKey, nextConfig };
    },
    [],
  );

  const importPatentsForBatchAssign = async () => {
    const singlePatent = resolveAutoImportPatent(batchAssignSearchTerm);
    const patentTokens = (singlePatent ? [singlePatent] : extractPatentTokens(batchAssignSearchTerm)).slice(
      0,
      GLO3D_BATCH_IMPORT_MAX,
    );
    if (patentTokens.length === 0) {
      showSystemNotice("info", "Sin patente", "Ingresa al menos una patente válida (ej. TJSX32).");
      return;
    }

    const alreadyComplete = patentTokens.filter((patente) => {
      const local = items.find(
        (item) =>
          normalizePatentToken(getPatent(item)) === patente ||
          normalizePatentToken(getVehicleKey(item)) === patente,
      );
      return local
        ? vehicleHasCompleteAssignFicha(local, getVehicleKey(local), config)
        : false;
    });
    if (alreadyComplete.length === patentTokens.length) {
      const keys = patentTokens
        .map((patente) => {
          const local = items.find(
            (item) =>
              normalizePatentToken(getPatent(item)) === patente ||
              normalizePatentToken(getVehicleKey(item)) === patente,
          );
          return local ? getVehicleKey(local) : "";
        })
        .filter(Boolean);
      setBatchAssignSelectedKeys((prev) => Array.from(new Set([...prev, ...keys])));
      showSystemNotice(
        "info",
        "Ya en inventario",
        "La patente ya está cargada con ficha completa. Solo selecciónala y agrega al grupo.",
      );
      return;
    }

    setBatchAssignImporting(true);
    const importedKeys: string[] = [];
    try {
      for (let index = 0; index < patentTokens.length; index += 1) {
        const patente = patentTokens[index]!;
        const local = items.find(
          (item) =>
            normalizePatentToken(getPatent(item)) === patente ||
            normalizePatentToken(getVehicleKey(item)) === patente,
        );
        const { payload } = await importPatentWithRetries(patente, {
          syncMode: "tasaciones-first",
          forceRefresh: true,
          isNewUnit: !local,
          seedInventarioRow: local ? (local.raw as Record<string, unknown>) : undefined,
        });
        const { vehicleKey: key } = applyImportedPatentPayload({
          item: payload.item!,
          vehicleDetails: payload.vehicleDetails,
          patente: payload.patente ?? patente,
          created: payload.created,
          hasGlo3dViewer: payload.hasGlo3dViewer,
        });
        importedKeys.push(key);
        if (index + 1 < patentTokens.length) {
          await sleepMs(CATALOG_SYNC_PATENT_DELAY_MS);
        }
      }

      showSystemNotice(
        "success",
        "Importación lista",
        `${importedKeys.length} unidad(es) importada(s). Tasaciones primero; Glo3D/Autored solo si no existe en inventario compartido.`,
      );

      setBatchAssignSelectedKeys((prev) => Array.from(new Set([...prev, ...importedKeys])));
      lastAutoImportPatentRef.current = patentTokens[0] ?? "";
    } catch (error) {
      lastAutoImportPatentRef.current = "";
      const message =
        error instanceof DOMException && error.name === "TimeoutError"
          ? "Glo3D tardó demasiado. Se reintentará automáticamente en la próxima sync."
          : error instanceof Error
            ? error.message
            : "No se pudo importar la patente.";
      showSystemNotice(
        "error",
        isGlo3dRateLimitMessage(message) ? "Glo3D ocupado" : "Importación fallida",
        importedKeys.length > 0
          ? `${importedKeys.length} importada(s) antes del error. ${message}`
          : message,
      );
      if (importedKeys.length > 0) {
        setBatchAssignSelectedKeys((prev) => Array.from(new Set([...prev, ...importedKeys])));
      }
    } finally {
      setBatchAssignImporting(false);
    }
  };

  const closeBatchAssignModal = () => {
    setBatchAssignTarget(null);
    setBatchAssignSearchTerm("");
    setBatchAssignSelectedKeys([]);
    lastAutoImportPatentRef.current = "";
  };

  const openGroupManageModal = (target: GroupManageTarget) => {
    setGroupManageTarget(target);
    setGroupManageSearchTerm("");
    setGroupManageSelectedKeys([]);
    setGroupRainworxEventUrl("");
  };

  const closeGroupManageModal = () => {
    setGroupManageTarget(null);
    setGroupManageSearchTerm("");
    setGroupManageSelectedKeys([]);
    setGroupRainworxEventUrl("");
  };

  const removeVehicleFromGroupTarget = (vehicleKey: string) => {
    if (!groupManageTarget) return;
    if (groupManageTarget.type === "auction") {
      setConfig((prev) => {
        const nextAuctionMap = { ...prev.vehicleUpcomingAuctionIds };
        if (nextAuctionMap[vehicleKey] === groupManageTarget.auctionId) {
          delete nextAuctionMap[vehicleKey];
        }
        return { ...prev, vehicleUpcomingAuctionIds: nextAuctionMap };
      });
    } else {
      setConfig((prev) => ({
        ...prev,
        sectionVehicleIds: {
          ...prev.sectionVehicleIds,
          [groupManageTarget.sectionId]: (prev.sectionVehicleIds[groupManageTarget.sectionId] ?? []).filter(
            (key) => key !== vehicleKey,
          ),
        },
      }));
    }
  };

  const addBatchVehiclesToTarget = async () => {
    if (!batchAssignTarget) return;
    if (batchAssignSelectedKeys.length === 0) {
      showSystemNotice("info", "Sin selección", "Selecciona al menos un vehículo para agregar.");
      return;
    }
    const canonicalKeys = batchAssignSelectedKeys.map((vehicleKey) => {
      const direct = itemsByKey.get(vehicleKey);
      if (direct) return getVehicleKey(direct);
      const patent = normalizePatentToken(vehicleKey);
      const byPatent = items.find(
        (item) =>
          normalizePatentToken(getPatent(item)) === patent ||
          normalizePatentToken(getVehicleKey(item)) === patent,
      );
      return byPatent ? getVehicleKey(byPatent) : vehicleKey;
    });
    const uniqueKeys = Array.from(new Set(canonicalKeys));
    const estadoRetiro = resolveEstadoRetiroForBatchTarget(
      batchAssignTarget,
      sortedUpcomingAuctions,
    );

    const resolveBatchAssignItem = (vehicleKey: string): CatalogItem | undefined =>
      itemsByKey.get(vehicleKey) ??
      items.find(
        (item) =>
          normalizePatentToken(getPatent(item)) === normalizePatentToken(vehicleKey) ||
          normalizePatentToken(getVehicleKey(item)) === normalizePatentToken(vehicleKey),
      );

    const isVehicleAlreadyInBatchTarget = (vehicleKey: string): boolean => {
      if (batchAssignTarget.type === "auction") {
        return (configRef.current.vehicleUpcomingAuctionIds?.[vehicleKey] ?? "") === batchAssignTarget.auctionId;
      }
      return (configRef.current.sectionVehicleIds?.[batchAssignTarget.sectionId] ?? []).includes(
        vehicleKey,
      );
    };

    const persistAndNotifyBatchAssign = async (
      nextConfig: EditorConfig,
      successTitle: string,
      successBody: string,
    ) => {
      closeBatchAssignModal();
      if (groupManageTarget) {
        setGroupManageSearchTerm("");
      }
      setConfig(nextConfig);
      lastPersistedConfigRef.current = JSON.stringify(nextConfig);
      const persistResult = await persistEditorConfigRef.current(nextConfig);
      if (!persistResult.ok) {
        showSystemNotice(
          "error",
          "No se guardó en servidor",
          "Las unidades quedaron asignadas en este navegador, pero no se pudieron persistir ni sincronizar con Tasaciones.",
        );
        return;
      }
      const syncWarning =
        persistResult.syncOk === false || (persistResult.syncSkipped?.length ?? 0) > 0
          ? ` ${persistResult.syncSkipped?.slice(0, 2).join("; ") ?? "Revisa la sincronización con Tasaciones."}`
          : "";
      showSystemNotice("success", successTitle, `${successBody}${syncWarning}`);
    };

    setBatchAssignImporting(true);
    try {
      if (uniqueKeys.length > 0 && uniqueKeys.every(isVehicleAlreadyInBatchTarget)) {
        await persistAndNotifyBatchAssign(
          configRef.current,
          "Ya asignados",
          `Las unidades ya estaban en ${batchAssignTargetLabel}. Se re-sincronizó con Tasaciones/Subastas.`,
        );
        return;
      }

      const enrichedItems = new Map<string, CatalogItem>();
      const enrichedDetails: Record<string, EditorVehicleDetails> = {};
      const patentsToEnrich: string[] = [];

      for (const vehicleKey of uniqueKeys) {
        const patentSource = resolveBatchAssignItem(vehicleKey);
        if (!patentSource) continue;
        const patente = normalizePatentToken(getPatent(patentSource));
        if (patente && patente !== "—" && !patentsToEnrich.includes(patente)) {
          patentsToEnrich.push(patente);
        }
      }

      if (patentsToEnrich.length > 0) {
        try {
          if (patentsToEnrich.length > 1) {
            const batch = await importPatentsBatchWithRetries(patentsToEnrich, {
              estadoRetiro,
              syncMode: "tasaciones-first",
              forceRefresh: true,
            });
            for (const row of batch.results ?? []) {
              if (!row.item) continue;
              const patente = normalizePatentToken(row.patente ?? getPatent(row.item));
              const { vehicleKey: resolvedKey } = applyImportedPatentPayload({
                item: row.item,
                vehicleDetails: row.vehicleDetails,
                patente,
                hasGlo3dViewer: row.hasGlo3dViewer,
              });
              enrichedItems.set(resolvedKey, row.item);
              if (row.vehicleDetails) enrichedDetails[resolvedKey] = row.vehicleDetails;
            }
            if ((batch.errors ?? []).length > 0) {
              showSystemNotice(
                "info",
                "Sincronización parcial",
                `${(batch.results ?? []).length} ok · ${(batch.errors ?? []).length} con error al importar desde Tasaciones.`,
              );
            }
          } else {
            const patente = patentsToEnrich[0]!;
            const { payload } = await importPatentWithRetries(patente, {
              estadoRetiro,
              syncMode: "tasaciones-first",
              forceRefresh: true,
            });
            const { vehicleKey: resolvedKey } = applyImportedPatentPayload({
              item: payload.item!,
              vehicleDetails: payload.vehicleDetails,
              patente,
              hasGlo3dViewer: payload.hasGlo3dViewer,
            });
            enrichedItems.set(resolvedKey, payload.item!);
            if (payload.vehicleDetails) enrichedDetails[resolvedKey] = payload.vehicleDetails;
          }
        } catch (enrichError) {
          throw enrichError;
        }
      }

      const keysToAssign = Array.from(
        new Set([...uniqueKeys, ...Array.from(enrichedItems.keys())]),
      );

      const prev = configRef.current;
      const nextDetails = { ...prev.vehicleDetails };
      for (const [key, details] of Object.entries(enrichedDetails)) {
        nextDetails[key] = { ...(nextDetails[key] ?? {}), ...details };
      }
      const hiddenVehicleIds = (prev.hiddenVehicleIds ?? []).filter(
        (id) => !keysToAssign.includes(id),
      );
      const publicationUnblocked = clearPublicationBlocksForVehicleKeys(prev, keysToAssign);
      const base: EditorConfig = {
        ...prev,
        ...publicationUnblocked,
        vehicleDetails: nextDetails,
        hiddenVehicleIds,
      };

      let nextConfig: EditorConfig;
      if (batchAssignTarget.type === "auction") {
        const auction = sortedUpcomingAuctions.find((entry) => entry.id === batchAssignTarget.auctionId);
        const lane =
          getAuctionCommercialEventType(auction ?? { id: batchAssignTarget.auctionId, name: "", date: "" }) ===
          "venta_directa"
            ? "ventas-directas"
            : "proximos-remates";
        const exclusive = applyExclusiveCommercialAssignment(
          base,
          keysToAssign,
          { lane, auctionId: batchAssignTarget.auctionId },
          sortedUpcomingAuctions,
        );
        nextConfig = { ...base, ...exclusive };
      } else {
        const exclusive = applyExclusiveCommercialAssignment(
          base,
          keysToAssign,
          { lane: "ventas-directas" },
          sortedUpcomingAuctions,
        );
        nextConfig = { ...base, ...exclusive };
      }

      const enrichedCount = enrichedItems.size;
      await persistAndNotifyBatchAssign(
        nextConfig,
        "Unidades agregadas",
        enrichedCount > 0
          ? `${batchAssignSelectedKeys.length} vehículo(s) asignados a ${batchAssignTargetLabel} (${enrichedCount} actualizado(s) desde Autored/Glo3D) y sincronizados con Tasaciones/Subastas.`
          : `${batchAssignSelectedKeys.length} vehículo(s) asignados a ${batchAssignTargetLabel} y sincronizados con Tasaciones/Subastas.`,
      );
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === "TimeoutError"
          ? "La importación tardó demasiado. Espera unos segundos y vuelve a intentar."
          : error instanceof Error
            ? error.message
            : "No se pudieron agregar los vehículos seleccionados.";
      showSystemNotice(
        "error",
        message.includes("saturada") ? "Glo3D saturado" : "Agregado fallido",
        message,
      );
    } finally {
      setBatchAssignImporting(false);
    }
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

  const editingLotDocuments = useMemo(
    () => parseLotDocumentsJson(editingDetails?.lotDocumentsJson),
    [editingDetails?.lotDocumentsJson],
  );

  const setEditingLotDocuments = useCallback((nextDocs: LotDocumentLink[]) => {
    setEditingDetails((prev) => ({
      ...(prev ?? {}),
      lotDocumentsJson: nextDocs.length > 0 ? serializeLotDocumentsJson(nextDocs) : "",
    }));
  }, []);

  const uploadEditorDocuments = async (files: File[]) => {
    if (!editingVehicleKey) return;
    const validFiles = files.filter((file) => file.size > 0);
    if (validFiles.length === 0) {
      showSystemNotice("error", "Sin archivos", "Selecciona al menos un archivo para subir.");
      return;
    }
    setEditorDocumentUploading(true);
    try {
      const payload = new FormData();
      payload.set("subfolder", editingVehicleKey);
      for (const file of validFiles) {
        payload.append("files", file);
      }
      const response = await fetch("/api/admin/cloudinary-document-upload", {
        method: "POST",
        body: payload,
      });
      const body = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        documents?: LotDocumentLink[];
        error?: string;
      };
      if (!response.ok || !body.ok) {
        showSystemNotice(
          "error",
          "Error subiendo documentos",
          body.error ?? "No fue posible subir los archivos a Cloudinary.",
        );
        return;
      }
      const uploaded = body.documents ?? [];
      if (uploaded.length === 0) return;
      setEditingDetails((prev) => {
        const current = parseLotDocumentsJson(prev?.lotDocumentsJson);
        const merged = [...current, ...uploaded];
        return {
          ...(prev ?? {}),
          lotDocumentsJson: serializeLotDocumentsJson(merged),
        };
      });
      showSystemNotice(
        "success",
        "Documentos cargados",
        `${uploaded.length} archivo(s) subido(s) a Cloudinary.`,
      );
    } finally {
      setEditorDocumentUploading(false);
      if (editorDocumentFileInputRef.current) editorDocumentFileInputRef.current.value = "";
    }
  };

  const handleEditorDocumentDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setEditorDocumentDropActive(false);
    const dropped = Array.from(event.dataTransfer.files ?? []);
    if (dropped.length === 0) return;
    await uploadEditorDocuments(dropped);
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
      manualDraft.sectionIds.length > 0 ? manualDraft.sectionIds : ["ventas-directas"];
    const normalizedNormalPrice = cleanOptional(manualDraft.normalPrice);
    const normalizedPromoPrice = cleanOptional(manualDraft.promoPrice);
    if (manualDraft.promoEnabled && !normalizedPromoPrice) {
      showSystemNotice(
        "error",
        "Precio promocional",
        "Activa un precio de oferta antes de crear la publicación.",
      );
      return;
    }
    const promoEnabled = Boolean(manualDraft.promoEnabled && normalizedPromoPrice);
    const activePrice = promoEnabled ? normalizedPromoPrice : normalizedNormalPrice;

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
      view3dUrl: cleanOptional(normalizeGlo3dViewerInput(manualDraft.view3dUrl)),
      sectionIds,
      upcomingAuctionId: cleanOptional(manualDraft.upcomingAuctionId),
      visible: manualDraft.visible,
      price: activePrice,
      originalPrice: normalizedNormalPrice,
      promoPrice: normalizedPromoPrice,
      promoEnabled,
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
    deletedAuctionIdsRef.current.add(auctionId);
    setConfig((prev) => {
      const nextAssignments = { ...prev.vehicleUpcomingAuctionIds };
      const removedVehicleKeys = new Set<string>();
      for (const [vehicleKey, value] of Object.entries(nextAssignments)) {
        if (value === auctionId) {
          delete nextAssignments[vehicleKey];
          removedVehicleKeys.add(vehicleKey);
        }
      }
      const assignedVehicleKeys = new Set(
        Object.entries(nextAssignments)
          .filter(([, value]) => value)
          .map(([vehicleKey]) => vehicleKey),
      );
      const hidden = new Set(prev.hiddenCategoryIds ?? []);
      hidden.delete(auctionCategoryKey(auctionId));
      const removedAuction = (prev.upcomingAuctions ?? []).find((auction) => auction.id === auctionId);
      const isVentaDirectaAuction = (removedAuction?.eventType ?? "remate") === "venta_directa";
      return {
        ...prev,
        upcomingAuctions: prev.upcomingAuctions.filter((auction) => auction.id !== auctionId),
        vehicleUpcomingAuctionIds: nextAssignments,
        hiddenCategoryIds: Array.from(hidden),
        sectionVehicleIds: {
          ...prev.sectionVehicleIds,
          "proximos-remates": (prev.sectionVehicleIds["proximos-remates"] ?? []).filter((key) =>
            assignedVehicleKeys.has(key),
          ),
          "ventas-directas": isVentaDirectaAuction
            ? (prev.sectionVehicleIds["ventas-directas"] ?? []).filter((key) => !removedVehicleKeys.has(key))
            : (prev.sectionVehicleIds["ventas-directas"] ?? []),
        },
      };
    });
  };

  const clearVentaDirectaInventoryGroup = useCallback(() => {
    setConfig((prev) => {
      const keysToClear = new Set(ventaDirectaInventoryOnlyKeys);
      if (keysToClear.size === 0) return prev;
      const ventaDirectaAuctionIds = new Set(
        (prev.upcomingAuctions ?? [])
          .filter((auction) => (auction.eventType ?? "remate") === "venta_directa")
          .map((auction) => auction.id),
      );
      const nextAssignments = { ...prev.vehicleUpcomingAuctionIds };
      for (const key of keysToClear) {
        const assignedId = nextAssignments[key];
        if (!assignedId || !ventaDirectaAuctionIds.has(assignedId)) {
          delete nextAssignments[key];
        }
      }
      return {
        ...prev,
        sectionVehicleIds: {
          ...prev.sectionVehicleIds,
          "ventas-directas": (prev.sectionVehicleIds["ventas-directas"] ?? []).filter(
            (key) => !keysToClear.has(key),
          ),
        },
        vehicleUpcomingAuctionIds: nextAssignments,
      };
    });
    showSystemNotice(
      "success",
      "Grupo limpiado",
      "Se quitaron las asignaciones manuales de venta directa de inventario.",
    );
  }, [ventaDirectaInventoryOnlyKeys, showSystemNotice]);

  const finalizeUpcomingAuction = useCallback(
    (auctionId: string, soldVehicleKeys: string[]) => {
      const isDefaultVentaDirectaInventory = auctionId === DEFAULT_VENTA_DIRECTA_EVENT_ID;
      const auction = (config.upcomingAuctions ?? []).find((entry) => entry.id === auctionId);
      const assignedNow = isDefaultVentaDirectaInventory
        ? ventaDirectaInventoryOnlyKeys
        : Object.entries(config.vehicleUpcomingAuctionIds ?? {})
            .filter(([, value]) => value === auctionId)
            .map(([vehicleKey]) => vehicleKey);
      const soldNowCount = assignedNow.filter((vehicleKey) => soldVehicleKeys.includes(vehicleKey)).length;
      const unsoldNowCount = Math.max(0, assignedNow.length - soldNowCount);
      const soldSetInput = new Set(soldVehicleKeys);
      const isVentaDirectaEvent =
        isDefaultVentaDirectaInventory || (auction?.eventType ?? "remate") === "venta_directa";
      setConfig((prev) => {
        const assignedVehicleKeys = isDefaultVentaDirectaInventory
          ? ventaDirectaInventoryOnlyKeys
          : Object.entries(prev.vehicleUpcomingAuctionIds)
              .filter(([, value]) => value === auctionId)
              .map(([vehicleKey]) => vehicleKey);
        const assignedSet = new Set(assignedVehicleKeys);
        const validSoldKeys = assignedVehicleKeys.filter((vehicleKey) => soldSetInput.has(vehicleKey));
        const unsoldKeys = assignedVehicleKeys.filter((vehicleKey) => !soldSetInput.has(vehicleKey));

        const soldSet = new Set(prev.soldVehicleIds ?? []);
        const hiddenSet = new Set(prev.hiddenVehicleIds ?? []);
        const nextAssignments = { ...prev.vehicleUpcomingAuctionIds };
        const nextHistory = [...(prev.soldVehicleHistory ?? [])];
        const resolvedAuctionName =
          auction?.name ??
          (isDefaultVentaDirectaInventory ? DEFAULT_VENTA_DIRECTA_EVENT_NAME : "Remate finalizado");

        for (const vehicleKey of validSoldKeys) {
          soldSet.add(vehicleKey);
          hiddenSet.add(vehicleKey);
          delete nextAssignments[vehicleKey];
          const item = itemsByKey.get(vehicleKey);
          if (item) {
            const soldRecord = buildSoldVehicleRecord(item, {
              auctionId,
              auctionName: resolvedAuctionName,
              soldCategory: isVentaDirectaEvent ? "Venta directa" : "Remate",
            });
            nextHistory.unshift(soldRecord);
          }
        }

        for (const vehicleKey of unsoldKeys) {
          hiddenSet.add(vehicleKey);
          delete nextAssignments[vehicleKey];
        }

        const uniqueHistory = nextHistory.filter(
          (entry, index, list) =>
            list.findIndex((candidate) => candidate.vehicleKey === entry.vehicleKey) === index,
        );
        const shouldRemoveAuction =
          !isDefaultVentaDirectaInventory &&
          (prev.upcomingAuctions ?? []).some((entry) => entry.id === auctionId);

        return {
          ...prev,
          upcomingAuctions: shouldRemoveAuction
            ? prev.upcomingAuctions.filter((entry) => entry.id !== auctionId)
            : prev.upcomingAuctions,
          soldVehicleIds: Array.from(soldSet),
          soldVehicleHistory: uniqueHistory,
          hiddenVehicleIds: Array.from(hiddenSet),
          vehicleUpcomingAuctionIds: nextAssignments,
          sectionVehicleIds: {
            "proximos-remates": (prev.sectionVehicleIds["proximos-remates"] ?? []).filter(
              (key) => !assignedSet.has(key),
            ),
            "ventas-directas": (prev.sectionVehicleIds["ventas-directas"] ?? []).filter(
              (key) => !assignedSet.has(key),
            ),
            novedades: prev.sectionVehicleIds.novedades ?? [],
            catalogo: prev.sectionVehicleIds.catalogo ?? [],
          },
        };
      });
      setFinalizeAuctionId(null);
      setFinalizeAuctionSearchTerm("");
      setFinalizeSoldVehicleKeys([]);
      showSystemNotice(
        "success",
        isVentaDirectaEvent ? "Venta directa finalizada" : "Remate finalizado",
        `${soldNowCount} unidad(es) vendidas y ${unsoldNowCount} unidad(es) ocultas sin venta.`,
      );
    },
    [
      buildSoldVehicleRecord,
      config.upcomingAuctions,
      config.vehicleUpcomingAuctionIds,
      itemsByKey,
      showSystemNotice,
      ventaDirectaInventoryOnlyKeys,
    ],
  );

  const assignVehicleToUpcomingAuction = (itemKey: string, auctionId: string) => {
    setConfig((prev) => {
      if (!auctionId) {
        const nextAssignments = { ...prev.vehicleUpcomingAuctionIds };
        delete nextAssignments[itemKey];
        const sectionSet = new Set(prev.sectionVehicleIds["proximos-remates"] ?? []);
        sectionSet.delete(itemKey);
        return {
          ...prev,
          vehicleUpcomingAuctionIds: nextAssignments,
          sectionVehicleIds: {
            ...prev.sectionVehicleIds,
            "proximos-remates": Array.from(sectionSet),
          },
        };
      }

      const auction = (prev.upcomingAuctions ?? []).find((entry) => entry.id === auctionId);
      const lane =
        getAuctionCommercialEventType(auction ?? { id: auctionId, name: "", date: "" }) === "venta_directa"
          ? "ventas-directas"
          : "proximos-remates";
      const exclusive = applyExclusiveCommercialAssignment(
        prev,
        [itemKey],
        { lane, auctionId },
        prev.upcomingAuctions ?? [],
      );
      return {
        ...prev,
        ...exclusive,
      };
    });
  };

  const openDetailsEditor = (item: CatalogItem) => {
    setGroupManageTarget(null);
    setManagingVehicleKey(null);
    const key = getVehicleKey(item);
    setEditingVehicleKey(key);
    setEditingDetails(
      mergeSyncedVehicleDetails(
        item,
        getEditorOverrideForItem(item, config.vehicleDetails),
      ),
    );
    setDetailEditorTab("general");
    setDetailRainworxUrl("");
  };

  const saveDetailsEditor = () => {
    if (!editingVehicleKey || !editingDetails) return;
    if (Object.keys(blockingValidationErrors).length > 0) {
      showSystemNotice(
        "error",
        "Campos inválidos",
        "Corrige los campos marcados en rojo antes de guardar.",
      );
      return;
    }
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
    setDetailRainworxUrl("");
  };

  const persistEditorConfig = useCallback(async (nextConfig: EditorConfig) => {
    setSaving(true);
    setAutoSaveState("saving");
    localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify(nextConfig));

    let response: Response | null = null;
    let payload: {
      config?: EditorConfig;
      syncOk?: boolean;
      sync?: { remateItemsUpserted?: number; skipped?: string[] };
      error?: string;
    } = {};

    for (let attempt = 0; attempt < 2; attempt += 1) {
      response = await fetch("/api/admin/editor-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: nextConfig,
          deletedAuctionIds: Array.from(deletedAuctionIdsRef.current),
        }),
      });
      payload = (await response.json().catch(() => ({}))) as typeof payload;
      if (response.ok) break;
      if (attempt === 0) await sleepMs(800);
    }

    if (!response) {
      setSaving(false);
      setAutoSaveState("error");
      return { ok: false };
    }
    setSaving(false);
    if (!response.ok) {
      setAutoSaveState("error");
      showSystemNotice(
        "info",
        "Guardado local activo",
        "Los cambios se guardaron en este navegador. El guardado central en servidor está temporalmente no disponible.",
      );
      if (payload.syncOk === false) {
        showSystemNotice(
          "info",
          "Sincronización pendiente",
          payload.error ?? "La configuración se guardó, pero la sincronización compartida falló.",
        );
      }
      return { ok: false, syncOk: payload.syncOk };
    }
    setAutoSaveState("saved");
    deletedAuctionIdsRef.current.clear();
    setLastAutoSaveAt(new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }));
    const configPersistida = payload.config
      ? mergeEditorConfigAfterServerPersist(
          nextConfig,
          normalizeEditorConfigClient(payload.config),
        )
      : nextConfig;
    lastPersistedConfigRef.current = JSON.stringify(configPersistida);
    setConfig(configPersistida);
    localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify(configPersistida));
    const syncSkipped = payload.sync?.skipped ?? [];
    if (payload.syncOk === false) {
      showSystemNotice(
        "info",
        "Sincronización pendiente",
        payload.error ?? "La configuración se guardó, pero la sincronización compartida quedó pendiente.",
      );
    }
    return { ok: true, syncOk: payload.syncOk !== false, syncSkipped };
  }, [showSystemNotice]);

  persistEditorConfigRef.current = persistEditorConfig;

  useEffect(() => {
    if (isBootstrapping || !isAdmin) return;
    if (groupSyncInProgressRef.current) return;
    const serializedConfig = JSON.stringify(config);
    if (!autoSaveReadyRef.current) {
      autoSaveReadyRef.current = true;
      lastPersistedConfigRef.current = serializedConfig;
      return;
    }
    if (serializedConfig === lastPersistedConfigRef.current) return;
    const timeout = window.setTimeout(() => {
      void persistEditorConfig(config);
    }, 550);
    return () => window.clearTimeout(timeout);
  }, [adminView, config, isAdmin, isBootstrapping, persistEditorConfig]);

  const refreshInventoryAndSync = useCallback(async () => {
    setRevalidating(true);
    try {
      const response = await fetch("/api/admin/refresh-inventory", { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        items?: CatalogItem[];
        itemCount?: number;
        source?: string;
        config?: EditorConfig;
        syncStatus?: {
          checkedAt: string;
          remateAuctions: number;
          ventaDirectaAuctions: number;
          ventaDirectaCatalog: {
            present: boolean;
            vehicleCount: number;
            sharedItemsCount?: number;
            needsReconcile?: boolean;
          };
        };
      };
      if (!response.ok || !payload.ok || !payload.items) {
        throw new Error(payload.error ?? `Error HTTP ${response.status}`);
      }
      setLiveFeedItems(payload.items);
      setImportedInventoryItems([]);
      lastAutoImportPatentRef.current = "";
      if (payload.config) applyMergedAdminConfig(payload.config);
      if (payload.syncStatus) setSharedSyncStatus(payload.syncStatus);
      router.refresh();
      const vd = payload.syncStatus?.ventaDirectaCatalog;
      showSystemNotice(
        "success",
        "Inventario actualizado",
        `${payload.itemCount ?? payload.items.length} unidades · VD ${vd?.vehicleCount ?? 0} editor · ${vd?.sharedItemsCount ?? 0} Supabase.`,
      );
    } catch (error) {
      showSystemNotice(
        "error",
        "Error al actualizar",
        error instanceof Error ? error.message : "No se pudo actualizar inventario y sincronizar.",
      );
    } finally {
      setRevalidating(false);
    }
  }, [applyMergedAdminConfig, router, showSystemNotice]);

  const adminInventorySyncBusy = revalidating;

  const runAdminInventoryAndSync = useCallback(async () => {
    if (adminInventorySyncBusy) return;
    await refreshInventoryAndSync();
  }, [adminInventorySyncBusy, refreshInventoryAndSync]);

  const persistVehicleSyncSnapshot = useCallback(
    async (opts: {
      patente: string;
      vehicleKey: string;
      itemId?: string;
      vehicleDetails: EditorVehicleDetails;
      nextConfig: EditorConfig;
    }) => {
      const response = await fetch("/api/admin/vehicle-sync-persist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patente: opts.patente,
          vehicleKey: opts.vehicleKey,
          itemId: opts.itemId,
          vehicleDetails: opts.vehicleDetails,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        persistedAt?: string;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? `No se pudo guardar la sync de ${opts.patente}.`);
      }
      const patched = patchEditorConfigVehicleDetails(
        opts.nextConfig,
        opts.patente,
        opts.vehicleDetails,
        { vehicleKey: opts.vehicleKey, itemId: opts.itemId },
      );
      lastPersistedConfigRef.current = JSON.stringify(patched);
      configRef.current = patched;
      setConfig(patched);
      localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify(patched));
      return payload.persistedAt;
    },
    [],
  );

  const runPatentInventorySync = useCallback(
    async (
      vehicleKey: string,
      options?: {
        persistEditor?: boolean;
        updateEditingForm?: boolean;
        internalOnly?: boolean;
      },
    ) => {
      const currentItem = itemsByKey.get(vehicleKey);
      if (!currentItem) {
        throw new Error("No se pudo localizar la unidad en inventario.");
      }
      if (vehicleKey.startsWith("manual-")) {
        throw new Error("Las unidades manuales no se sincronizan con Tasaciones.");
      }

      const patente = normalizePatentToken(getPatent(currentItem));
      if (!patente || patente === "—") {
        throw new Error("Esta unidad no tiene patente para sincronizar.");
      }

      const estadoRetiro = resolveEstadoRetiroForVehicleKey(
        vehicleKey,
        config,
        sortedUpcomingAuctions,
      );
      const { payload } = await importPatentWithRetries(patente, {
        estadoRetiro,
        syncMode: "tasaciones-first",
        forceRefresh: true,
        internalOnly: options?.internalOnly !== false,
        seedInventarioRow: currentItem.raw as Record<string, unknown>,
      });

      const { vehicleKey: resolvedKey, nextConfig } = applyImportedPatentPayload({
        item: payload.item!,
        vehicleDetails: payload.vehicleDetails,
        patente,
        hasGlo3dViewer: payload.hasGlo3dViewer,
      });

      if (managingVehicleKey === vehicleKey && resolvedKey !== vehicleKey) {
        setManagingVehicleKey(resolvedKey);
      }

      if (
        options?.updateEditingForm !== false &&
        editingVehicleKey &&
        (editingVehicleKey === vehicleKey || editingVehicleKey === resolvedKey)
      ) {
        const syncedItem = applyCatalogDetailsOverride(payload.item!, payload.vehicleDetails);
        setEditingVehicleKey(resolvedKey);
        setEditingDetails(mergeSyncedVehicleDetails(syncedItem, payload.vehicleDetails));
      }

      if (options?.persistEditor !== false) {
        const detailsToSave =
          payload.vehicleDetails ??
          nextConfig.vehicleDetails?.[resolvedKey] ??
          nextConfig.vehicleDetails?.[patente];
        if (detailsToSave) {
          await persistVehicleSyncSnapshot({
            patente,
            vehicleKey: resolvedKey,
            itemId: payload.item?.id,
            vehicleDetails: detailsToSave,
            nextConfig,
          });
        } else {
          lastPersistedConfigRef.current = JSON.stringify(nextConfig);
          await persistEditorConfigRef.current(nextConfig);
        }
      }

      return { payload, patente, resolvedKey, vehicleKey, nextConfig };
    },
    [
      applyImportedPatentPayload,
      editingVehicleKey,
      itemsByKey,
      managingVehicleKey,
      persistVehicleSyncSnapshot,
      sortedUpcomingAuctions,
    ],
  );

  const syncVehicleWithGlo3dAutored = useCallback(
    async (vehicleKey: string) => {
      if (itemsByKey.get(vehicleKey)?.id && vehicleKey.startsWith("manual-")) {
        showSystemNotice(
          "info",
          "Solo inventario Glo3D",
          "Las unidades manuales no se sincronizan con Glo3D/Autored.",
        );
        return;
      }
      if (!itemsByKey.get(vehicleKey)) {
        showSystemNotice("error", "Unidad no encontrada", "No se pudo localizar la unidad en inventario.");
        return;
      }

      setSyncingVehicleKey(vehicleKey);
      let resolvedKey = vehicleKey;
      try {
        const result = await runPatentInventorySync(vehicleKey);
        resolvedKey = result.resolvedKey;
        const { payload, patente } = result;

        const tasacionesNote = payload.syncDiagnostics?.tasacionesFound
          ? payload.syncDiagnostics.usedExternalApis
            ? " Unidad nueva importada con APIs externas."
            : " Importado desde el sistema interno."
          : " Sin registro en el sistema interno — completa la ficha allí o usa «Agregar unidades».";
        const autoredNote = payload.autoredSynced
          ? " Autored aplicado."
          : payload.autoredReason === "not_configured"
            ? " Autored no está configurado: agrega AUTORED_API_EMAIL y AUTORED_API_PASSWORD en Vercel."
            : payload.autoredReason === "no_record"
              ? " Tasaciones/Autored no tienen ficha para esta patente."
              : " Autored respondió sin marca/modelo útiles para esta patente.";
        const diagNote =
          payload.syncDiagnostics?.warnings.length && !payload.syncDiagnostics.syncComplete
            ? ` ${payload.syncDiagnostics.warnings.join(" ")}`
            : "";
        const glo3dNote = payload.hasGlo3dViewer
          ? payload.syncDiagnostics?.thumbnailSource === "glo3d"
            ? " Visor 3D + miniatura Glo3D."
            : " Visor 3D OK; miniatura aún sin Glo3D."
          : !payload.item!.thumbnail && !(payload.item!.images?.length ?? 0)
            ? " Sin miniatura Glo3D: revisa la patente en Glo3D o pega fotos en Editar ficha."
            : "";
        showSystemNotice(
          payload.syncDiagnostics?.syncComplete === false || !payload.autoredSynced ? "info" : "success",
          payload.syncDiagnostics?.syncComplete === false
            ? "Sincronización incompleta"
            : payload.autoredSynced
              ? "Unidad sincronizada"
              : "Sincronización parcial",
          `${patente} actualizado.${tasacionesNote}${glo3dNote}${autoredNote}${diagNote}`,
        );
      } catch (error) {
        const message =
          error instanceof DOMException && error.name === "TimeoutError"
            ? "La sincronización tardó demasiado. Se reintentará en la próxima sync."
            : error instanceof Error
              ? error.message
              : "No se pudo sincronizar la unidad.";
        showSystemNotice(
          "error",
          isGlo3dRateLimitMessage(message) ? "Glo3D ocupado" : "Sincronización fallida",
          message,
        );
      } finally {
        setSyncingVehicleKey((current) =>
          current === vehicleKey || current === resolvedKey ? null : current,
        );
      }
    },
    [itemsByKey, runPatentInventorySync, showSystemNotice],
  );

  const loadTasacionesInventoryIntoEditor = useCallback(async () => {
    if (!editingVehicleKey) return;
    if (editingVehicleKey.startsWith("manual-")) {
      showSystemNotice("info", "Sin Tasaciones", "Las unidades manuales no tienen inventario compartido.");
      return;
    }
    if (!itemsByKey.get(editingVehicleKey)) {
      showSystemNotice("error", "Unidad no encontrada", "No se pudo localizar la unidad en inventario.");
      return;
    }

    setLoadingTasacionesMedia(true);
    setSyncingVehicleKey(editingVehicleKey);
    let resolvedKey = editingVehicleKey;
    try {
      const result = await runPatentInventorySync(editingVehicleKey, {
        updateEditingForm: true,
        persistEditor: true,
        internalOnly: true,
      });
      resolvedKey = result.resolvedKey;
      const { payload, patente } = result;
      const mediaNote = payload.hasGlo3dViewer
        ? payload.syncDiagnostics?.thumbnailSource === "glo3d"
          ? "Visor 3D, miniatura y galería cargados desde el sistema interno."
          : "Visor 3D cargado; revisa fotos en el sistema interno (pestaña Fotos)."
        : payload.item?.thumbnail || (payload.item?.images?.length ?? 0) > 0
          ? "Fotos cargadas desde el sistema interno."
          : "El sistema interno no devolvió medios para esta patente. Verifica que exista en inventario interno.";
      showSystemNotice(
        payload.syncDiagnostics?.syncComplete === false || !payload.syncDiagnostics?.tasacionesFound
          ? "info"
          : "success",
        payload.syncDiagnostics?.tasacionesFound ? "Inventario del sistema interno cargado" : "Sin datos en el sistema interno",
        `${patente}: ${mediaNote}`,
      );
    } catch (error) {
      showSystemNotice(
        "error",
        "No se pudo cargar desde el sistema interno",
        error instanceof Error ? error.message : "Error desconocido al consultar inventario.",
      );
    } finally {
      setLoadingTasacionesMedia(false);
      setSyncingVehicleKey((current) =>
        current === editingVehicleKey || current === resolvedKey ? null : current,
      );
    }
  }, [editingVehicleKey, itemsByKey, runPatentInventorySync, showSystemNotice]);

  const showPatentDiagnosis = useCallback(
    async (rawPatente: string) => {
      const patente = normalizePatentToken(rawPatente);
      if (!patente || patente === "—") return;
      try {
        const response = await fetch(
          `/api/admin/diagnose-patent?patente=${encodeURIComponent(patente)}`,
          { cache: "no-store" },
        );
        const data = (await response.json()) as {
          ok?: boolean;
          error?: string;
          diagnosis?: {
            tasaciones: { found: boolean; complete: boolean; missing: string[]; marca?: string; modelo?: string };
            glo3d: { found: boolean; source: string; imageCount: number; view3dUrl?: string };
            autored: { found: boolean; source: string; marca?: string; modelo?: string; imageCount: number };
            merge: { thumbnailSource: string };
            warnings: string[];
            recommendation: string;
          };
        };
        if (!response.ok || !data.ok || !data.diagnosis) {
          throw new Error(data.error ?? "No se pudo diagnosticar.");
        }
        const d = data.diagnosis;
        const body = [
          `Tasaciones: ${d.tasaciones.found ? (d.tasaciones.complete ? "ficha completa" : `incompleta (${d.tasaciones.missing.join(", ")})`) : "NO encontrada"}`,
          `Glo3D (${d.glo3d.source}): ${d.glo3d.found ? `${d.glo3d.imageCount} img, visor ${d.glo3d.view3dUrl ? "OK" : "ausente"}` : "NO"}`,
          `Autored (${d.autored.source}): ${d.autored.found ? `${d.autored.marca ?? "?"} ${d.autored.modelo ?? ""}`.trim() : "sin ficha"}`,
          `Miniatura: ${d.merge.thumbnailSource}`,
          ...d.warnings,
          d.recommendation,
        ]
          .filter(Boolean)
          .join("\n");
        showSystemNotice(d.warnings.length > 0 ? "info" : "success", `Diagnóstico ${patente}`, body);
      } catch (error) {
        showSystemNotice(
          "error",
          "Diagnóstico fallido",
          error instanceof Error ? error.message : "Error desconocido",
        );
      }
    },
    [showSystemNotice],
  );

  const syncAllGroupVehicles = useCallback(async () => {
    if (groupSyncAllState?.running || syncingVehicleKey) return;

    const targets = groupManageBaseItems
      .map((item) => {
        const key = getVehicleKey(item);
        if (key.startsWith("manual-")) return null;
        const patente = normalizePatentToken(getPatent(item));
        if (!patente || patente === "—") return null;
        return { key, patente };
      })
      .filter((entry): entry is { key: string; patente: string } => Boolean(entry));

    if (targets.length === 0) {
      showSystemNotice("info", "Sin unidades", "No hay patentes sincronizables en este grupo.");
      return;
    }

    setGroupSyncAllState({ running: true, current: 0, total: targets.length });
    groupSyncInProgressRef.current = true;
    let okCount = 0;
    let processed = 0;
    let appliedCount = 0;
    let latestConfig = configRef.current;
    const failed: string[] = [];
    const incomplete: string[] = [];

    try {
      for (const target of targets) {
        setGroupSyncAllState({
          running: true,
          current: processed,
          total: targets.length,
          patente: target.patente,
        });

        try {
          const result = await runPatentInventorySync(target.key, {
            persistEditor: true,
            updateEditingForm: false,
            internalOnly: true,
          });
          latestConfig = result.nextConfig;
          appliedCount += 1;
          if (result.payload.syncDiagnostics?.syncComplete === false) {
            incomplete.push(
              `${target.patente}: ${result.payload.syncDiagnostics?.warnings[0] ?? "ficha incompleta en el sistema interno"}`,
            );
          } else {
            okCount += 1;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Error desconocido";
          failed.push(`${target.patente}: ${message}`);
        }

        processed += 1;
        setGroupSyncAllState({
          running: true,
          current: processed,
          total: targets.length,
          patente: target.patente,
        });

        if (processed < targets.length) {
          await sleepMs(CATALOG_SYNC_PATENT_DELAY_MS);
        }
      }

      if (failed.length === 0 && incomplete.length === 0) {
        showSystemNotice(
          "success",
          "Grupo sincronizado",
          `${okCount} unidad(es) actualizadas desde el sistema interno.`,
        );
      } else {
        const incompleteNote =
          incomplete.length > 0
            ? ` ${incomplete.length} incompleta(s): ${incomplete.slice(0, 3).join(" · ")}${
                incomplete.length > 3 ? "… (clic en Sin sync → diagnóstico)" : ""
              }`
            : "";
        showSystemNotice(
          okCount > 0 ? "info" : "error",
          okCount > 0 ? "Sincronización parcial" : "Sincronización fallida",
          `${okCount} ok · ${failed.length} error(es) · ${incomplete.length} incompleta(s).${incompleteNote}${
            failed.length > 0
              ? ` Errores: ${failed.slice(0, 2).join(" · ")}${failed.length > 2 ? "…" : ""}`
              : ""
          }`,
        );
      }
    } finally {
      groupSyncInProgressRef.current = false;
      setGroupSyncAllState(null);
      if (appliedCount > 0) {
        lastPersistedConfigRef.current = JSON.stringify(latestConfig);
        await persistEditorConfigRef.current(latestConfig);
      }
    }
  }, [
    groupManageBaseItems,
    groupSyncAllState?.running,
    runPatentInventorySync,
    showSystemNotice,
    syncingVehicleKey,
  ]);

  const syncManagingVehicleWithGlo3dAutored = useCallback(async () => {
    if (!managingVehicleKey) return;
    await syncVehicleWithGlo3dAutored(managingVehicleKey);
  }, [managingVehicleKey, syncVehicleWithGlo3dAutored]);

  const refreshEditorConfigAfterRainworx = async () => {
    const configRes = await fetch("/api/admin/editor-config", { cache: "no-store" });
    if (!configRes.ok) return;
    const payload = (await configRes.json()) as { config?: EditorConfig };
    if (!payload.config) return;
    const normalized = normalizeEditorConfigClient(payload.config);
    setConfig(normalized);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify(normalized));
    }
    lastPersistedConfigRef.current = JSON.stringify(normalized);
  };

  const notifyRainworxEventImportOutcome = (
    data: {
      count?: number;
      editor?: {
        applied?: string[];
        skipped?: { reason: string; lotId?: string }[];
        updatedPatentes?: string[];
        newPatentes?: string[];
        photosPreserved?: number;
      };
    },
    contextLabel: string,
  ) => {
    const applied = data.editor?.applied ?? [];
    const skipped = data.editor?.skipped ?? [];
    const updated = data.editor?.updatedPatentes ?? [];
    const added = data.editor?.newPatentes ?? [];
    const photosPreserved = data.editor?.photosPreserved ?? 0;
    if (skipped.length > 0) {
      showSystemNotice(
        "info",
        "Importación parcial",
        skipped.map((s) => s.reason).join(" · "),
      );
    }
    const n = typeof data.count === "number" ? data.count : applied.length;
    if (applied.length === 0) {
      showSystemNotice(
        "info",
        "Evento procesado",
        n === 0
          ? `Ningún lote del evento coincidió con las patentes de ${contextLabel}.`
          : "No se escribieron cambios en el editor; revisa coincidencia de patentes.",
      );
      return;
    }
    const parts: string[] = [];
    if (updated.length > 0) {
      parts.push(`${updated.length} ficha(s) actualizada(s) sin pisar fotos Glo3D`);
    }
    if (added.length > 0) {
      parts.push(`${added.length} patente(s) nueva(s) agregada(s): ${added.join(", ")}`);
    }
    if (photosPreserved > 0) {
      parts.push(`${photosPreserved} miniatura(s) Glo3D/Tasaciones conservada(s)`);
    }
    showSystemNotice(
      "success",
      "Evento Rainworx sincronizado",
      parts.length > 0
        ? `${n} lote(s) leídos. ${parts.join(". ")}.`
        : `${n} lote(s) leídos. Fichas actualizadas en ${contextLabel}: ${applied.join(", ")}.`,
    );
  };

  const importRainworxLot = async () => {
    const url = rainworxLotUrl.trim();
    const isLotUrl = /\/Event\/LotDetails\//i.test(url);
    const isEventUrl = /\/Event\/Details\//i.test(url);
    if (!url || (!isLotUrl && !isEventUrl)) {
      showSystemNotice(
        "error",
        "URL inválida",
        "Pega la URL de un evento (…/Event/Details/…) o de una ficha de lote (…/Event/LotDetails/…).",
      );
      return;
    }
    setRainworxImporting(true);
    try {
      const body: Record<string, unknown> = {
        applyToEditor: true,
        editorMerge: "merge_smart",
      };
      if (isEventUrl) {
        const matchInventoryPatentes = collectInventoryPatentesForRainworx(items);
        if (matchInventoryPatentes.length === 0) {
          showSystemNotice(
            "error",
            "Sin patentes en inventario",
            "No hay patentes en el inventario actual para cruzar con el evento. Importa lote por lote con la URL de LotDetails o indica patente en el sistema.",
          );
          return;
        }
        body.eventUrl = url;
        body.matchInventoryPatentes = matchInventoryPatentes;
      } else {
        body.lotUrls = [url];
        const catalogItemIds = rainworxCatalogId.trim() ? [rainworxCatalogId.trim()] : undefined;
        if (catalogItemIds) body.catalogItemIds = catalogItemIds;
      }

      const res = await fetch("/api/admin/scrape-rainworx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        count?: number;
        editor?: { applied?: string[]; skipped?: { reason: string; lotId?: string }[] };
      };
      if (!res.ok) {
        showSystemNotice("error", "Importación Rainworx", data.error ?? `Error HTTP ${res.status}`);
        return;
      }
      await refreshEditorConfigAfterRainworx();
      const applied = data.editor?.applied ?? [];
      const skipped = data.editor?.skipped ?? [];
      if (skipped.length > 0) {
        showSystemNotice(
          "info",
          "Importación parcial",
          skipped.map((s) => s.reason).join(" · "),
        );
      }
      if (isEventUrl) {
        notifyRainworxEventImportOutcome(data, "el inventario visible");
      } else {
        showSystemNotice(
          "success",
          "Rainworx importado",
          applied.length
            ? `Actualizado en: ${applied.join(", ")}. Revisa la ficha del vehículo.`
            : "Listo. Si no ves cambios, agrega el ID del vehículo en catálogo (UUID) en el campo opcional.",
        );
      }
    } catch {
      showSystemNotice("error", "Importación Rainworx", "No se pudo completar la solicitud.");
    } finally {
      setRainworxImporting(false);
    }
  };

  const importGroupRainworxFromEvent = async () => {
    if (!groupManageTarget || groupManageTarget.type !== "auction") return;
    const url = groupRainworxEventUrl.trim();
    if (!url || !/\/Event\/Details\//i.test(url)) {
      showSystemNotice(
        "error",
        "URL inválida",
        "Pega la URL del evento Rainworx (…/Event/Details/…).",
      );
      return;
    }
    const matchInventoryPatentes = collectInventoryPatentesForRainworx(groupManageBaseItems);
    if (matchInventoryPatentes.length === 0 && !groupRainworxAddMissing) {
      showSystemNotice(
        "error",
        groupManageCommercialEventType === "venta_directa" ? "Sin patentes en venta directa" : "Sin patentes en este remate",
        groupManageCommercialEventType === "venta_directa"
          ? "Agrega unidades con patente a esta venta directa antes de sincronizar con Rainworx."
          : "Agrega unidades con patente a este remate antes de sincronizar con Rainworx.",
      );
      return;
    }
    setGroupRainworxImporting(true);
    try {
      const res = await fetch("/api/admin/scrape-rainworx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applyToEditor: true,
          editorMerge: "merge_smart",
          eventUrl: url,
          matchInventoryPatentes,
          addNewLotsFromEvent: groupRainworxAddMissing,
          ...(groupRainworxAddMissing
            ? {
                assignNewLotsAuctionId: groupManageTarget.auctionId,
                assignNewLotsEventType: groupManageCommercialEventType,
              }
            : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        count?: number;
        editor?: {
          applied?: string[];
          skipped?: { reason: string; lotId?: string }[];
          updatedPatentes?: string[];
          newPatentes?: string[];
          photosPreserved?: number;
        };
      };
      if (!res.ok) {
        showSystemNotice("error", "Importación Rainworx", data.error ?? `Error HTTP ${res.status}`);
        return;
      }
      await refreshEditorConfigAfterRainworx();
      notifyRainworxEventImportOutcome(data, groupManageTargetLabel || "este grupo");
    } catch {
      showSystemNotice("error", "Importación Rainworx", "No se pudo completar la solicitud.");
    } finally {
      setGroupRainworxImporting(false);
    }
  };

  const importRainworxInDetailEditor = async () => {
    if (!editingItem || !editingDetails) return;
    const url = detailRainworxUrl.trim();
    if (!url || !url.includes("LotDetails")) {
      showSystemNotice(
        "error",
        "URL inválida",
        "Pega la URL completa de Rainworx (debe contener /Event/LotDetails/).",
      );
      return;
    }
    const expectedPatente = getExpectedPatenteForRainworx(editingItem, editingDetails);
    setDetailRainworxImporting(true);
    try {
      const res = await fetch("/api/admin/scrape-rainworx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lotUrls: [url],
          catalogItemIds: [editingItem.id],
          applyToEditor: true,
          editorMerge: "merge_smart",
          ...(expectedPatente ? { expectedPatente } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        editor?: { applied?: string[]; skipped?: { reason: string }[] };
      };
      if (!res.ok) {
        showSystemNotice("error", "Importación Rainworx", data.error ?? `Error HTTP ${res.status}`);
        return;
      }
      const configRes = await fetch("/api/admin/editor-config", { cache: "no-store" });
      if (configRes.ok) {
        const payload = (await configRes.json()) as { config?: EditorConfig };
        if (payload.config) {
          const normalized = normalizeEditorConfigClient(payload.config);
          setConfig(normalized);
          if (typeof window !== "undefined") {
            window.localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify(normalized));
          }
          lastPersistedConfigRef.current = JSON.stringify(normalized);
          setEditingDetails(
            buildDetailsDraft(editingItem, getEditorOverrideForItem(editingItem, normalized.vehicleDetails)),
          );
        }
      }
      const skipped = data.editor?.skipped ?? [];
      if (skipped.length > 0) {
        showSystemNotice("info", "Importación", skipped.map((s) => s.reason).join(" · "));
      }
      showSystemNotice(
        "success",
        "Ficha sincronizada",
        expectedPatente
          ? `Datos de Rainworx importados (patente ${expectedPatente} verificada).`
          : "Datos de Rainworx importados. Si esta unidad tenía patente vacía, conviene revisarla en el sistema origen.",
      );
    } catch {
      showSystemNotice("error", "Importación Rainworx", "No se pudo completar la solicitud.");
    } finally {
      setDetailRainworxImporting(false);
    }
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

  const catalogNavLinks = useMemo(() => {
    const ventaDirectaHref = "/vehiculos?tipo=venta_directa";
    const firstRemate =
      visibleUpcomingRemateGroups[0]?.auction ??
      sortedRemateAuctions.find((auction) => !hiddenHomeCategoryIds.has(auctionCategoryKey(auction.id)));
    const proximosRematesHref = firstRemate
      ? `/vehiculos?evento=${encodeURIComponent(firstRemate.id)}`
      : "/vehiculos?tipo=remate";

    return [
      { id: "proximos-remates" as const, label: "Proximos remates", href: proximosRematesHref },
      { id: "ventas-directas" as const, label: "Ventas directas", href: ventaDirectaHref },
    ];
  }, [hiddenHomeCategoryIds, sortedRemateAuctions, visibleUpcomingRemateGroups]);

  const showAdminEditor = isAdmin && adminView === "editor" && !isStandaloneDetailPage;
  const showAdminHeaderControls = isAdmin && adminView === "editor";
  const showPublicHome = (!isAdmin || adminView === "home") && !isStandaloneDetailPage;
  const hasActiveSearch = homeSearchTerm.trim().length > 0;
  const shouldShowHowToSection =
    config.homeLayout.showHowToSection ||
    (config.homeLayout.heroSecondaryCtaHref ?? "").trim() === "#como-participar";
  const activeHomeFilterCount =
    (homeSiniestradoFilter !== "all" ? 1 : 0) +
    (homeSort === "precio-asc" ? 1 : 0) +
    quickFilters.length;

  const hasActiveSearchOrQuickFilters =
    hasActiveSearch ||
    activeHomeFilterCount > 0 ||
    topSectionFilter !== "all";

  const closeHomeFiltersMenu = useCallback(() => setShowHomeFiltersMenu(false), []);

  const renderHomeFiltersContent = (options: { closeOnSortSelect: boolean; mobile: boolean }) => {
    const sectionLabelClass = options.mobile
      ? "mb-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500"
      : "mb-2 px-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500";
    const sectionGap = options.mobile ? "space-y-5" : "space-y-4";
    const bodyChipClass = (active: boolean) =>
      `ui-focus min-h-11 rounded-xl border text-left font-semibold transition ${
        options.mobile ? "px-3 py-2.5 text-sm" : "px-2.5 py-2 text-xs"
      } ${
        active
          ? "border-cyan-600 bg-cyan-600 text-white shadow-sm"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
      }`;
    const siniestroChipClass = (active: boolean) =>
      `ui-focus rounded-lg px-2 py-2.5 text-center text-sm font-semibold transition ${
        active ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
      }`;
    const menorPrecioActive = homeSort === "precio-asc";

    return (
      <div className={sectionGap}>
        {activeHomeFilterCount > 0 ? (
          <div
            className={`flex items-center justify-between gap-3 rounded-xl border border-cyan-200 bg-cyan-50/80 ${
              options.mobile ? "px-3.5 py-3" : "px-3 py-2.5"
            }`}
          >
            <div className="min-w-0">
              <p className="text-xs font-bold text-cyan-900">
                {activeHomeFilterCount} filtro{activeHomeFilterCount === 1 ? "" : "s"} activo
                {activeHomeFilterCount === 1 ? "" : "s"}
              </p>
              <p className="mt-0.5 text-[11px] text-cyan-800">
                Mostrando {homeVisibleItems.length} resultado
                {homeVisibleItems.length === 1 ? "" : "s"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                clearHomeFilters();
                if (options.closeOnSortSelect) closeHomeFiltersMenu();
              }}
              className="ui-focus shrink-0 rounded-lg border border-cyan-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-cyan-800 hover:bg-cyan-100"
            >
              Limpiar
            </button>
          </div>
        ) : null}

        <section>
          <p className={sectionLabelClass}>1. Estado del vehículo</p>
          <div
            className={`grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 ${
              options.mobile ? "" : "max-w-full"
            }`}
            role="group"
            aria-label="Filtrar por estado de siniestro"
          >
            {HOME_SINIESTRO_FILTER_OPTIONS.map((option) => {
              const active = homeSiniestradoFilter === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setHomeSiniestradoFilter(option.id);
                    trackEvent("home_siniestro_filter_change", { filterId: option.id });
                  }}
                  className={siniestroChipClass(active)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </section>

        {config.homeLayout.showSortSelector ? (
          <section>
            <p className={sectionLabelClass}>2. Orden</p>
            <button
              type="button"
              aria-pressed={menorPrecioActive}
              onClick={() => {
                const nextSort: SortOption = menorPrecioActive ? "recomendado" : "precio-asc";
                setHomeSort(nextSort);
                trackEvent("home_sort_change", { sort: nextSort });
                if (options.closeOnSortSelect && nextSort === "precio-asc") closeHomeFiltersMenu();
              }}
              className={`ui-focus flex w-full items-center justify-between rounded-xl border px-3.5 py-3 text-left font-semibold transition ${
                menorPrecioActive
                  ? "border-emerald-500 bg-emerald-50 text-emerald-900 shadow-sm"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <span className="inline-flex items-center gap-2.5">
                <span
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${
                    menorPrecioActive ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                  aria-hidden="true"
                >
                  <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
                    <path
                      d="M5 13h10M8 10h4M10 7h0"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                    <path
                      d="M10 4v9m0 0-2-2m2 2 2-2"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span>
                  Menor precio
                  <span className="mt-0.5 block text-[11px] font-normal text-slate-500">
                    Ordena de menor a mayor
                  </span>
                </span>
              </span>
              {menorPrecioActive ? <span className="text-emerald-700">✓</span> : null}
            </button>
          </section>
        ) : null}

        {config.homeLayout.showQuickFilters ? (
          <section>
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <p className={sectionLabelClass}>3. Tipo de vehículo</p>
              {quickFilters.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setQuickFilters([])}
                  className="ui-focus rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Quitar tipos
                </button>
              ) : null}
            </div>
            <div className={`grid ${options.mobile ? "grid-cols-2 gap-2.5" : "grid-cols-2 gap-2"}`}>
              {HOME_BODY_FILTER_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={quickFilters.includes(id)}
                  onClick={() => toggleQuickFilter(id)}
                  className={bodyChipClass(quickFilters.includes(id))}
                >
                  {HOME_BODY_FILTER_LABELS[id]}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              Puedes combinar varios tipos. El listado muestra unidades que coincidan con al menos uno.
            </p>
          </section>
        ) : null}
      </div>
    );
  };

  const editingItem = editingVehicleKey ? itemsByKey.get(editingVehicleKey) ?? null : null;
  const managingItem = managingVehicleKey ? itemsByKey.get(managingVehicleKey) ?? null : null;
  const managingVehiclePromoMeta = useMemo(() => {
    if (!managingVehicleKey || !managingItem) {
      return {
        originalPrice: "",
        promoPrice: "",
        promoEnabled: false,
      };
    }
    const rawMeta = getRawPromoMeta(managingItem.raw as Record<string, unknown>);
    const details = config.vehicleDetails[managingVehicleKey];
    const originalPrice =
      details?.originalPrice?.trim() ??
      rawMeta.originalPriceLabel ??
      (config.vehiclePrices[managingVehicleKey] ?? "");
    const promoEnabled =
      typeof details?.promoEnabled === "boolean" ? details.promoEnabled : rawMeta.promoEnabled;
    const promoPrice =
      details?.promoPrice?.trim() ??
      rawMeta.promoPriceLabel ??
      (promoEnabled ? (config.vehiclePrices[managingVehicleKey] ?? "") : "");
    return { originalPrice, promoPrice, promoEnabled };
  }, [config.vehicleDetails, config.vehiclePrices, managingItem, managingVehicleKey]);
  const finalizeAuction = useMemo(() => {
    if (!finalizeAuctionId) return null;
    const found = (config.upcomingAuctions ?? []).find((auction) => auction.id === finalizeAuctionId);
    if (found) return found;
    if (finalizeAuctionId === DEFAULT_VENTA_DIRECTA_EVENT_ID) {
      return {
        id: DEFAULT_VENTA_DIRECTA_EVENT_ID,
        name: DEFAULT_VENTA_DIRECTA_EVENT_NAME,
        date: "",
        eventType: "venta_directa" as const,
      } satisfies UpcomingAuction;
    }
    return null;
  }, [config.upcomingAuctions, finalizeAuctionId]);
  const finalizeAuctionItems = useMemo(() => {
    if (!finalizeAuctionId) return [];
    const assignedKeys =
      finalizeAuctionId === DEFAULT_VENTA_DIRECTA_EVENT_ID
        ? new Set(ventaDirectaInventoryOnlyKeys)
        : new Set(
            Object.entries(config.vehicleUpcomingAuctionIds)
              .filter(([, auctionId]) => auctionId === finalizeAuctionId)
              .map(([vehicleKey]) => vehicleKey),
          );
    const baseItems = activeInventoryItems.filter((item) => isAssignedVehicleKey(assignedKeys, item));
    const query = normalizeText(finalizeAuctionSearchTerm);
    if (!query) return baseItems;
    return baseItems.filter((item) => {
      const patent = normalizeText(getPatent(item));
      const model = normalizeText(getModel(item));
      return patent.includes(query) || model.includes(query);
    });
  }, [
    activeInventoryItems,
    config.vehicleUpcomingAuctionIds,
    finalizeAuctionId,
    finalizeAuctionSearchTerm,
    ventaDirectaInventoryOnlyKeys,
  ]);
  const soldHistoryRows = useMemo(
    () =>
      [...(config.soldVehicleHistory ?? [])].sort(
        (a, b) => new Date(b.soldAt).getTime() - new Date(a.soldAt).getTime(),
      ),
    [config.soldVehicleHistory],
  );
  const soldAuctionOptions = useMemo(
    () =>
      Array.from(
        new Set(
          soldHistoryRows
            .map((row) => row.auctionName?.trim() ?? "Venta individual")
            .filter((value) => value.length > 0),
        ),
      ).sort((a, b) => a.localeCompare(b, "es-CL")),
    [soldHistoryRows],
  );
  const getSoldCategoryLabel = useCallback(
    (row: SoldVehicleRecord): string =>
      row.soldCategory?.trim() || (row.auctionName?.trim() ? "Remate" : "Venta individual"),
    [],
  );
  const soldFilteredRows = useMemo(() => {
    const query = normalizeText(soldSearch);
    const from = soldDateFrom ? new Date(`${soldDateFrom}T00:00:00`) : null;
    const to = soldDateTo ? new Date(`${soldDateTo}T23:59:59`) : null;
    const hasValidFrom = from && !Number.isNaN(from.getTime());
    const hasValidTo = to && !Number.isNaN(to.getTime());

    return soldHistoryRows.filter((row) => {
      const auctionLabel = row.auctionName?.trim() || "Venta individual";
      if (soldAuctionFilter !== "all" && auctionLabel !== soldAuctionFilter) return false;

      const soldAtDate = new Date(row.soldAt);
      if (hasValidFrom && !Number.isNaN(soldAtDate.getTime()) && soldAtDate < from!) return false;
      if (hasValidTo && !Number.isNaN(soldAtDate.getTime()) && soldAtDate > to!) return false;

      if (!query) return true;
      const columns = {
        patent: normalizeText(row.patent),
        title: normalizeText(row.title),
        soldCategory: normalizeText(getSoldCategoryLabel(row)),
        auctionName: normalizeText(auctionLabel),
      };
      if (soldSearchField === "all") {
        return Object.values(columns).some((value) => value.includes(query));
      }
      return columns[soldSearchField].includes(query);
    });
  }, [
    soldHistoryRows,
    soldSearch,
    soldSearchField,
    soldAuctionFilter,
    soldDateFrom,
    soldDateTo,
    getSoldCategoryLabel,
  ]);
  const soldFiltersActiveCount = useMemo(() => {
    let count = 0;
    if (soldSearchField !== "all") count += 1;
    if (soldAuctionFilter !== "all") count += 1;
    if (soldDateFrom) count += 1;
    if (soldDateTo) count += 1;
    return count;
  }, [soldSearchField, soldAuctionFilter, soldDateFrom, soldDateTo]);
  const downloadSoldRowsExcel = useCallback(
    (rows: SoldVehicleRecord[], scope: "filtrado" | "total") => {
      if (rows.length === 0) {
        showSystemNotice(
          "info",
          "Sin datos para exportar",
          "No hay unidades vendidas que coincidan con los filtros actuales.",
        );
        return;
      }
      const header = ["Patente", "Modelo", "Categoría venta", "Origen", "Fecha venta", "ID vehículo"];
      const lines = rows.map((row) => [
        toCsvCell(row.patent),
        toCsvCell(row.title),
        toCsvCell(getSoldCategoryLabel(row)),
        toCsvCell(row.auctionName?.trim() || "Venta individual"),
        toCsvCell(new Date(row.soldAt).toLocaleString("es-CL")),
        toCsvCell(row.vehicleKey),
      ]);
      const csv = `\uFEFF${header.map(toCsvCell).join(",")}\n${lines.map((line) => line.join(",")).join("\n")}`;
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const dateTag = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `unidades-vendidas-${scope}-${dateTag}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showSystemNotice(
        "success",
        "Exportación lista",
        `Se descargó el archivo para Excel (${scope}) con ${rows.length} registro(s).`,
      );
    },
    [getSoldCategoryLabel, showSystemNotice],
  );

  const offersVehicleOptions = useMemo(
    () =>
      Array.from(
        new Set(
          offersRows
            .map((row) => row.vehicleTitle.trim())
            .filter((value) => value.length > 0),
        ),
      ).sort((a, b) => a.localeCompare(b, "es-CL")),
    [offersRows],
  );
  const offersClientOptions = useMemo(
    () =>
      Array.from(
        new Set(
          offersRows
            .map((row) => row.customerName.trim())
            .filter((value) => value.length > 0),
        ),
      ).sort((a, b) => a.localeCompare(b, "es-CL")),
    [offersRows],
  );
  const offersFilteredRows = useMemo(() => {
    const query = normalizeText(offersSearch);
    const from = offersDateFrom ? new Date(`${offersDateFrom}T00:00:00`) : null;
    const to = offersDateTo ? new Date(`${offersDateTo}T23:59:59`) : null;
    const hasValidFrom = from && !Number.isNaN(from.getTime());
    const hasValidTo = to && !Number.isNaN(to.getTime());

    return offersRows.filter((row) => {
      if (offersVehicleFilter !== "all" && row.vehicleTitle !== offersVehicleFilter) return false;
      if (offersClientFilter !== "all" && row.customerName !== offersClientFilter) return false;

      const createdAtDate = new Date(row.createdAt);
      if (hasValidFrom && !Number.isNaN(createdAtDate.getTime()) && createdAtDate < from!) return false;
      if (hasValidTo && !Number.isNaN(createdAtDate.getTime()) && createdAtDate > to!) return false;

      if (!query) return true;
      const columns = {
        vehicleTitle: normalizeText(row.vehicleTitle),
        patent: normalizeText(row.patent),
        customerName: normalizeText(row.customerName),
        customerEmail: normalizeText(row.customerEmail),
        customerPhone: normalizeText(row.customerPhone),
      };
      if (offersSearchField === "all") {
        return Object.values(columns).some((value) => value.includes(query));
      }
      return columns[offersSearchField].includes(query);
    });
  }, [
    offersRows,
    offersSearch,
    offersSearchField,
    offersVehicleFilter,
    offersClientFilter,
    offersDateFrom,
    offersDateTo,
  ]);
  const offersFiltersActiveCount = useMemo(() => {
    let count = 0;
    if (offersSearchField !== "all") count += 1;
    if (offersVehicleFilter !== "all") count += 1;
    if (offersClientFilter !== "all") count += 1;
    if (offersDateFrom) count += 1;
    if (offersDateTo) count += 1;
    return count;
  }, [
    offersSearchField,
    offersVehicleFilter,
    offersClientFilter,
    offersDateFrom,
    offersDateTo,
  ]);
  const handleDeleteOffer = useCallback(
    async (offer: OfferRecord) => {
      if (deletingOfferId) return;
      if (typeof window !== "undefined") {
        const confirmed = window.confirm(
          `¿Eliminar esta oferta?\n\n${offer.patent || "Sin patente"} · ${offer.vehicleTitle || "Sin vehículo"}`,
        );
        if (!confirmed) return;
      }
      setDeletingOfferId(offer.id);
      setOffersError("");
      try {
        const response = await fetch("/api/admin/offers", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: offer.id }),
        });
        const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!response.ok || !payload.ok) {
          const message = payload.error ?? "No se pudo eliminar la oferta.";
          setOffersError(message);
          showSystemNotice("error", "No se pudo eliminar", message);
          return;
        }
        setOffersRows((prev) => prev.filter((row) => row.id !== offer.id));
        showSystemNotice("success", "Oferta eliminada", "La oferta se eliminó correctamente.");
      } catch {
        setOffersError("No se pudo eliminar la oferta.");
        showSystemNotice("error", "No se pudo eliminar", "Ocurrió un error de red al eliminar la oferta.");
      } finally {
        setDeletingOfferId(null);
      }
    },
    [deletingOfferId, showSystemNotice],
  );

  return (
    <main
      id="catalogo-main"
      className={`${isStandaloneDetailPage ? "catalog-bg" : "premium-bg"} min-h-screen overflow-x-hidden text-slate-900`}
    >
      {!isStandaloneDetailPage ? (
        <>
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
        </>
      ) : null}

      {!isStandaloneDetailPage ? (
      <section className="sticky top-0 z-30 border-b border-cyan-100/80 bg-white/88 shadow-[0_8px_24px_rgba(87,141,167,0.08)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 md:py-4 lg:px-8">
          <div className="flex items-center justify-between gap-3 md:gap-4">
            <Link
              href="/"
              className="inline-flex"
              onClick={(event) => {
                if (isAdmin && adminView === "editor") {
                  event.preventDefault();
                  setAdminView("home");
                }
                setTopSectionFilter("all");
                setMobileMenuOpen(false);
              }}
            >
              <Image
                src="/vedisa-logo.png"
                alt="Logo Vedisa Remates"
                width={208}
                height={43}
                priority
                className="h-auto w-full max-w-[192px] sm:max-w-[208px] md:max-w-[224px]"
              />
            </Link>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="ui-focus inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-700 md:hidden"
              aria-label="Abrir menú"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-main-menu"
            >
              <span className="text-lg leading-none">{mobileMenuOpen ? "×" : "☰"}</span>
            </button>
            <div className="hidden items-center gap-2 md:flex">
              <nav className="flex flex-wrap gap-2 text-sm">
                {catalogNavLinks.map((tab) => (
                  <Link
                    key={`top-tab-desktop-${tab.id}`}
                    href={tab.href}
                    className="premium-link-pill ui-focus"
                  >
                    {tab.label}
                  </Link>
                ))}
              </nav>
              {showAdminHeaderControls ? (
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
              ) : !isAdmin ? (
                <button className="ui-focus rounded-full bg-cyan-600 px-3 py-1 text-xs text-white transition hover:-translate-y-0.5 hover:bg-cyan-500" onClick={() => { setShowLogin(true); trackEvent("login_modal_open"); }}>
                  Login
                </button>
              ) : null}
            </div>
          </div>
          {mobileMenuOpen ? (
            <div id="mobile-main-menu" className="rounded-lg border border-slate-200 bg-white p-3 md:hidden">
              <nav className="flex flex-col gap-2 text-sm">
                {catalogNavLinks.map((tab) => (
                  <Link
                    key={`top-tab-mobile-${tab.id}`}
                    href={tab.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="premium-link-pill ui-focus text-center"
                  >
                    {tab.label}
                  </Link>
                ))}
              </nav>
              <div className="mt-3 flex flex-wrap gap-2">
                {showAdminHeaderControls ? (
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
                ) : !isAdmin ? (
                  <button className="ui-focus w-full rounded-full bg-cyan-600 px-3 py-1 text-xs text-white" onClick={() => { setShowLogin(true); setMobileMenuOpen(false); trackEvent("login_modal_open"); }}>
                    Login
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          {feed.warning ? (
            <p className="rounded-md border border-amber-300/60 bg-amber-100 px-3 py-2 text-sm text-amber-900">{feed.warning}</p>
          ) : null}
        </div>
      </section>
      ) : null}

      {showAdminEditor ? (
        <section className="relative z-10 mx-auto mt-6 max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="section-shell glass-soft space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Modo editor administrador</h3>
                <p className="text-xs text-slate-500">Lista limpia de unidades con gestión individual de remates, categorías, visibilidad y precio.</p>
              </div>
              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => void runAdminInventoryAndSync()}
                  disabled={adminInventorySyncBusy}
                  title="Actualizar inventario y sincronizar con Tasaciones"
                  aria-label="Actualizar inventario y sincronizar con Tasaciones"
                  className="ui-focus inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 shadow-sm transition hover:border-cyan-400 hover:bg-cyan-50 hover:text-cyan-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className={`h-5 w-5 ${adminInventorySyncBusy ? "animate-spin" : ""}`}
                    aria-hidden
                  >
                    <path
                      fillRule="evenodd"
                      d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H4.598a.75.75 0 0 0-.75.75v3.634a.75.75 0 0 0 1.5 0v-2.033l.262.263A7 7 0 0 0 17.25 10a.75.75 0 0 0-1.5 0 5.48 5.48 0 0 1-.438 1.424ZM4.688 8.576a5.5 5.5 0 0 1 9.201-2.466l.312.311h-2.433a.75.75 0 0 0 0 1.5h3.634a.75.75 0 0 0 .75-.75V3.537a.75.75 0 0 0-1.5 0v2.033l-.262-.263A7 7 0 0 0 2.75 10a.75.75 0 0 0 1.5 0c0-.51.07-1.003.438-1.424Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            </div>
            <div className="rounded-xl border border-indigo-200/80 bg-indigo-50/50 p-4 text-sm">
              <p className="font-semibold text-indigo-950">Importar ficha desde Rainworx</p>
              <div className="mt-3 flex flex-col gap-2 md:flex-row md:flex-wrap md:items-end">
                <label className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-xs font-medium text-slate-600">URL Rainworx (evento o lote)</span>
                  <input
                    type="url"
                    value={rainworxLotUrl}
                    onChange={(e) => setRainworxLotUrl(e.target.value)}
                    placeholder="https://vehiculoschocados.cl/Event/Details/… o …/LotDetails/…"
                    className="ui-focus w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="flex w-full flex-col gap-1 md:w-72">
                  <span className="text-xs font-medium text-slate-600">ID en catálogo (solo lote suelto)</span>
                  <input
                    type="text"
                    value={rainworxCatalogId}
                    onChange={(e) => setRainworxCatalogId(e.target.value)}
                    placeholder="UUID si importas LotDetails sin patente"
                    className="ui-focus w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono text-xs"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void importRainworxLot()}
                  disabled={rainworxImporting}
                  className="ui-focus shrink-0 rounded-md border border-indigo-400 bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-60"
                >
                  {rainworxImporting ? "Importando…" : "Importar desde Rainworx"}
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
              {([
                ["categorias", "Categorías"],
                ["vehiculos", "Inventario"],
                ["ofertas", "Ofertas recibidas"],
                ["analytics", "Analytics"],
                ["layout", "Editar Home"],
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
                <div className="flex flex-wrap items-center gap-2">
                  {([
                    ["actual", "Inventario actual"],
                    ["vendidas", "Unidades vendidas"],
                  ] as Array<[InventorySubtabId, string]>).map(([tabId, label]) => (
                    <button
                      key={`inventory-subtab-${tabId}`}
                      type="button"
                      onClick={() => setInventorySubtab(tabId)}
                      className={`ui-focus rounded-full px-3 py-1 text-xs font-semibold transition ${
                        inventorySubtab === tabId
                          ? "bg-slate-900 text-white"
                          : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {inventorySubtab === "actual" ? (
                  <>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                  <input
                    value={searchTerm}
                    onChange={(event) => {
                      setSearchTerm(event.target.value);
                      setEditorPage(1);
                    }}
                    placeholder="Buscar vehículo para editar..."
                    className="ui-focus w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                  />
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowEditorFiltersMenu((prev) => !prev)}
                      className="ui-focus inline-flex h-full min-h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-slate-700 transition hover:bg-slate-50"
                      aria-label="Abrir filtros del inventario"
                      title="Filtros"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        aria-hidden="true"
                      >
                        <path d="M3 5h18M6 12h12M10 19h4" strokeLinecap="round" />
                      </svg>
                    </button>
                    {showEditorFiltersMenu ? (
                      <div className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Filtros
                        </p>
                        <div className="space-y-2">
                          <select
                            value={editorVisibilityFilter}
                            onChange={(event) => {
                              setEditorVisibilityFilter(
                                event.target.value as EditorVisibilityFilter,
                              );
                              setEditorPage(1);
                            }}
                            className="ui-focus w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                          >
                            <option value="all">Visibles y ocultos</option>
                            <option value="visible">Solo visibles</option>
                            <option value="hidden">Solo ocultos</option>
                          </select>
                          <select
                            value={editorVehicleCategoryFilter}
                            onChange={(event) => {
                              setEditorVehicleCategoryFilter(
                                event.target.value as EditorVehicleCategoryFilter,
                              );
                              setEditorPage(1);
                            }}
                            className="ui-focus w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                          >
                            <option value="all">Todas las categorías</option>
                            <option value="livianos">Vehículos livianos</option>
                            <option value="pesados">Vehículos pesados</option>
                            <option value="maquinaria">Maquinaria</option>
                            <option value="chatarra">Chatarra</option>
                            <option value="otros">Otros</option>
                          </select>
                          <select
                            value={auctionFilterId}
                            onChange={(event) => {
                              setAuctionFilterId(event.target.value);
                              if (event.target.value) setEditorGroupFilter("proximos-remates");
                              setEditorPage(1);
                            }}
                            className="ui-focus w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                          >
                            <option value="">Todos los remates</option>
                            {sortedUpcomingAuctions.map((auction) => (
                              <option key={auction.id} value={auction.id}>
                                {auction.name} ({formatAuctionWindowLabel(auction)})
                              </option>
                            ))}
                          </select>
                          <select
                            value={editorGroupFilter}
                            onChange={(event) => {
                              const next = event.target.value as EditorGroupFilter;
                              setEditorGroupFilter(next);
                              if (next !== "proximos-remates") setAuctionFilterId("");
                              setEditorPage(1);
                            }}
                            className="ui-focus w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                          >
                            <option value="all">Todas las categorías</option>
                            {availableGroupFilterOptions.map((option) => (
                              <option key={`group-filter-${option.value}`} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowEditorFiltersMenu(false)}
                          className="ui-focus mt-3 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                        >
                          Cerrar
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (adminTab === "vehiculos" && editorGroupFilter === "all") {
                        setManualDraft(EMPTY_MANUAL_PUBLICATION_DRAFT);
                        setManualUploadedImages([]);
                        setShowManualCreateModal(true);
                        return;
                      }
                      if (editorGroupFilter === "ventas-directas") {
                        openBatchAssignModal({ type: "section", sectionId: editorGroupFilter });
                        return;
                      }
                      if (editorGroupFilter === "proximos-remates") {
                        if (!auctionFilterId) {
                          showSystemNotice(
                            "info",
                            "Selecciona un remate",
                            "Para agregar en próximos remates, elige un remate específico primero.",
                          );
                          return;
                        }
                        openBatchAssignModal({ type: "auction", auctionId: auctionFilterId });
                        return;
                      }
                      showSystemNotice(
                        "info",
                        "Elige un grupo",
                        "Selecciona una categoría o remate para agregar unidades del inventario.",
                      );
                    }}
                    className="ui-focus inline-flex h-full min-h-10 items-center justify-center rounded-md border border-cyan-300 bg-cyan-50 px-3 text-cyan-700 transition hover:bg-cyan-100"
                    aria-label="Agregar unidades del inventario o crear unidad manual"
                    title="Agregar o crear unidad"
                  >
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-cyan-600 text-xs text-white">
                      +
                    </span>
                  </button>
                </div>
                {selectedInventoryKeys.length > 0 ? (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => applyBulkVisibility(true)}
                      className="ui-focus inline-flex h-8 w-8 items-center justify-center rounded border border-emerald-300 bg-emerald-50 text-emerald-700"
                      title="Mostrar seleccionados"
                      aria-label="Mostrar seleccionados"
                    >
                      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                        <path d="M10 4c3.38 0 6.63 2 8.37 5.42a1.3 1.3 0 0 1 0 1.16C16.63 14 13.38 16 10 16s-6.63-2-8.37-5.42a1.3 1.3 0 0 1 0-1.16C3.37 6 6.62 4 10 4Zm0 2c-2.6 0-5.16 1.5-6.71 4 .01.02.02.04.03.05C4.84 12.5 7.4 14 10 14s5.16-1.5 6.71-4a.63.63 0 0 0-.03-.05C15.16 7.5 12.6 6 10 6Zm0 1.75A2.25 2.25 0 1 1 10 12.25 2.25 2.25 0 0 1 10 7.75Z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => applyBulkVisibility(false)}
                      className="ui-focus inline-flex h-8 w-8 items-center justify-center rounded border border-slate-300 bg-white text-slate-700"
                      title="Ocultar seleccionados"
                      aria-label="Ocultar seleccionados"
                    >
                      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                        <path d="M10 4c3.38 0 6.63 2 8.37 5.42a1.3 1.3 0 0 1 0 1.16C16.63 14 13.38 16 10 16c-1.72 0-3.42-.52-4.95-1.5l1.5-1.5c1.06.63 2.24.97 3.45.97 2.6 0 5.16-1.5 6.71-4a.63.63 0 0 0-.03-.05C15.16 7.5 12.6 6 10 6c-1.2 0-2.38.34-3.43.96L5.1 5.49A9.85 9.85 0 0 1 10 4Zm7.2 13.6a.75.75 0 0 1-1.06 0l-13-13a.75.75 0 1 1 1.06-1.06l13 13a.75.75 0 0 1 0 1.06ZM10 7.75c.7 0 1.33.32 1.75.83L8.58 11.75A2.25 2.25 0 0 1 10 7.75Z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={applyBulkMoveCategory}
                      className="ui-focus inline-flex h-8 w-8 items-center justify-center rounded border border-indigo-300 bg-indigo-50 text-indigo-700"
                      title="Cambiar categoría"
                      aria-label="Cambiar categoría"
                    >
                      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                        <path d="M4.5 3A1.5 1.5 0 0 0 3 4.5v11A1.5 1.5 0 0 0 4.5 17h11a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5h-6A1.5 1.5 0 0 1 8 5.5v-1A1.5 1.5 0 0 0 6.5 3h-2Z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={applyBulkAssignAuction}
                      className="ui-focus inline-flex h-8 w-8 items-center justify-center rounded border border-cyan-300 bg-cyan-50 text-cyan-700"
                      title="Mover a remate"
                      aria-label="Mover a remate"
                    >
                      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                        <path d="M4 3a1 1 0 0 0-1 1v2h14V4a1 1 0 1 0-2 0h-1a2 2 0 1 0-4 0H9a2 2 0 1 0-4 0H4Zm13 5H3v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8Z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => applyBulkSetVentaDirecta(true)}
                      className="ui-focus inline-flex h-8 w-8 items-center justify-center rounded border border-amber-300 bg-amber-50 text-amber-700"
                      title="Mover a venta directa"
                      aria-label="Mover a venta directa"
                    >
                      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                        <path d="M4 4h12v3H4V4Zm0 5h8v3H4V9Zm0 5h12v2H4v-2Z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => applyBulkSetVentaDirecta(false)}
                      className="ui-focus inline-flex h-8 w-8 items-center justify-center rounded border border-amber-300 bg-white text-amber-700"
                      title="Sacar de venta directa"
                      aria-label="Sacar de venta directa"
                    >
                      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                        <path d="M16.7 3.3a1 1 0 0 0-1.4 0L10 8.6 4.7 3.3a1 1 0 0 0-1.4 1.4L8.6 10l-5.3 5.3a1 1 0 1 0 1.4 1.4L10 11.4l5.3 5.3a1 1 0 0 0 1.4-1.4L11.4 10l5.3-5.3a1 1 0 0 0 0-1.4Z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={applyBulkDelete}
                      className="ui-focus inline-flex h-8 w-8 items-center justify-center rounded border border-rose-300 bg-rose-50 text-rose-700"
                      title="Eliminar masivo"
                      aria-label="Eliminar masivo"
                    >
                      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                        <path d="M7 2.5A1.5 1.5 0 0 0 5.5 4v.5H3.75a.75.75 0 0 0 0 1.5h.56l.75 9.02A2 2 0 0 0 7.06 17h5.88a2 2 0 0 0 1.99-1.98l.75-9.02h.57a.75.75 0 0 0 0-1.5H14.5V4A1.5 1.5 0 0 0 13 2.5H7Z" />
                      </svg>
                    </button>
                  </div>
                ) : null}
                <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-2">
                  {paginatedEditorItems.map((item) => {
                    const key = getVehicleKey(item);
                    const hidden = mergedHiddenVehicleIds.has(key);
                    const needsQuickSync = vehicleNeedsQuickSync(item, key, config, isStaleEditorDraftValue);
                    const eventBadge = upcomingAuctionByVehicleKey[key];
                    const auctionLabel = eventBadge
                      ? eventBadge.kind === "venta_directa"
                        ? "Venta directa"
                        : `Remate: ${eventBadge.label}`
                      : "Sin evento asignado";
                    return (
                      <article
                        key={`editor-${key}`}
                        className="grid grid-cols-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/30 px-2.5 py-1.5 sm:grid-cols-[auto_1.4fr_auto_1fr_auto]"
                      >
                        <div className="flex items-center justify-center">
                          <input
                            type="checkbox"
                            checked={selectedInventorySet.has(key)}
                            onChange={() =>
                              setSelectedInventoryKeys((prev) =>
                                prev.includes(key) ? prev.filter((entry) => entry !== key) : [...prev, key],
                              )
                            }
                            className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                            aria-label={`Seleccionar ${getPatent(item)}`}
                            title="Seleccionar"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            {getPatent(item)}
                            <span
                              className={`inline-flex h-1.5 w-1.5 rounded-full ${
                                hidden ? "bg-rose-500" : "bg-emerald-500"
                              }`}
                              aria-hidden="true"
                            />
                            <span className="normal-case tracking-normal text-[11px] text-slate-500">
                              {hidden ? "Oculto" : "Visible"}
                            </span>
                            {needsQuickSync ? (
                              <button
                                type="button"
                                onClick={() => void showPatentDiagnosis(getPatent(item))}
                                className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-amber-800 underline decoration-amber-400/70 underline-offset-2 hover:bg-amber-200"
                                title="Ver diagnóstico del sistema interno / Glo3D / Autored"
                              >
                                Sin sync
                              </button>
                            ) : null}
                          </p>
                          <p className="line-clamp-1 text-sm font-semibold leading-tight text-slate-900">
                            {resolveVehicleListTitle(item, config.vehicleDetails)}
                          </p>
                        </div>
                        <VehicleListThumbnailWithSync
                          item={item}
                          vehicleKey={key}
                          editorConfig={config}
                          onSync={(vehicleKey) => void syncVehicleWithGlo3dAutored(vehicleKey)}
                          syncingVehicleKey={syncingVehicleKey}
                          glo3dCooldownLabel={cooldownLabel}
                          isStaleTitle={isStaleEditorDraftValue}
                        />
                        <div className="min-w-0 text-xs text-slate-600 sm:text-right">
                          <p className="line-clamp-1 font-semibold text-slate-700">{auctionLabel}</p>
                          <p className="line-clamp-1">
                            {formatPrice(resolveVehiclePriceRaw(item, config.vehiclePrices) ?? undefined) ??
                              "Precio no definido"}
                          </p>
                        </div>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setManagingVehicleKey(key)}
                            className="ui-focus inline-flex h-7 w-7 items-center justify-center rounded border border-cyan-300 bg-cyan-50 text-cyan-700 transition hover:bg-cyan-100"
                            aria-label={`Gestionar unidad ${getPatent(item)}`}
                            title="Gestionar unidad"
                          >
                            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                              <path d="M13.586 2.586a2 2 0 0 1 2.828 2.828l-8.2 8.2a1 1 0 0 1-.475.264l-3 0.75a1 1 0 0 1-1.212-1.213l.75-3a1 1 0 0 1 .264-.474l8.2-8.2ZM12.172 4 5.24 10.932l-.39 1.56 1.56-.39L13.344 5.17 12.172 4Z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const nextHidden = !hidden;
                              toggleHidden(key);
                              showSystemNotice(
                                "success",
                                nextHidden ? "Unidad oculta del home" : "Unidad visible en home",
                                nextHidden
                                  ? `${getPatent(item)} quedó oculta del home, sin eliminarse del inventario.`
                                  : `${getPatent(item)} volvió a mostrarse en el home.`,
                              );
                            }}
                            className={`ui-focus inline-flex h-7 w-7 items-center justify-center rounded border transition ${
                              hidden
                                ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                            }`}
                            aria-label={`${hidden ? "Mostrar" : "Ocultar"} en home ${getPatent(item)}`}
                            title={hidden ? "Mostrar en home" : "Ocultar del home"}
                          >
                            {hidden ? (
                              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                                <path d="M10 4c3.38 0 6.63 2 8.37 5.42a1.3 1.3 0 0 1 0 1.16C16.63 14 13.38 16 10 16s-6.63-2-8.37-5.42a1.3 1.3 0 0 1 0-1.16C3.37 6 6.62 4 10 4Zm0 2c-2.6 0-5.16 1.5-6.71 4 .01.02.02.04.03.05C4.84 12.5 7.4 14 10 14s5.16-1.5 6.71-4a.63.63 0 0 0-.03-.05C15.16 7.5 12.6 6 10 6Zm0 1.75A2.25 2.25 0 1 1 10 12.25 2.25 2.25 0 0 1 10 7.75Z" />
                              </svg>
                            ) : (
                              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                                <path d="M10 4c3.38 0 6.63 2 8.37 5.42a1.3 1.3 0 0 1 0 1.16C16.63 14 13.38 16 10 16c-1.72 0-3.42-.52-4.95-1.5l1.5-1.5c1.06.63 2.24.97 3.45.97 2.6 0 5.16-1.5 6.71-4a.63.63 0 0 0-.03-.05C15.16 7.5 12.6 6 10 6c-1.2 0-2.38.34-3.43.96L5.1 5.49A9.85 9.85 0 0 1 10 4Zm7.2 13.6a.75.75 0 0 1-1.06 0l-13-13a.75.75 0 1 1 1.06-1.06l13 13a.75.75 0 0 1 0 1.06ZM10 7.75c.7 0 1.33.32 1.75.83L8.58 11.75A2.25 2.25 0 0 1 10 7.75Z" />
                              </svg>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              markVehicleAsSold(key);
                              setManagingVehicleKey(null);
                              showSystemNotice(
                                "success",
                                "Unidad vendida",
                                `${getPatent(item)} pasó a historial y dejó de estar visible en inventario/catálogo.`,
                              );
                            }}
                            className="ui-focus inline-flex h-7 w-7 items-center justify-center rounded border border-amber-300 bg-amber-50 text-amber-700 transition hover:bg-amber-100"
                            aria-label={`Marcar vendida ${getPatent(item)}`}
                            title="Marcar vendida"
                          >
                            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                              <path fillRule="evenodd" d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.2 7.25a1 1 0 0 1-1.42.001l-3-3.015a1 1 0 1 1 1.418-1.41l2.29 2.3 6.49-6.534a1 1 0 0 1 1.416-.006Z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                      </article>
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
                      onClick={() => {
                        if (allPaginatedSelected) {
                          setSelectedInventoryKeys((prev) =>
                            prev.filter((key) => !paginatedEditorKeys.includes(key)),
                          );
                        } else {
                          setSelectedInventoryKeys((prev) => Array.from(new Set([...prev, ...paginatedEditorKeys])));
                        }
                      }}
                      className="ui-focus rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                      title={allPaginatedSelected ? "Deseleccionar página" : "Seleccionar página"}
                    >
                      {allPaginatedSelected ? "☑" : "☐"}
                    </button>
                    {selectedInventoryKeys.length > 0 ? (
                      <span className="rounded border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[11px] font-semibold text-cyan-700">
                        {selectedInventoryKeys.length}
                      </span>
                    ) : null}
                  </div>
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
                {inventorySubtab === "vendidas" ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                      Unidades vendidas (tabla dinámica)
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Busca, filtra y exporta el historial de ventas. Puedes revertir una venta desde esta tabla.
                    </p>
                    <div className="relative mt-3 flex flex-wrap items-center gap-2">
                      <input
                        value={soldSearch}
                        onChange={(event) => setSoldSearch(event.target.value)}
                        placeholder="Buscar en tabla..."
                        className="ui-focus min-w-[16rem] flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSoldFiltersMenu((prev) => !prev)}
                        className="ui-focus inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50"
                        aria-label="Abrir filtros de unidades vendidas"
                        title="Filtros"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          aria-hidden="true"
                        >
                          <path d="M3 5h18M6 12h12M10 19h4" strokeLinecap="round" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          downloadSoldRowsExcel(
                            soldFilteredRows,
                            soldSearch.trim().length > 0 || soldFiltersActiveCount > 0
                              ? "filtrado"
                              : "total",
                          )
                        }
                        className="ui-focus inline-flex h-9 w-9 items-center justify-center rounded-md border border-emerald-300 bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100"
                        aria-label="Descargar Excel de unidades vendidas"
                        title={
                          soldSearch.trim().length > 0 || soldFiltersActiveCount > 0
                            ? "Descargar Excel filtrado"
                            : "Descargar Excel completo"
                        }
                      >
                        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                          <path d="M10 2a1 1 0 0 1 1 1v6.59l1.3-1.3a1 1 0 1 1 1.4 1.42l-3 2.97a1 1 0 0 1-1.4 0l-3-2.97a1 1 0 0 1 1.4-1.42l1.3 1.3V3a1 1 0 0 1 1-1Z" />
                          <path d="M3 13a1 1 0 0 1 1 1v1h12v-1a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1Z" />
                        </svg>
                      </button>
                      <div className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700">
                        {formatCompactNumber(soldFilteredRows.length)} resultado(s)
                      </div>
                      {showSoldFiltersMenu ? (
                        <div className="absolute right-0 top-full z-20 mt-2 w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Filtros de unidades vendidas
                          </p>
                          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                            <select
                              value={soldSearchField}
                              onChange={(event) => setSoldSearchField(event.target.value as SoldFilterField)}
                              className="ui-focus rounded-md border border-slate-300 bg-white px-3 py-2 text-xs"
                            >
                              <option value="all">Buscar en todas las columnas</option>
                              <option value="patent">Patente</option>
                              <option value="title">Modelo</option>
                              <option value="soldCategory">Categoría de venta</option>
                              <option value="auctionName">Origen de venta</option>
                            </select>
                            <select
                              value={soldAuctionFilter}
                              onChange={(event) => setSoldAuctionFilter(event.target.value)}
                              className="ui-focus rounded-md border border-slate-300 bg-white px-3 py-2 text-xs"
                            >
                              <option value="all">Todos los orígenes</option>
                              {soldAuctionOptions.map((option) => (
                                <option key={`sold-origin-${option}`} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                            <input
                              type="date"
                              value={soldDateFrom}
                              onChange={(event) => setSoldDateFrom(event.target.value)}
                              className="ui-focus rounded-md border border-slate-300 bg-white px-3 py-2 text-xs"
                            />
                            <input
                              type="date"
                              value={soldDateTo}
                              onChange={(event) => setSoldDateTo(event.target.value)}
                              className="ui-focus rounded-md border border-slate-300 bg-white px-3 py-2 text-xs"
                            />
                          </div>
                          <div className="mt-2 flex flex-wrap justify-between gap-2">
                            <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                              {soldFiltersActiveCount} filtro(s) activo(s)
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setSoldSearchField("all");
                                setSoldAuctionFilter("all");
                                setSoldDateFrom("");
                                setSoldDateTo("");
                              }}
                              className="ui-focus rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                            >
                              Limpiar filtros
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-3 overflow-auto rounded-xl border border-slate-200 bg-white">
                      {soldFilteredRows.length === 0 ? (
                        <p className="p-4 text-sm text-slate-500">No hay unidades vendidas para los filtros actuales.</p>
                      ) : (
                        <table className="min-w-[980px] w-full text-left text-xs">
                          <thead className="bg-slate-50 text-slate-600">
                            <tr>
                              {["Fecha venta", "Patente", "Modelo", "Categoría venta", "Origen", "ID vehículo", "Acciones"].map((label) => (
                                <th key={`sold-col-${label}`} className="px-3 py-2 font-semibold uppercase tracking-wide">
                                  {label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {soldFilteredRows.map((entry) => (
                              <tr key={`${entry.vehicleKey}-${entry.soldAt}`} className="border-b border-slate-100 align-top">
                                <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                                  {new Date(entry.soldAt).toLocaleString("es-CL")}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-800">
                                  {entry.patent}
                                </td>
                                <td className="px-3 py-2 text-slate-800">{entry.title}</td>
                                <td className="px-3 py-2 text-slate-700">{getSoldCategoryLabel(entry)}</td>
                                <td className="px-3 py-2 text-slate-700">
                                  {entry.auctionName?.trim() || "Venta individual"}
                                </td>
                                <td className="px-3 py-2 font-mono text-[11px] text-slate-500">
                                  {entry.vehicleKey}
                                </td>
                                <td className="px-3 py-2">
                                  <button
                                    type="button"
                                    onClick={() => setPendingRevertSale(entry)}
                                    className="ui-focus inline-flex h-7 w-7 items-center justify-center rounded border border-cyan-300 bg-cyan-50 text-cyan-700 transition hover:bg-cyan-100"
                                    aria-label={`Revertir venta ${entry.patent}`}
                                    title="Revertir venta"
                                  >
                                    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                                      <path d="M10 3a7 7 0 1 1-6.2 10.25.75.75 0 1 1 1.32-.72A5.5 5.5 0 1 0 4.5 10H6a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 10.75V7.5a.75.75 0 0 1 1.5 0v1.3A7 7 0 0 1 10 3Z" />
                                    </svg>
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            {adminTab === "categorias" ? (
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Grupos del catálogo
                    </p>
                    <p className="text-sm text-slate-600">
                      Gestiona remates, ventas directas y categorías personalizadas desde este panel.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCreateCategoryForm((prev) => !prev)}
                    className="ui-focus inline-flex h-8 w-8 items-center justify-center rounded-full bg-cyan-600 text-lg font-bold leading-none text-white transition hover:bg-cyan-500"
                    aria-label={showCreateCategoryForm ? "Cerrar creación de grupo" : "Abrir creación de grupo"}
                    title={showCreateCategoryForm ? "Cerrar" : "Crear grupo"}
                  >
                    {showCreateCategoryForm ? "−" : "+"}
                  </button>
                </div>

                {showCreateCategoryForm ? (
                  <div className="mt-3 grid gap-2 rounded-lg border border-cyan-100 bg-cyan-50/40 p-2 md:grid-cols-[auto_auto_1fr_1fr_auto_auto_auto_auto]">
                    <select
                      value={createGroupKind}
                      onChange={(event) => {
                        const kind = event.target.value as "categoria" | "remate" | "venta_directa";
                        setCreateGroupKind(kind);
                        if (kind === "remate") setNewAuctionEventType("remate");
                        if (kind === "venta_directa") setNewAuctionEventType("venta_directa");
                      }}
                      className="ui-focus rounded-md border border-cyan-200 bg-white px-2.5 py-2 text-sm"
                    >
                      <option value="categoria">Categoría</option>
                      <option value="remate">Remate</option>
                      <option value="venta_directa">Venta directa</option>
                    </select>
                    {createGroupKind === "remate" || createGroupKind === "venta_directa" ? (
                      <>
                        <select
                          value={newAuctionEventType}
                          onChange={(event) => {
                            const nextType = event.target.value as CommercialEventType;
                            setNewAuctionEventType(nextType);
                            if (nextType === "venta_directa" && newAuctionDate) {
                              setNewAuctionEndDate((prev) => prev || newAuctionDate);
                            }
                          }}
                          className="ui-focus rounded-md border border-cyan-200 bg-white px-2.5 py-2 text-sm"
                        >
                          <option value="remate">Remate</option>
                          <option value="venta_directa">Venta directa</option>
                        </select>
                        <input
                          value={newAuctionName}
                          onChange={(event) => setNewAuctionName(event.target.value)}
                          placeholder={newAuctionEventType === "venta_directa" ? "Nombre de la venta directa" : "Nombre del remate"}
                          className="ui-focus rounded-md border border-cyan-200 bg-white px-3 py-2 text-sm"
                        />
                        <input
                          type="date"
                          value={newAuctionDate}
                          onChange={(event) => {
                            const value = event.target.value;
                            setNewAuctionDate(value);
                            if (
                              newAuctionEventType === "venta_directa" &&
                              (!newAuctionEndDate || newAuctionEndDate < value)
                            ) {
                              setNewAuctionEndDate(value);
                            }
                          }}
                          className="ui-focus rounded-md border border-cyan-200 bg-white px-3 py-2 text-sm"
                          title={newAuctionEventType === "venta_directa" ? "Inicio (fecha)" : "Fecha del evento"}
                        />
                        {newAuctionEventType === "venta_directa" ? (
                          <input
                            type="date"
                            value={newAuctionEndDate}
                            min={newAuctionDate}
                            onChange={(event) => setNewAuctionEndDate(event.target.value)}
                            className="ui-focus rounded-md border border-cyan-200 bg-white px-3 py-2 text-sm"
                            title="Finalización (fecha)"
                          />
                        ) : null}
                        <input
                          type="time"
                          value={newAuctionStartTime}
                          onChange={(event) => setNewAuctionStartTime(event.target.value)}
                          className="ui-focus rounded-md border border-cyan-200 bg-white px-3 py-2 text-sm"
                          title="Hora de inicio"
                        />
                        <input
                          type="time"
                          value={newAuctionEndTime}
                          onChange={(event) => setNewAuctionEndTime(event.target.value)}
                          className="ui-focus rounded-md border border-cyan-200 bg-white px-3 py-2 text-sm"
                          title="Hora de cierre"
                        />
                        <button
                          type="button"
                          onClick={() => createUpcomingAuction(newAuctionEventType)}
                          className="ui-focus rounded-md border border-cyan-300 bg-white px-3 py-2 text-sm font-semibold text-cyan-700 transition hover:bg-cyan-50"
                        >
                          {newAuctionEventType === "venta_directa" ? "Crear venta directa" : "Crear remate"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!newAuctionName.trim() || !newAuctionDate.trim() || !newAuctionStartTime.trim() || !newAuctionEndTime.trim()) {
                              showSystemNotice(
                                "error",
                                newAuctionEventType === "venta_directa" ? "Venta directa incompleta" : "Remate incompleto",
                                `Ingresa nombre, fecha, hora de inicio y cierre para crear ${
                                  newAuctionEventType === "venta_directa" ? "la venta directa" : "el remate"
                                }.`,
                              );
                              return;
                            }
                            createUpcomingAuction(newAuctionEventType);
                            setShowCreateCategoryForm(false);
                          }}
                          className="ui-focus rounded-md bg-cyan-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500"
                        >
                          Crear y cerrar
                        </button>
                      </>
                    ) : (
                      <>
                        <input
                          value={newCategoryName}
                          onChange={(event) => setNewCategoryName(event.target.value)}
                          placeholder="Nombre categoría"
                          className="ui-focus rounded-md border border-cyan-200 bg-white px-3 py-2 text-sm"
                        />
                        <input
                          value={newCategoryDescription}
                          onChange={(event) => setNewCategoryDescription(event.target.value)}
                          placeholder="Descripción categoría"
                          className="ui-focus rounded-md border border-cyan-200 bg-white px-3 py-2 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => createManagedCategory(false)}
                          className="ui-focus rounded-md border border-cyan-300 bg-white px-3 py-2 text-sm font-semibold text-cyan-700 transition hover:bg-cyan-50"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          onClick={() => createManagedCategory(true)}
                          className="ui-focus rounded-md bg-cyan-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500"
                        >
                          Agregar unidades
                        </button>
                      </>
                    )}
                  </div>
                ) : null}

                <div className="mt-3 space-y-2">
                  <div className="hidden gap-2 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 md:grid md:grid-cols-[minmax(170px,1fr)_72px_228px]">
                    <span>Grupo</span>
                    <span className="text-center">Unidades</span>
                    <span className="text-right">Acciones</span>
                  </div>

                  {([
                    {
                      title: "Remates",
                      empty: "No hay remates creados.",
                      auctions: sortedRemateAuctions,
                    },
                    {
                      title: "Ventas Directas",
                      empty: "No hay ventas directas creadas.",
                      auctions: sortedVentaDirectaAuctions,
                    },
                  ]).map((group) => (
                    <div key={group.title} className="space-y-2">
                      <p className="px-2 pt-2 text-[11px] font-semibold uppercase tracking-wide text-indigo-600">
                        {group.title}
                      </p>
                      {group.auctions.length === 0 &&
                      !(group.title === "Ventas Directas" && ventaDirectaInventoryOnlyCount > 0) ? (
                        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-500">
                          {group.empty}
                        </div>
                      ) : (
                        <>
                        {group.auctions.map((auction) => {
                          const count = Object.values(config.vehicleUpcomingAuctionIds).filter(
                            (id) => id === auction.id,
                          ).length;
                          const auctionHidden = hiddenHomeCategoryIds.has(auctionCategoryKey(auction.id));
                          const auctionOrigin = getAuctionEventOrigin(auction);
                          return (
                            <article
                              key={auction.id}
                              className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50/30 px-2.5 py-2 md:grid-cols-[minmax(170px,1fr)_72px_228px] md:items-center"
                            >
                              <div className="min-h-8 md:flex md:items-center">
                                <div className="flex items-center gap-2">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                                    {auction.name}
                                  </p>
                                  <span
                                    className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${auctionOriginClass(auctionOrigin)}`}
                                    title={auctionOriginLabel(auctionOrigin)}
                                  >
                                    {auctionOriginLabel(auctionOrigin)}
                                  </span>
                                </div>
                              </div>
                              <div className="mx-auto flex h-8 w-14 items-center justify-center rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700">
                                {count}
                              </div>
                              <div className="flex items-center justify-end gap-1.5 md:w-56">
                                <button
                                  type="button"
                                  onClick={() =>
                                    toggleCategoryHidden(auctionCategoryKey(auction.id), auction.name)
                                  }
                                  className={`ui-focus inline-flex h-8 w-8 items-center justify-center rounded border transition ${
                                    auctionHidden
                                      ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                                  }`}
                                  aria-label={`${auctionHidden ? "Mostrar" : "Ocultar"} ${auction.name} en home`}
                                  title={auctionHidden ? "Mostrar en home" : "Ocultar del home"}
                                >
                                  {auctionHidden ? (
                                    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                                      <path d="M10 4c3.38 0 6.63 2 8.37 5.42a1.3 1.3 0 0 1 0 1.16C16.63 14 13.38 16 10 16s-6.63-2-8.37-5.42a1.3 1.3 0 0 1 0-1.16C3.37 6 6.62 4 10 4Zm0 2c-2.6 0-5.16 1.5-6.71 4 .01.02.02.04.03.05C4.84 12.5 7.4 14 10 14s5.16-1.5 6.71-4a.63.63 0 0 0-.03-.05C15.16 7.5 12.6 6 10 6Zm0 1.75A2.25 2.25 0 1 1 10 12.25 2.25 2.25 0 0 1 10 7.75Z" />
                                    </svg>
                                  ) : (
                                    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                                      <path d="M10 4c3.38 0 6.63 2 8.37 5.42a1.3 1.3 0 0 1 0 1.16C16.63 14 13.38 16 10 16c-1.72 0-3.42-.52-4.95-1.5l1.5-1.5c1.06.63 2.24.97 3.45.97 2.6 0 5.16-1.5 6.71-4a.63.63 0 0 0-.03-.05C15.16 7.5 12.6 6 10 6c-1.2 0-2.38.34-3.43.96L5.1 5.49A9.85 9.85 0 0 1 10 4Zm7.2 13.6a.75.75 0 0 1-1.06 0l-13-13a.75.75 0 1 1 1.06-1.06l13 13a.75.75 0 0 1 0 1.06ZM10 7.75c.7 0 1.33.32 1.75.83L8.58 11.75A2.25 2.25 0 0 1 10 7.75Z" />
                                    </svg>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    openGroupManageModal({ type: "auction", auctionId: auction.id })
                                  }
                                  className="ui-focus inline-flex h-8 w-8 items-center justify-center rounded border border-cyan-300 bg-cyan-50 text-cyan-700"
                                  aria-label={`Ver y gestionar ${auction.name}`}
                                  title="Ver y gestionar"
                                >
                                  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                                    <path d="M10 4c4.5 0 7.8 3.16 8.9 5.5.13.28.13.62 0 .9C17.8 12.74 14.5 15.9 10 15.9S2.2 12.74 1.1 10.4a1.06 1.06 0 0 1 0-.9C2.2 7.16 5.5 4 10 4Zm0 2c-3.42 0-6.06 2.31-7.08 4 .99 1.69 3.64 4 7.08 4s6.09-2.31 7.08-4C16.06 8.31 13.42 6 10 6Zm0 1.5A2.5 2.5 0 1 1 7.5 10 2.5 2.5 0 0 1 10 7.5Z" />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openBatchAssignModal({ type: "auction", auctionId: auction.id })}
                                  className="ui-focus inline-flex h-8 w-8 items-center justify-center rounded border border-emerald-300 bg-emerald-50 text-emerald-700"
                                  aria-label={`Agregar unidades a ${auction.name}`}
                                  title="Agregar unidades"
                                >
                                  +
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFinalizeAuctionId(auction.id);
                                    setFinalizeAuctionSearchTerm("");
                                    setFinalizeSoldVehicleKeys([]);
                                  }}
                                  className="ui-focus inline-flex h-8 w-8 items-center justify-center rounded border border-amber-300 bg-amber-50 text-amber-700"
                                  aria-label={`Finalizar remate ${auction.name}`}
                                  title="Finalizar remate"
                                >
                                  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                                    <path fillRule="evenodd" d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.2 7.25a1 1 0 0 1-1.42.001l-3-3.015a1 1 0 1 1 1.418-1.41l2.29 2.3 6.49-6.534a1 1 0 0 1 1.416-.006Z" clipRule="evenodd" />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeUpcomingAuction(auction.id)}
                                  className="ui-focus inline-flex h-8 w-8 items-center justify-center rounded border border-rose-300 bg-rose-50 text-rose-700"
                                  aria-label={`Quitar ${auction.name}`}
                                  title="Quitar"
                                >
                                  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                                    <path d="M7 2.5A1.5 1.5 0 0 0 5.5 4v.5H3.75a.75.75 0 0 0 0 1.5h.56l.75 9.02A2 2 0 0 0 7.06 17h5.88a2 2 0 0 0 1.99-1.98l.75-9.02h.57a.75.75 0 0 0 0-1.5H14.5V4A1.5 1.5 0 0 0 13 2.5H7Zm6 .5a.5.5 0 0 1 .5.5v.5h-7V3.5a.5.5 0 0 1 .5-.5h6ZM8 8.25a.75.75 0 0 1 1.5 0v5a.75.75 0 0 1-1.5 0v-5Zm3 0a.75.75 0 0 1 1.5 0v5a.75.75 0 0 1-1.5 0v-5Z" />
                                  </svg>
                                </button>
                              </div>
                            </article>
                          );
                        })}
                        {group.title === "Ventas Directas" && ventaDirectaInventoryOnlyCount > 0 ? (
                          <article className="grid grid-cols-1 gap-2 rounded-lg border border-emerald-200 bg-emerald-50/40 px-2.5 py-2 md:grid-cols-[minmax(170px,1fr)_72px_228px] md:items-center">
                            <div className="min-h-8 md:flex md:items-center">
                              <div className="flex items-center gap-2">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                                  Ventas directas (inventario)
                                </p>
                                <span
                                  className="shrink-0 rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800"
                                  title="Unidades con estado en bodega a venta directa o asignadas a la sección sin evento comercial"
                                >
                                  Origen: Inventario
                                </span>
                              </div>
                            </div>
                            <div className="mx-auto flex h-8 w-14 items-center justify-center rounded-md border border-emerald-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700">
                              {ventaDirectaInventoryOnlyCount}
                            </div>
                            <div className="flex items-center justify-end gap-1.5 md:w-56">
                              <button
                                type="button"
                                onClick={() =>
                                  toggleCategoryHidden("section:ventas-directas", "Ventas directas")
                                }
                                className={`ui-focus inline-flex h-8 w-8 items-center justify-center rounded border transition ${
                                  hiddenHomeCategoryIds.has("section:ventas-directas")
                                    ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                                }`}
                                aria-label="Mostrar u ocultar ventas directas de inventario en home"
                                title={
                                  hiddenHomeCategoryIds.has("section:ventas-directas")
                                    ? "Mostrar en home"
                                    : "Ocultar del home"
                                }
                              >
                                {hiddenHomeCategoryIds.has("section:ventas-directas") ? (
                                  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                                    <path d="M10 4c3.38 0 6.63 2 8.37 5.42a1.3 1.3 0 0 1 0 1.16C16.63 14 13.38 16 10 16s-6.63-2-8.37-5.42a1.3 1.3 0 0 1 0-1.16C3.37 6 6.62 4 10 4Zm0 2c-2.6 0-5.16 1.5-6.71 4 .01.02.02.04.03.05C4.84 12.5 7.4 14 10 14s5.16-1.5 6.71-4a.63.63 0 0 0-.03-.05C15.16 7.5 12.6 6 10 6Zm0 1.75A2.25 2.25 0 1 1 10 12.25 2.25 2.25 0 0 1 10 7.75Z" />
                                  </svg>
                                ) : (
                                  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                                    <path d="M10 4c3.38 0 6.63 2 8.37 5.42a1.3 1.3 0 0 1 0 1.16C16.63 14 13.38 16 10 16c-1.72 0-3.42-.52-4.95-1.5l1.5-1.5c1.06.63 2.24.97 3.45.97 2.6 0 5.16-1.5 6.71-4a.63.63 0 0 0-.03-.05C15.16 7.5 12.6 6 10 6c-1.2 0-2.38.34-3.43.96L5.1 5.49A9.85 9.85 0 0 1 10 4Zm7.2 13.6a.75.75 0 0 1-1.06 0l-13-13a.75.75 0 1 1 1.06-1.06l13 13a.75.75 0 0 1 0 1.06ZM10 7.75c.7 0 1.33.32 1.75.83L8.58 11.75A2.25 2.25 0 0 1 10 7.75Z" />
                                  </svg>
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  openGroupManageModal({ type: "section", sectionId: "ventas-directas" })
                                }
                                className="ui-focus inline-flex h-8 w-8 items-center justify-center rounded border border-cyan-300 bg-cyan-50 text-cyan-700"
                                aria-label="Ver y gestionar ventas directas de inventario"
                                title="Ver y gestionar"
                              >
                                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                                  <path d="M10 4c4.5 0 7.8 3.16 8.9 5.5.13.28.13.62 0 .9C17.8 12.74 14.5 15.9 10 15.9S2.2 12.74 1.1 10.4a1.06 1.06 0 0 1 0-.9C2.2 7.16 5.5 4 10 4Zm0 2c-3.42 0-6.06 2.31-7.08 4 .99 1.69 3.64 4 7.08 4s6.09-2.31 7.08-4C16.06 8.31 13.42 6 10 6Zm0 1.5A2.5 2.5 0 1 1 7.5 10 2.5 2.5 0 0 1 10 7.5Z" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  openBatchAssignModal({ type: "section", sectionId: "ventas-directas" })
                                }
                                className="ui-focus inline-flex h-8 w-8 items-center justify-center rounded border border-emerald-300 bg-emerald-50 text-emerald-700"
                                aria-label="Agregar unidades a ventas directas de inventario"
                                title="Agregar unidades"
                              >
                                +
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setFinalizeAuctionId(DEFAULT_VENTA_DIRECTA_EVENT_ID);
                                  setFinalizeAuctionSearchTerm("");
                                  setFinalizeSoldVehicleKeys([]);
                                }}
                                className="ui-focus inline-flex h-8 w-8 items-center justify-center rounded border border-amber-300 bg-amber-50 text-amber-700"
                                aria-label="Finalizar ventas directas de inventario"
                                title="Finalizar venta directa"
                              >
                                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                                  <path fillRule="evenodd" d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.2 7.25a1 1 0 0 1-1.42.001l-3-3.015a1 1 0 1 1 1.418-1.41l2.29 2.3 6.49-6.534a1 1 0 0 1 1.416-.006Z" clipRule="evenodd" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => clearVentaDirectaInventoryGroup()}
                                className="ui-focus inline-flex h-8 w-8 items-center justify-center rounded border border-rose-300 bg-rose-50 text-rose-700"
                                aria-label="Quitar asignaciones de ventas directas de inventario"
                                title="Quitar"
                              >
                                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                                  <path d="M7 2.5A1.5 1.5 0 0 0 5.5 4v.5H3.75a.75.75 0 0 0 0 1.5h.56l.75 9.02A2 2 0 0 0 7.06 17h5.88a2 2 0 0 0 1.99-1.98l.75-9.02h.57a.75.75 0 0 0 0-1.5H14.5V4A1.5 1.5 0 0 0 13 2.5H7Zm6 .5a.5.5 0 0 1 .5.5v.5h-7V3.5a.5.5 0 0 1 .5-.5h6ZM8 8.25a.75.75 0 0 1 1.5 0v5a.75.75 0 0 1-1.5 0v-5Zm3 0a.75.75 0 0 1 1.5 0v5a.75.75 0 0 1-1.5 0v-5Z" />
                                </svg>
                              </button>
                            </div>
                          </article>
                        ) : null}
                        </>
                      )}
                    </div>
                  ))}

                  <p className="px-2 pt-2 text-[11px] font-semibold uppercase tracking-wide text-indigo-600">
                    Categorías personalizadas
                  </p>
                  {(config.managedCategories ?? []).length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-500">
                      No hay categorías personalizadas aún.
                    </div>
                  ) : (
                    (config.managedCategories ?? []).map((category) => {
                      const categoryHidden = hiddenHomeCategoryIds.has(managedCategoryKey(category.id));
                      return (
                        <article
                          key={category.id}
                          className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50/30 px-2.5 py-2 md:grid-cols-[minmax(170px,1fr)_72px_228px] md:items-center"
                        >
                          <input
                            value={category.name}
                            onChange={(event) =>
                              updateManagedCategory(category.id, { name: event.target.value })
                            }
                            className="ui-focus rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-semibold"
                          />
                          <div className="mx-auto flex h-8 w-14 items-center justify-center rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700">
                            {category.vehicleIds.length}
                          </div>
                          <div className="flex items-center justify-end gap-1.5 md:w-56">
                            <button
                              type="button"
                              onClick={() =>
                                toggleCategoryHidden(managedCategoryKey(category.id), category.name)
                              }
                              className={`ui-focus inline-flex h-8 w-8 items-center justify-center rounded border transition ${
                                categoryHidden
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                              }`}
                              aria-label={`${categoryHidden ? "Mostrar" : "Ocultar"} ${category.name} en home`}
                              title={categoryHidden ? "Mostrar en home" : "Ocultar del home"}
                            >
                              {categoryHidden ? (
                                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                                  <path d="M10 4c3.38 0 6.63 2 8.37 5.42a1.3 1.3 0 0 1 0 1.16C16.63 14 13.38 16 10 16s-6.63-2-8.37-5.42a1.3 1.3 0 0 1 0-1.16C3.37 6 6.62 4 10 4Zm0 2c-2.6 0-5.16 1.5-6.71 4 .01.02.02.04.03.05C4.84 12.5 7.4 14 10 14s5.16-1.5 6.71-4a.63.63 0 0 0-.03-.05C15.16 7.5 12.6 6 10 6Zm0 1.75A2.25 2.25 0 1 1 10 12.25 2.25 2.25 0 0 1 10 7.75Z" />
                                </svg>
                              ) : (
                                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                                  <path d="M10 4c3.38 0 6.63 2 8.37 5.42a1.3 1.3 0 0 1 0 1.16C16.63 14 13.38 16 10 16c-1.72 0-3.42-.52-4.95-1.5l1.5-1.5c1.06.63 2.24.97 3.45.97 2.6 0 5.16-1.5 6.71-4a.63.63 0 0 0-.03-.05C15.16 7.5 12.6 6 10 6c-1.2 0-2.38.34-3.43.96L5.1 5.49A9.85 9.85 0 0 1 10 4Zm7.2 13.6a.75.75 0 0 1-1.06 0l-13-13a.75.75 0 1 1 1.06-1.06l13 13a.75.75 0 0 1 0 1.06ZM10 7.75c.7 0 1.33.32 1.75.83L8.58 11.75A2.25 2.25 0 0 1 10 7.75Z" />
                                </svg>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAssignCategoryId(category.id);
                                setAssignSearchTerm("");
                              }}
                              className="ui-focus inline-flex h-8 w-8 items-center justify-center rounded border border-cyan-300 bg-cyan-50 text-cyan-700"
                              aria-label={`Asignar vehículos a ${category.name}`}
                              title="Asignar vehículos"
                            >
                              +
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteManagedCategory(category.id)}
                              className="ui-focus inline-flex h-8 w-8 items-center justify-center rounded border border-rose-300 bg-rose-50 text-rose-700"
                              aria-label={`Eliminar ${category.name}`}
                              title="Eliminar"
                            >
                              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                                <path d="M7 2.5A1.5 1.5 0 0 0 5.5 4v.5H3.75a.75.75 0 0 0 0 1.5h.56l.75 9.02A2 2 0 0 0 7.06 17h5.88a2 2 0 0 0 1.99-1.98l.75-9.02h.57a.75.75 0 0 0 0-1.5H14.5V4A1.5 1.5 0 0 0 13 2.5H7Zm6 .5a.5.5 0 0 1 .5.5v.5h-7V3.5a.5.5 0 0 1 .5-.5h6ZM8 8.25a.75.75 0 0 1 1.5 0v5a.75.75 0 0 1-1.5 0v-5Zm3 0a.75.75 0 0 1 1.5 0v5a.75.75 0 0 1-1.5 0v-5Z" />
                              </svg>
                            </button>
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </div>
            ) : null}

            {adminTab === "layout" ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Constructor del Home
                    </p>
                    <h4 className="text-base font-bold text-slate-900">
                      Simulación del home (edición directa)
                    </h4>
                    <p className="mt-1 text-sm text-slate-600">
                      Todo se edita desde esta única vista: textos HTML, visibilidad de bloques y orden de secciones.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={resetHomeLayoutToDefault}
                      className="ui-focus rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                    >
                      Restaurar base
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Simulación del home (tiempo real)
                    </p>
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                      Auto guardado activo
                    </span>
                  </div>

                  <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                    <div
                      className={`rounded-lg border p-3 ${
                        config.homeLayout.heroTheme === "indigo"
                          ? "border-indigo-200 bg-indigo-50"
                          : config.homeLayout.heroTheme === "slate"
                            ? "border-slate-300 bg-slate-100"
                            : "border-cyan-200 bg-cyan-50"
                      }`}
                    >
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Hero editable (admite HTML)
                      </p>
                      <div className="grid gap-2">
                        <div className="rounded-md border border-slate-300 bg-white p-2">
                          <div className="mb-2 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2">
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                              <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 font-semibold">
                                Editor: {activeHeroRichEditor === "title" ? "Título" : "Subtítulo"}
                              </span>
                              <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 font-semibold">
                                Fuente: {heroToolbarState.fontFamily}
                              </span>
                              <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 font-semibold">
                                Tamaño: {heroToolbarState.fontSize}
                              </span>
                              <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 font-semibold">
                                Formato: {heroToolbarState.formatBlock.toUpperCase()}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <select
                                value={heroToolbarState.formatBlock}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  if (value === "p") runHeroHtmlCommand("formatBlock", "<p>");
                                  if (value === "h2") runHeroHtmlCommand("formatBlock", "<h2>");
                                  if (value === "h3") runHeroHtmlCommand("formatBlock", "<h3>");
                                }}
                                className="ui-focus rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                                title="Tipo de bloque"
                              >
                                <option value="p">Párrafo</option>
                                <option value="h2">Título H2</option>
                                <option value="h3">Subtítulo H3</option>
                              </select>
                              <select
                                value={heroToolbarState.fontFamily}
                                onChange={(event) => runHeroHtmlCommand("fontName", event.target.value)}
                                className="ui-focus rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                                title="Fuente del texto"
                              >
                                {["Inter", "Arial", "Georgia", "Times New Roman", "Courier New"].includes(heroToolbarState.fontFamily) ? null : (
                                  <option value={heroToolbarState.fontFamily}>{heroToolbarState.fontFamily}</option>
                                )}
                                <option value="Inter">Inter</option>
                                <option value="Arial">Arial</option>
                                <option value="Georgia">Georgia</option>
                                <option value="Times New Roman">Times New Roman</option>
                                <option value="Courier New">Courier New</option>
                              </select>
                              <button type="button" onClick={() => runHeroHtmlCommand("bold")} className={heroToolbarButtonClass(heroToolbarState.bold)} title="Negrita">B</button>
                              <button type="button" onClick={() => runHeroHtmlCommand("italic")} className={heroToolbarButtonClass(heroToolbarState.italic)} title="Cursiva">I</button>
                              <button type="button" onClick={() => runHeroHtmlCommand("underline")} className={heroToolbarButtonClass(heroToolbarState.underline)} title="Subrayado">U</button>
                              <button type="button" onClick={() => runHeroHtmlCommand("justifyLeft")} className={heroToolbarButtonClass(heroToolbarState.align === "left")} title="Alinear izquierda">↤</button>
                              <button type="button" onClick={() => runHeroHtmlCommand("justifyCenter")} className={heroToolbarButtonClass(heroToolbarState.align === "center")} title="Centrar">↔</button>
                              <button type="button" onClick={() => runHeroHtmlCommand("justifyRight")} className={heroToolbarButtonClass(heroToolbarState.align === "right")} title="Alinear derecha">↦</button>
                              <button type="button" onClick={() => runHeroHtmlCommand("insertUnorderedList")} className={heroToolbarButtonClass(heroToolbarState.unorderedList)}>Lista •</button>
                              <button type="button" onClick={() => runHeroHtmlCommand("insertOrderedList")} className={heroToolbarButtonClass(heroToolbarState.orderedList)}>Lista 1.</button>
                              <label className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700">
                                Color
                                <input
                                  type="color"
                                  value={heroToolbarState.foreColor}
                                  onChange={(event) => runHeroHtmlCommand("foreColor", event.target.value)}
                                  className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0"
                                />
                              </label>
                              <label className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700">
                                Fondo
                                <input
                                  type="color"
                                  value={heroToolbarState.hiliteColor}
                                  onChange={(event) => runHeroHtmlCommand("hiliteColor", event.target.value)}
                                  className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0"
                                />
                              </label>
                              <button
                                type="button"
                                onClick={() => {
                                  const url = typeof window !== "undefined"
                                    ? window.prompt("URL del enlace (https://...)")
                                    : null;
                                  if (url?.trim()) runHeroHtmlCommand("createLink", url.trim());
                                }}
                                className={heroToolbarButtonClass(false)}
                              >
                                Enlace
                              </button>
                              <button type="button" onClick={() => runHeroHtmlCommand("unlink")} className={heroToolbarButtonClass(false)}>Quitar enlace</button>
                              <button type="button" onClick={() => runHeroHtmlCommand("undo")} className={heroToolbarButtonClass(false)}>↶</button>
                              <button type="button" onClick={() => runHeroHtmlCommand("redo")} className={heroToolbarButtonClass(false)}>↷</button>
                              <button type="button" onClick={() => runHeroHtmlCommand("removeFormat")} className={heroToolbarButtonClass(false)}>Limpiar</button>
                            </div>
                          </div>
                          <input
                            value={config.homeLayout.heroKicker}
                            onChange={(event) => setHomeLayout("heroKicker", event.target.value)}
                            placeholder="Kicker"
                            className={`ui-focus mb-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] ${
                              config.homeLayout.heroTheme === "indigo"
                                ? "text-indigo-700"
                                : config.homeLayout.heroTheme === "slate"
                                  ? "text-slate-700"
                                  : "text-cyan-700"
                            }`}
                          />
                          <div className="mb-2 rounded-md border border-slate-200 bg-slate-50 p-2">
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Título</p>
                            <div
                              ref={heroTitleEditorRef}
                              contentEditable
                              suppressContentEditableWarning
                              onFocus={() => {
                                setActiveHeroRichEditor("title");
                                syncHeroToolbarState();
                              }}
                              onInput={(event) => {
                                setHomeLayout("heroTitle", event.currentTarget.innerHTML);
                                syncHeroToolbarState();
                              }}
                              className="ui-focus w-full min-h-12 rounded-md border border-slate-300 bg-white px-3 py-2 text-3xl font-black leading-tight text-slate-900 md:text-[2.7rem] [&_a]:text-cyan-700 [&_a]:underline [&_b]:font-black [&_strong]:font-black [&_em]:italic [&_i]:italic [&_u]:underline"
                            />
                          </div>
                          <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Subtítulo</p>
                            <div
                              ref={heroSubtitleEditorRef}
                              contentEditable
                              suppressContentEditableWarning
                              onFocus={() => {
                                setActiveHeroRichEditor("subtitle");
                                syncHeroToolbarState();
                              }}
                              onInput={(event) => {
                                setHomeLayout("heroDescription", event.currentTarget.innerHTML);
                                syncHeroToolbarState();
                              }}
                              className="ui-focus w-full min-h-20 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed text-slate-600 md:text-[15px] [&_a]:text-cyan-700 [&_a]:underline [&_b]:font-bold [&_strong]:font-bold [&_em]:italic [&_i]:italic [&_u]:underline [&_li]:ml-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_p]:mb-2"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Orden de secciones (arrastrar y soltar)
                      </p>
                      <div className="space-y-2">
                        {resolvedHomeSectionOrder.map((sectionId) => {
                          const label = isBaseHomeSectionOrderId(sectionId)
                            ? SECTION_LABELS[sectionId]
                            : managedCategoryOrderLabelById.get(sectionId) ?? "Categoría personalizada";
                          const count = homeSectionCountById.get(sectionId) ?? 0;
                          const isDragging = draggedLayoutSectionId === sectionId;
                          return (
                            <button
                              key={`layout-sort-${sectionId}`}
                              type="button"
                              draggable
                              onDragStart={() => setDraggedLayoutSectionId(sectionId)}
                              onDragEnd={() => setDraggedLayoutSectionId(null)}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={(event) => {
                                event.preventDefault();
                                if (!draggedLayoutSectionId) return;
                                reorderHomeSectionOrder(draggedLayoutSectionId, sectionId);
                                setDraggedLayoutSectionId(null);
                              }}
                              className={`ui-focus flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition ${
                                isDragging
                                  ? "border-cyan-400 bg-cyan-100 text-cyan-900"
                                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                              }`}
                            >
                              <span className="inline-flex items-center gap-2">
                                <span aria-hidden="true" className="text-base leading-none text-slate-400">⋮⋮</span>
                                <span className="font-semibold">{label}</span>
                              </span>
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold">
                                {count}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {adminTab === "analytics" ? (
              <AnalyticsDashboard />
            ) : null}
            {adminTab === "ofertas" ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Ofertas recibidas
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Tabla dinámica con filtros por vehículo, cliente y fecha. Puedes buscar en cualquier columna.
                  </p>
                  <div className="relative mt-3 flex flex-wrap items-center gap-2">
                    <input
                      value={offersSearch}
                      onChange={(event) => setOffersSearch(event.target.value)}
                      placeholder="Buscar en tabla..."
                      className="ui-focus min-w-[16rem] flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOffersFiltersMenu((prev) => !prev)}
                      className="ui-focus inline-flex h-9 items-center justify-center gap-1 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                      aria-label="Abrir filtros de ofertas"
                      title="Filtros"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        aria-hidden="true"
                      >
                        <path d="M3 5h18M6 12h12M10 19h4" strokeLinecap="round" />
                      </svg>
                      <span>Filtros</span>
                      {offersFiltersActiveCount > 0 ? (
                        <span className="rounded-full bg-cyan-600 px-1.5 py-0.5 text-[10px] text-white">
                          {offersFiltersActiveCount}
                        </span>
                      ) : null}
                    </button>
                    <div className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700">
                      {formatCompactNumber(offersFilteredRows.length)} resultado(s)
                    </div>
                    {showOffersFiltersMenu ? (
                      <div className="absolute right-0 top-full z-20 mt-2 w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Filtros avanzados
                        </p>
                        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                          <select
                            value={offersSearchField}
                            onChange={(event) =>
                              setOffersSearchField(event.target.value as OfferFilterField)
                            }
                            className="ui-focus rounded-md border border-slate-300 bg-white px-3 py-2 text-xs"
                          >
                            <option value="all">Buscar en todas las columnas</option>
                            <option value="vehicleTitle">Vehículo</option>
                            <option value="patent">Patente</option>
                            <option value="customerName">Cliente</option>
                            <option value="customerEmail">Mail</option>
                            <option value="customerPhone">Teléfono</option>
                          </select>
                          <select
                            value={offersVehicleFilter}
                            onChange={(event) => setOffersVehicleFilter(event.target.value)}
                            className="ui-focus rounded-md border border-slate-300 bg-white px-3 py-2 text-xs"
                          >
                            <option value="all">Todos los vehículos</option>
                            {offersVehicleOptions.map((vehicle) => (
                              <option key={`offer-vehicle-${vehicle}`} value={vehicle}>
                                {vehicle}
                              </option>
                            ))}
                          </select>
                          <select
                            value={offersClientFilter}
                            onChange={(event) => setOffersClientFilter(event.target.value)}
                            className="ui-focus rounded-md border border-slate-300 bg-white px-3 py-2 text-xs"
                          >
                            <option value="all">Todos los clientes</option>
                            {offersClientOptions.map((client) => (
                              <option key={`offer-client-${client}`} value={client}>
                                {client}
                              </option>
                            ))}
                          </select>
                          <input
                            type="date"
                            value={offersDateFrom}
                            onChange={(event) => setOffersDateFrom(event.target.value)}
                            className="ui-focus rounded-md border border-slate-300 bg-white px-3 py-2 text-xs"
                          />
                          <input
                            type="date"
                            value={offersDateTo}
                            onChange={(event) => setOffersDateTo(event.target.value)}
                            className="ui-focus rounded-md border border-slate-300 bg-white px-3 py-2 text-xs"
                          />
                        </div>
                        <div className="mt-3 flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setOffersSearch("");
                              setOffersSearchField("all");
                              setOffersVehicleFilter("all");
                              setOffersClientFilter("all");
                              setOffersDateFrom("");
                              setOffersDateTo("");
                            }}
                            className="ui-focus rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700"
                          >
                            Limpiar filtros
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowOffersFiltersMenu(false)}
                            className="ui-focus rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                          >
                            Cerrar
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
                  {offersLoading ? (
                    <p className="p-4 text-sm text-slate-500">Cargando ofertas...</p>
                  ) : offersError ? (
                    <p className="p-4 text-sm text-rose-700">{offersError}</p>
                  ) : offersFilteredRows.length === 0 ? (
                    <p className="p-4 text-sm text-slate-500">No hay ofertas para los filtros actuales.</p>
                  ) : (
                    <table className="min-w-[1320px] w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          {[
                            "Fecha",
                            "Patente",
                            "Vehículo",
                            "Cliente",
                            "Mail",
                            "Teléfono",
                            "Oferta",
                            "Referencial",
                            "Diferencia",
                            " ",
                          ].map((label) => (
                            <th key={`offers-head-${label}`} className="whitespace-nowrap border-b border-slate-200 px-3 py-2 font-semibold">
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {offersFilteredRows.map((row) => {
                          const diff = row.offerAmount - row.referencePrice;
                          return (
                            <tr key={row.id} className="border-b border-slate-100 align-top">
                              <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                                {row.createdAt ? new Date(row.createdAt).toLocaleString("es-CL") : "—"}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-800">{row.patent || "—"}</td>
                              <td className="min-w-64 px-3 py-2 text-slate-800">{row.vehicleTitle || "—"}</td>
                              <td className="whitespace-nowrap px-3 py-2 text-slate-700">{row.customerName || "—"}</td>
                              <td className="whitespace-nowrap px-3 py-2 text-slate-700">{row.customerEmail || "—"}</td>
                              <td className="whitespace-nowrap px-3 py-2 text-slate-700">{row.customerPhone || "—"}</td>
                              <td className="whitespace-nowrap px-3 py-2 font-semibold text-cyan-700">
                                {formatCurrencyAmount(row.offerAmount)}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                                {formatCurrencyAmount(row.referencePrice)}
                              </td>
                              <td
                                className={`whitespace-nowrap px-3 py-2 font-semibold ${
                                  diff >= 0 ? "text-emerald-700" : "text-rose-700"
                                }`}
                              >
                                {formatSignedCurrencyAmount(diff)}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2 text-right">
                                <button
                                  type="button"
                                  onClick={() => {
                                    void handleDeleteOffer(row);
                                  }}
                                  disabled={deletingOfferId !== null}
                                  aria-label={`Eliminar oferta de ${row.customerName || "cliente"}`}
                                  title="Eliminar oferta"
                                  className="ui-focus inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-300 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  {deletingOfferId === row.id ? (
                                    <span className="text-[11px] font-semibold">...</span>
                                  ) : (
                                    <svg
                                      viewBox="0 0 20 20"
                                      fill="none"
                                      className="h-3.5 w-3.5"
                                      aria-hidden="true"
                                    >
                                      <path
                                        d="M5 5L15 15M15 5L5 15"
                                        stroke="currentColor"
                                        strokeWidth="1.8"
                                        strokeLinecap="round"
                                      />
                                    </svg>
                                  )}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {showPublicHome ? (
        <>
      {isBootstrapping ? (
        <section className="relative z-10 mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8" aria-hidden="true">
          <div className="glass-soft rounded-xl p-4">
            <div className="mb-3 h-10 animate-pulse rounded-md bg-slate-200" />
            <div className="flex justify-end gap-2">
              <div className="h-9 w-28 animate-pulse rounded-lg bg-slate-200" />
              <div className="h-9 w-9 animate-pulse rounded-lg bg-slate-200" />
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={`skeleton-card-${index}`}
                className="h-72 animate-pulse rounded-2xl border border-slate-200 bg-slate-100"
              />
            ))}
          </div>
        </section>
      ) : null}
      {config.homeLayout.showSearchBar ? (
      <>
      <section className="relative z-50 mx-auto w-full max-w-7xl px-3 pt-3 pb-2 sm:px-6 lg:px-8">
        <div className="glass-soft overflow-visible rounded-2xl border border-slate-300/80 bg-white/95 p-3 shadow-md md:p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="w-full">
              <HomeInventorySearch
                value={homeSearchTerm}
                onChange={(value) => {
                  setHomeSearchTerm(value);
                  trackEvent("home_search_change", { query: value });
                }}
                onClear={() => {
                  setHomeSearchTerm("");
                  trackEvent("home_search_clear");
                }}
                showPatents={showPatents}
                ariaLabel={
                  showPatents
                    ? "Buscar vehículos por patente, marca, modelo o categoría"
                    : "Buscar vehículos por marca, modelo o categoría"
                }
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <button
                type="button"
                onClick={() => {
                  void downloadVisibleCalendarPdf();
                }}
                disabled={isDownloadingCalendarPdf}
                className={`ui-focus inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                  isDownloadingCalendarPdf
                    ? "cursor-wait border-slate-300 bg-slate-100 text-slate-500"
                    : "border-cyan-300 bg-cyan-50 text-cyan-800 hover:bg-cyan-100"
                }`}
                title="Descargar PDF profesional del calendario visible"
              >
                <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
                  <path d="M10 3.5v8m0 0l-3-3m3 3l3-3M4.5 13.5v2h11v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {isDownloadingCalendarPdf ? "Generando PDF..." : "PDF Catalogo"}
              </button>
              {config.homeLayout.showSortSelector || config.homeLayout.showQuickFilters ? (
                <div className="relative" ref={homeFiltersMenuRef}>
                  <button
                    type="button"
                    onClick={() => setShowHomeFiltersMenu((prev) => !prev)}
                    className="ui-focus relative flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    aria-label="Abrir filtros y orden"
                    aria-expanded={showHomeFiltersMenu}
                    title="Filtros y orden"
                  >
                    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
                      <path d="M4 5h12M6 10h8M8 15h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                    {activeHomeFilterCount > 0 ? (
                      <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-slate-800 px-1 text-[10px] font-bold text-white">
                        {activeHomeFilterCount}
                      </span>
                    ) : null}
                  </button>
                  {showHomeFiltersMenu ? (
                    <div className="absolute right-0 z-50 mt-2 hidden w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl md:block">
                      {renderHomeFiltersContent({ closeOnSortSelect: true, mobile: false })}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <span className="sr-only" aria-live="polite">
                {homeVisibleItems.length} resultados encontrados en catálogo.
              </span>
            </div>
          </div>
        </div>
      </section>
      {showHomeFiltersMenu &&
      (config.homeLayout.showSortSelector || config.homeLayout.showQuickFilters) ? (
        <div
          className="fixed inset-0 z-[220] flex flex-col bg-white md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Filtros y orden del catálogo"
        >
          <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <button
              type="button"
              onClick={closeHomeFiltersMenu}
              className="ui-focus inline-flex min-w-[4.5rem] items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
                <path
                  d="M12.5 4.5L7 10l5.5 5.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Atrás
            </button>
            <h2 className="flex-1 text-center text-sm font-bold text-slate-900">Filtros del catálogo</h2>
            <span className="min-w-[4.5rem]" aria-hidden="true" />
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            {renderHomeFiltersContent({ closeOnSortSelect: false, mobile: true })}
          </div>
          <footer className="shrink-0 border-t border-slate-200 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={closeHomeFiltersMenu}
              className="ui-focus w-full rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white"
            >
              Ver {homeVisibleItems.length} resultado{homeVisibleItems.length === 1 ? "" : "s"}
            </button>
          </footer>
        </div>
      ) : null}
      </>
      ) : null}
      <div
        className={`transition-all duration-500 ease-out ${
          hasActiveSearchOrQuickFilters
            ? "pointer-events-none max-h-0 -translate-y-2 overflow-hidden opacity-0"
            : "max-h-[1200px] translate-y-0 opacity-100"
        }`}
      >
        <section className="relative z-10 mx-auto grid max-w-7xl gap-4 px-4 py-5 sm:px-6 md:py-6 lg:grid-cols-12 lg:px-8">
          <div
            className={`${config.homeLayout.showCommercialPanel ? "lg:col-span-8" : "lg:col-span-12"} premium-panel premium-panel-hero premium-panel-hero--video ${
              config.homeLayout.heroAlignment === "center" ? "text-center" : "text-left"
            }`}
          >
            <CatalogHeroBackgroundVideo />
            <div className="hero-video-content">
            <p className="hero-video-kicker text-xs font-semibold uppercase tracking-[0.2em]">{config.homeLayout.heroKicker}</p>
            <h1
              className="hero-video-title mt-2 text-3xl font-black leading-tight md:text-4xl [&_a]:underline [&_b]:font-black [&_strong]:font-black [&_em]:italic [&_i]:italic [&_u]:underline"
              dangerouslySetInnerHTML={{
                __html: formatHomeHeroHtml(config.homeLayout.heroTitle) || "Sin título",
              }}
            />
            <div
              className={`hero-video-description mt-3 text-sm leading-relaxed md:text-base [&_a]:underline [&_b]:font-bold [&_strong]:font-bold [&_em]:italic [&_i]:italic [&_u]:underline [&_li]:ml-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_p]:mb-2 ${
                config.homeLayout.heroAlignment === "center"
                  ? config.homeLayout.heroMaxWidth === "xl"
                    ? "mx-auto max-w-xl"
                    : config.homeLayout.heroMaxWidth === "full"
                      ? "mx-auto max-w-full"
                      : "mx-auto max-w-2xl"
                  : config.homeLayout.heroMaxWidth === "xl"
                    ? "max-w-xl"
                    : config.homeLayout.heroMaxWidth === "full"
                      ? "max-w-full"
                      : "max-w-2xl"
              }`}
              dangerouslySetInnerHTML={{
                __html: formatHomeHeroHtml(config.homeLayout.heroDescription),
              }}
            />
            {config.homeLayout.showHeroChips ? (
            <div className={`mt-4 flex flex-wrap gap-2 ${config.homeLayout.heroAlignment === "center" ? "justify-center" : ""}`}>
              <span className="hero-video-chip rounded-full border px-3 py-1 text-xs font-semibold">Visor 3D</span>
              <span className="hero-video-chip rounded-full border px-3 py-1 text-xs font-semibold">Agenda por remate</span>
              <span className="hero-video-chip rounded-full border px-3 py-1 text-xs font-semibold">Trazabilidad técnica</span>
            </div>
            ) : null}
            {config.homeLayout.showHeroCtas ? (
            <div className={`hero-video-cta-divider mt-4 flex flex-wrap gap-3 border-t pt-4 ${config.homeLayout.heroAlignment === "center" ? "justify-center" : ""}`}>
              <a
                href={config.homeLayout.heroPrimaryCtaHref || "/vehiculos"}
                className="premium-btn-primary ui-focus"
                onClick={() => trackEvent("hero_cta_click", { cta: "primary" })}
              >
                {config.homeLayout.heroPrimaryCtaLabel || "Ver catálogo completo"}
              </a>
              <a
                href={config.homeLayout.heroSecondaryCtaHref || "#como-participar"}
                className="premium-btn-secondary ui-focus"
                onClick={() => trackEvent("hero_cta_click", { cta: "secondary" })}
              >
                {config.homeLayout.heroSecondaryCtaLabel || "Explorar secciones"}
              </a>
            </div>
            ) : null}
            {heroAuctionCountdown ? (
            <div className={`hero-video-countdown mt-4 inline-flex w-fit rounded-xl border px-3 py-2 text-xs font-semibold ${config.homeLayout.heroAlignment === "center" ? "mx-auto justify-center" : ""}`}>
              <span>{heroAuctionCountdown.label}</span>
            </div>
            ) : null}
            </div>
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

      <div className={`relative z-10 mx-auto flex max-w-7xl flex-col ${
        config.homeLayout.sectionSpacing === "compact"
          ? "gap-7"
          : config.homeLayout.sectionSpacing === "airy"
            ? "gap-16"
            : "gap-10"
      } px-4 pb-12 sm:px-6 lg:px-8`}>
        {shouldShowHowToSection ? (
        <section
          id="como-participar"
          className={`section-shell transition-all duration-500 ease-out ${
            hasActiveSearchOrQuickFilters
              ? "pointer-events-none max-h-0 -translate-y-2 overflow-hidden opacity-0"
              : "max-h-[1400px] translate-y-0 opacity-100"
          }`}
        >
          <div className="mb-4">
            <p className="premium-kicker">Cómo participar</p>
            <h2 className="text-2xl font-bold text-slate-900">¿Cómo participar en los remates?</h2>
            <p className="mt-2 text-sm text-slate-700">
              Participar en nuestras subastas online es <strong>fácil y seguro</strong>. Sigue estos pasos:
            </p>
          </div>
          <div className="howto-rail">
            {[
              {
                step: "1",
                title: "Regístrate",
                icon: "https://img.icons8.com/color/96/user-male-circle.png",
                body: (
                  <>
                    Crea tu cuenta en{" "}
                    <a
                      href="https://vehiculoschocados.cl/Account/Register"
                      target="_blank"
                      rel="noreferrer"
                      className="ui-focus font-semibold text-cyan-700 underline"
                    >
                      este enlace
                    </a>{" "}
                    y confirma tu correo electrónico.
                  </>
                ),
              },
              {
                step: "2",
                title: "Constituye tu garantía",
                icon: "https://img.icons8.com/color/96/money-bag.png",
                body: (
                  <>
                    Para ofertar, debes constituir tu garantía. Contáctanos por{" "}
                    <a
                      href="https://wa.me/56989323397?text=Hola%20quiero%20información%20sobre%20la%20garantía"
                      target="_blank"
                      rel="noreferrer"
                      className="ui-focus font-semibold text-cyan-700 underline"
                    >
                      WhatsApp
                    </a>{" "}
                    o revisa la ayuda{" "}
                    <a
                      href="https://vehiculoschocados.cl/Help"
                      target="_blank"
                      rel="noreferrer"
                      className="ui-focus font-semibold text-cyan-700 underline"
                    >
                      aquí
                    </a>
                    .
                  </>
                ),
              },
              {
                step: "3",
                title: "Revisa los lotes",
                icon: "https://img.icons8.com/color/96/car.png",
                body: (
                  <>
                    Explora los{" "}
                    <a
                      href="https://vehiculoschocados.cl/Listing"
                      target="_blank"
                      rel="noreferrer"
                      className="ui-focus font-semibold text-cyan-700 underline"
                    >
                      vehículos disponibles
                    </a>{" "}
                    con fotos, videos y descripciones.
                  </>
                ),
              },
              {
                step: "4",
                title: "Ofertar y adjudicación",
                icon: "https://cdn-icons-png.flaticon.com/128/2162/2162183.png",
                body: (
                  <>Haz tu oferta en línea. Si ganas, coordinamos tu pago y retiro en nuestras bodegas.</>
                ),
              },
            ].map((step) => (
              <div
                key={step.step}
                className="howto-step-card h-full rounded-xl border border-slate-200 bg-white px-4 py-6 text-center shadow-sm transition duration-200 hover:-translate-y-1 hover:border-cyan-200 hover:shadow-md"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={step.icon}
                  alt={step.title}
                  className="mx-auto mb-4 w-[120px] max-w-full md:w-[96px]"
                  loading="lazy"
                />
                <h3 className="text-base font-bold text-slate-900">
                  {step.step}. {step.title}
                </h3>
                <p className="mt-2 text-sm text-slate-600">{step.body}</p>
              </div>
            ))}
          </div>
        </section>
        ) : null}
        {hasActiveSearch ? (
          <section className="section-shell scroll-mt-24" id="resultados-busqueda">
            <header className="mb-4">
              <p className="premium-kicker">Búsqueda de inventario</p>
              <h2 className="text-2xl font-bold text-slate-900">
                {homeVisibleItems.length > 0
                  ? `${homeVisibleItems.length} resultado${homeVisibleItems.length === 1 ? "" : "s"} para "${homeSearchTerm.trim().toUpperCase()}"`
                  : `Sin resultados para "${homeSearchTerm.trim().toUpperCase()}"`}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {homeVisibleItems.length > 0
                  ? "Unidades publicadas o asignadas a un evento del catálogo."
                  : showPatents
                    ? "La patente debe estar en inventario, publicada y agregada a un evento desde el editor."
                    : "Prueba con marca, modelo o categoría. La unidad debe estar publicada y asignada a un evento."}
              </p>
            </header>
            {homeVisibleItems.length > 0 ? (
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {homeVisibleItems.map((item) => (
                  <CatalogCard
                    key={`search-${getVehicleKey(item)}`}
                    item={item}
                    density={cardDensity}
                    showPatents={showPatents}
                    priceLabel={formatPrice(resolveVehiclePriceRaw(item, config.vehiclePrices) ?? undefined)}
                    promoEnabled={config.vehicleDetails[getVehicleKey(item)]?.promoEnabled}
                    originalPriceLabel={config.vehicleDetails[getVehicleKey(item)]?.originalPrice}
                    commercialEventBadge={upcomingAuctionByVehicleKey[getVehicleKey(item)]}
                    onOpen={() => openVehicleDetail(item)}
                    onWhatsappClick={() =>
                      trackEvent("whatsapp_click_card", {
                        section: "busqueda-inventario",
                        itemKey: getVehicleKey(item),
                        patent: getPatent(item),
                        vehicleTitle: getModel(item),
                        commercialLane:
                          upcomingAuctionByVehicleKey[getVehicleKey(item)]?.kind ?? undefined,
                      })
                    }
                  />
                ))}
              </div>
            ) : null}
          </section>
        ) : null}
        {resolvedHomeSectionOrder.map((sectionId) => {
          if (hasActiveSearch) return null;
          if (
            topSectionFilter !== "all" &&
            isBaseHomeSectionOrderId(sectionId) &&
            topSectionFilter !== sectionId
          ) {
            return null;
          }
          if (
            topSectionFilter !== "all" &&
            sectionId.startsWith("managed:") &&
            (topSectionFilter === "proximos-remates" || topSectionFilter === "ventas-directas")
          ) {
            return null;
          }
          if (isBaseHomeSectionOrderId(sectionId) && hiddenHomeCategoryIds.has(sectionCategoryKey(sectionId))) {
            if (
              sectionId === "proximos-remates" &&
              sortedRemateAuctions.some(
                (auction) => !hiddenHomeCategoryIds.has(auctionCategoryKey(auction.id)),
              )
            ) {
              // Un remate visible por subgrupo debe poder mostrarse aunque la sección base quedó oculta.
            } else {
              return null;
            }
          }
          if (sectionId.startsWith("managed:")) {
            const managedCategoryId = sectionId.replace("managed:", "");
            const category = managedCategorySections.find((entry) => entry.id === managedCategoryId);
            if (!category) return null;
            return (
              <Section
                key={`managed-${category.id}`}
                id={`categoria-${category.id}`}
                title={category.name}
                subtitle={category.description}
                items={category.items}
                priceMap={config.vehiclePrices}
                upcomingAuctionByVehicleKey={upcomingAuctionByVehicleKey}
                onOpenVehicle={openVehicleDetail}
                cardDensity={cardDensity}
                showPatents={showPatents}
              />
            );
          }
          if (sectionId === "proximos-remates") {
            if (
              proximosRemates.length === 0 &&
              !hasUpcomingRemateCategories &&
              !hasScheduledRematesWithoutVehicles
            ) {
              return null;
            }
            if (hasUpcomingRemateCategories) {
              return (
                <UpcomingAuctionsSection
                  key="public-proximos-auctions"
                  variant="remate"
                  groups={visibleUpcomingRemateGroupsWithVehicles}
                  renderCards={(_auction, items, sectionKey) => (
                    <CatalogSectionCards
                      sectionKey={sectionKey}
                      items={items}
                      priceMap={config.vehiclePrices}
                      upcomingAuctionByVehicleKey={upcomingAuctionByVehicleKey}
                      onOpenVehicle={openVehicleDetail}
                      cardDensity={cardDensity}
                      showPatents={showPatents}
                      loading={isBootstrapping}
                    />
                  )}
                />
              );
            }
            if (hasScheduledRematesWithoutVehicles) {
              return <RematesEmptyHomeState key="public-proximos-empty" />;
            }
            return (
              <Section
                key="public-proximos-fallback"
                id="proximos-remates"
                title={config.sectionTexts["proximos-remates"].title}
                subtitle={config.sectionTexts["proximos-remates"].subtitle}
                items={proximosRemates}
                priceMap={config.vehiclePrices}
                upcomingAuctionByVehicleKey={upcomingAuctionByVehicleKey}
                onOpenVehicle={openVehicleDetail}
                cardDensity={cardDensity}
                showPatents={showPatents}
              />
            );
          }
          if (sectionId === "ventas-directas") {
            if (
              ventasDirectas.length === 0 &&
              !hasUpcomingVentaDirectaCategories &&
              !hasScheduledVentaDirectaWithoutVehicles &&
              topSectionFilter !== "ventas-directas"
            ) {
              return null;
            }
            const ventaDirectaGroupsWithVehicles = visibleUpcomingVentaDirectaGroupsWithVehicles;
            if (hasScheduledVentaDirectaWithoutVehicles && ventaDirectaGroupsWithVehicles.length === 0) {
              return <VentaDirectaEmptyHomeState key="public-ventas-directas-empty" />;
            }
            if (
              topSectionFilter === "ventas-directas" &&
              ventasDirectas.length === 0 &&
              ventaDirectaGroupsWithVehicles.length === 0
            ) {
              return <VentaDirectaEmptyHomeState key="public-ventas-directas-filter-empty" />;
            }
            return hasUpcomingVentaDirectaCategories && ventaDirectaGroupsWithVehicles.length > 0 ? (
              <UpcomingAuctionsSection
                key="public-ventas-directas-auctions"
                variant="venta_directa"
                groups={ventaDirectaGroupsWithVehicles}
                renderCards={(_auction, items, sectionKey) => (
                  <CatalogSectionCards
                    sectionKey={sectionKey}
                    items={items}
                    priceMap={config.vehiclePrices}
                    upcomingAuctionByVehicleKey={upcomingAuctionByVehicleKey}
                    onOpenVehicle={openVehicleDetail}
                    cardDensity={cardDensity}
                    showPatents={showPatents}
                    loading={isBootstrapping}
                  />
                )}
              />
            ) : (
              <Section
                key="public-ventas-directas"
                id="ventas-directas"
                title={config.sectionTexts["ventas-directas"].title}
                subtitle={config.sectionTexts["ventas-directas"].subtitle}
                items={ventasDirectas}
                priceMap={config.vehiclePrices}
                upcomingAuctionByVehicleKey={upcomingAuctionByVehicleKey}
                onOpenVehicle={openVehicleDetail}
                cardDensity={cardDensity}
                showPatents={showPatents}
              />
            );
          }
          return null;
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
              <a href="mailto:comercial@vedisaremates.cl" className="ui-focus text-cyan-700 underline">
                comercial@vedisaremates.cl
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
      {!isStandaloneDetailPage ? <CatalogSiteFooter /> : null}
        </>
      ) : null}

      {isAdmin && adminView === "home" && initialAdminView === "editor" && !isStandaloneDetailPage ? (
        <button
          type="button"
          onClick={() => setAdminView("editor")}
          className="ui-focus fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-[60] inline-flex min-h-11 items-center rounded-full border border-cyan-300 bg-white px-4 text-xs font-semibold text-cyan-800 shadow-lg md:bottom-6"
        >
          ← Volver al editor
        </button>
      ) : null}

      {isStandaloneDetailPage && !selectedVehicle && visibleItems.length === 0 ? (
        <div className="relative z-10 mx-auto flex min-h-[60vh] max-w-7xl items-center justify-center px-4 py-16">
          <p className="text-sm font-medium text-slate-600">Cargando vehículo...</p>
        </div>
      ) : null}
      {isStandaloneDetailPage && !selectedVehicle && visibleItems.length > 0 ? (
        <div className="relative z-10 mx-auto max-w-7xl px-4 py-16 text-center sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold text-slate-900">Vehículo no encontrado</h1>
          <p className="mt-2 text-sm text-slate-600">La unidad solicitada no está disponible en el inventario publicado.</p>
          <Link
            href={standaloneBackHrefProp}
            className="ui-focus mt-6 inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
              <path d="M11.75 4.5L6.25 10l5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Volver a vehículos disponibles
          </Link>
        </div>
      ) : null}

      {selectedVehicle ? (
        <>
          <VehicleDetailMobile
            vehicle={selectedVehicle}
            override={selectedVehicleOverride}
            patent={maskPatentForDisplay(getPatent(selectedVehicle), showPatents)}
            displayTitle={
              selectedVehicle.title?.trim() && !isStaleEditorDraftValue(selectedVehicle.title, getPatent(selectedVehicle))
                ? selectedVehicle.title
                : getModel(selectedVehicle)
            }
            subtitle={selectedVehicle.subtitle ?? undefined}
            priceLabel={selectedVehiclePriceLabel}
            promoEnabled={selectedVehiclePromoMeta.promoEnabled}
            originalPriceLabel={selectedVehiclePromoMeta.originalPriceLabel}
            referencePriceAmount={selectedVehicleReferencePriceAmount}
            conditionLabel={selectedVehicleConditionLabel}
            conditionClasses={selectedVehicleConditionClasses}
            view3dUrl={selectedVehicle.view3dUrl}
            mainImage={selectedVehicleMainImage}
            galleryImages={selectedVehicleGalleryImages}
            imageIndex={selectedVehicleImageIndex}
            onImageIndexChange={setSelectedVehicleImageIndex}
            onOpenLightbox={openSelectedVehicleLightboxAt}
            descriptionHtml={formatExtendedDescriptionHtml(selectedVehicleExpandedDescription)}
            generalFields={selectedVehicleFieldsByTab.general}
            technicalFields={selectedVehicleFieldsByTab.tecnica}
            documents={selectedVehicleDisplayDocuments}
            whatsappUrl={selectedVehicleWhatsappUrl}
            whatsappLabel={selectedVehiclePrimaryCtaLabel}
            onBack={navigateBackFromVehicleDetail}
            onOffer={openOfferModal}
            onShare={() => {
              void shareSelectedVehicle();
            }}
            onWhatsappTrack={() =>
              trackEvent("whatsapp_click_modal_mobile", {
                ...(selectedVehicle
                  ? buildVehicleAnalyticsContextRef.current(selectedVehicle)
                  : { itemKey: selectedVehicleKey }),
              })
            }
            backHref={isStandaloneDetailPage ? standaloneBackHrefProp : undefined}
          />
        <div
          className={
            isStandaloneDetailPage
              ? "relative z-10 hidden min-h-screen md:block"
              : "fixed inset-0 z-50 hidden items-center justify-center bg-slate-950/70 p-2 backdrop-blur-sm md:flex md:p-5"
          }
          onClick={
            isStandaloneDetailPage
              ? undefined
              : (event) => {
                  if (event.target !== event.currentTarget) return;
                  navigateBackFromVehicleDetail();
                }
          }
        >
          {isStandaloneDetailPage ? (
            <section className="sticky top-0 z-30 border-b border-cyan-100/80 bg-white/88 shadow-[0_8px_24px_rgba(87,141,167,0.08)] backdrop-blur-xl">
              <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
                <Link
                  href={standaloneBackHrefProp}
                  className="ui-focus inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50"
                  aria-label="Volver a vehículos disponibles"
                  title="Volver a vehículos disponibles"
                >
                  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
                    <path d="M11.75 4.5L6.25 10l5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Vehículos disponibles
                  </p>
                  <p className="truncate text-sm font-bold text-slate-900">
                    {showPatents
                      ? getPatent(selectedVehicle)
                      : selectedVehicle.subtitle?.trim() || getModel(selectedVehicle)}
                  </p>
                </div>
              </div>
            </section>
          ) : null}
          <div
            role="dialog"
            aria-modal={!isStandaloneDetailPage}
            aria-label={`Detalle de ${selectedVehicle.title}`}
            className={
              isStandaloneDetailPage
                ? "mx-auto w-full max-w-7xl px-4 py-6 pb-28 sm:px-6 lg:px-8"
                : "max-h-[96vh] w-full max-w-7xl overflow-auto rounded-2xl border border-cyan-100 bg-gradient-to-br from-white via-white to-cyan-50/40 p-3 pb-28 shadow-2xl md:rounded-3xl md:p-6 md:pb-28"
            }
            onClick={(event) => event.stopPropagation()}
          >
            <div className={`mb-4 rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm ${isStandaloneDetailPage ? "border-slate-200 bg-white" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">{selectedVehicle.title}</h3>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {(selectedVehicle.subtitle?.trim() || showPatents) ? (
                      <span className="whitespace-nowrap rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-800">
                        {selectedVehicle.subtitle?.trim() ||
                          (showPatents ? getPatent(selectedVehicle) : getModel(selectedVehicle))}
                      </span>
                    ) : null}
                    {selectedVehicleConditionLabel ? (
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${selectedVehicleConditionClasses}`}
                      >
                        {selectedVehicleConditionLabel}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
                  {selectedVehicle.view3dUrl ? (
                    <iframe
                      src={selectedVehicle.view3dUrl}
                      title={`Visor 3D ${selectedVehicle.title}`}
                      className={isStandaloneDetailPage ? "h-[min(72vh,760px)] w-full border-0" : "h-[min(52vh,560px)] w-full border-0"}
                      allow="fullscreen; autoplay"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selectedVehicleMainImage}
                      alt={selectedVehicle.title}
                      className={isStandaloneDetailPage ? "h-[min(72vh,760px)] w-full object-cover" : "h-[min(52vh,560px)] w-full object-cover"}
                    />
                  )}
                </div>
                {selectedVehicle.view3dUrl ? null : selectedVehicleGalleryImages.length > 1 ? (
                  <div className="flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2">
                    {selectedVehicleGalleryImages.map((imageUrl, index) => (
                      <button
                        key={`${imageUrl}-${index}`}
                        type="button"
                        onClick={() => setSelectedVehicleImageIndex(index)}
                        className={`ui-focus h-16 w-20 shrink-0 overflow-hidden rounded-lg border transition ${
                          selectedVehicleImageIndex === index
                            ? "border-cyan-500 ring-2 ring-cyan-200"
                            : "border-slate-200 hover:border-cyan-300"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imageUrl}
                          alt={`${selectedVehicle.title} vista ${index + 1}`}
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className={`flex flex-col rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm ${isStandaloneDetailPage ? "min-h-[min(72vh,760px)]" : "h-[min(52vh,560px)]"}`}>
                <h4 className="mb-3 text-base font-semibold text-slate-900">Resumen del vehículo</h4>
                <div className="mb-3 flex flex-wrap gap-2">
                  {selectedVehicleTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setSelectedVehicleTab(tab.id)}
                      className={`ui-focus rounded-full px-3 py-1 text-xs font-semibold transition ${
                        selectedVehicleTab === tab.id
                          ? "bg-cyan-600 text-white"
                          : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                {selectedVehicleTab === "fotos" ? (
                  selectedVehicleGalleryImages.length === 0 ? (
                    <p className="rounded-md border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-500">
                      Este vehículo no tiene fotos disponibles.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => openSelectedVehicleLightboxAt(selectedVehicleImageIndex)}
                        className="ui-focus block w-full overflow-hidden rounded-lg border border-slate-200 bg-white"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={selectedVehicleMainImage}
                          alt={`Foto principal de ${selectedVehicle.title}`}
                          className="h-64 w-full object-cover"
                        />
                      </button>
                      <div className="grid grid-cols-3 gap-2">
                        {selectedVehicleGalleryImages.map((imageUrl, index) => (
                          <button
                            key={`modal-photo-${imageUrl}-${index}`}
                            type="button"
                            onClick={() => {
                              setSelectedVehicleImageIndex(index);
                              openSelectedVehicleLightboxAt(index);
                            }}
                            className={`ui-focus overflow-hidden rounded-md border ${
                              selectedVehicleImageIndex === index
                                ? "border-cyan-500 ring-2 ring-cyan-200"
                                : "border-slate-200"
                            }`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={imageUrl}
                              alt={`${selectedVehicle.title} foto ${index + 1}`}
                              className="h-24 w-full object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                ) : selectedVehicleTab !== "descripcion" && selectedVehicleFieldsByTab[selectedVehicleTab].length === 0 ? (
                  <p className="rounded-md border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-500">
                    No hay datos disponibles para esta pestaña.
                  </p>
                ) : (
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    {selectedVehicleFieldsByTab[selectedVehicleTab].map(([label, value]) => (
                      <div key={label} className="min-w-0 rounded-md bg-white p-2">
                        <dt className="text-xs uppercase text-slate-500">{label}</dt>
                        <dd className="break-words font-medium text-slate-800 [overflow-wrap:anywhere]">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
                {selectedVehicleTab === "descripcion" ? (
                  <div className="mt-2 rounded-md border border-slate-200 bg-white p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Descripción ampliada</p>
                    <div
                      className="mt-1 text-sm text-slate-700 [&_a]:text-cyan-700 [&_a]:underline [&_b]:font-bold [&_strong]:font-bold [&_em]:italic [&_i]:italic [&_u]:underline [&_li]:ml-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_p]:mb-2"
                      dangerouslySetInnerHTML={{
                        __html: formatExtendedDescriptionHtml(selectedVehicleExpandedDescription),
                      }}
                    />
                  </div>
                ) : null}
                </div>
              </div>
            </div>
            <CatalogVehicleHighlightStrip item={selectedVehicle} override={selectedVehicleOverride} />
            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="grid md:grid-cols-2">
                <div className="border-b border-slate-200 bg-gradient-to-br from-cyan-50/90 via-cyan-50/40 to-white p-5 md:border-b-0 md:border-r">
                  <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">Precio referencial</p>
                  {selectedVehiclePromoMeta.promoEnabled &&
                  selectedVehiclePromoMeta.originalPriceLabel &&
                  selectedVehiclePriceLabel ? (
                    <p className="mt-2 text-base font-semibold text-slate-400 line-through">
                      {selectedVehiclePromoMeta.originalPriceLabel}
                    </p>
                  ) : null}
                  <p className={`mt-1 text-3xl font-bold tracking-tight ${selectedVehiclePromoMeta.promoEnabled ? "text-rose-700" : "text-slate-900"}`}>
                    {selectedVehiclePriceLabel ?? "No informado"}
                  </p>
                  {selectedVehiclePromoMeta.promoEnabled ? (
                    <p className="mt-2 inline-flex rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
                      Precio promocional
                    </p>
                  ) : null}
                  <p className="mt-3 text-sm text-slate-600">
                    Valor + gastos de impuesto y transferencia.
                  </p>
                </div>
                <div className="p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Documentación</p>
                  {tasacionesDocsStatus === "loading" ? (
                    <p className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-3 py-4 text-sm text-slate-400">
                      Cargando documentación…
                    </p>
                  ) : selectedVehicleDisplayDocuments.length > 0 ? (
                    <ul className="mt-3 list-none space-y-2.5 p-0">
                      {selectedVehicleDisplayDocuments.map((doc, idx) => {
                        const kind = inferLotDocumentKind(doc.url, doc.mimeType);
                        return (
                        <li key={`lot-doc-footer-${doc.url}-${idx}`}>
                          <a
                            href={lotDocumentOpenUrl(doc.url, kind)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm font-semibold text-cyan-700 transition hover:border-cyan-200 hover:bg-cyan-50/60 hover:text-cyan-800"
                          >
                            <span className={`mt-0.5 inline-block shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${lotDocumentKindBadgeClass(kind)}`}>
                              {lotDocumentKindLabel(kind)}
                            </span>
                            <span className="break-all">{doc.label}</span>
                          </a>
                        </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-3 py-4 text-sm text-slate-500">
                      No hay documentación disponible para este vehículo.
                    </p>
                  )}
                </div>
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
                      onClick={() => {
                        if (isStandaloneDetailPage) {
                          router.push(`/vehiculos/${encodeURIComponent(getVehicleKey(item))}`);
                          return;
                        }
                        openVehicleDetail(item);
                      }}
                      className="ui-focus rounded-lg border border-slate-200 bg-white p-2.5 text-left transition hover:border-cyan-300 hover:bg-cyan-50/30"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="line-clamp-1 text-sm font-semibold text-slate-900">{item.title}</p>
                          <p className="line-clamp-1 text-xs text-slate-600">
                            {item.subtitle ?? "Vehículo relacionado"}
                          </p>
                        </div>
                        <div className="h-12 w-16 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={resolveVehicleThumbnailSrc(item)}
                            alt={`Miniatura ${item.title}`}
                            className="h-full w-full object-cover"
                            loading="lazy"
                            onError={(event) => {
                              event.currentTarget.src = "/placeholder-car.svg";
                            }}
                          />
                        </div>
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          </div>
        </div>
          {canUseDomPortal && selectedVehicle
            ? createPortal(
                <div
                  className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+12px)] z-[80] hidden md:bottom-5 md:block"
                  aria-label="Acciones del vehículo"
                >
                  <div
                    className={`mx-auto flex w-full max-w-7xl justify-end ${
                      isStandaloneDetailPage ? "px-4 sm:px-6 lg:px-8" : "px-3 md:px-6"
                    }`}
                  >
                    <div
                      className="pointer-events-auto flex flex-wrap items-center justify-end gap-2"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={openOfferModal}
                        disabled={selectedVehicleReferencePriceAmount <= 0}
                        className="ui-focus inline-flex h-10 items-center justify-center rounded-full border border-cyan-300 bg-cyan-50 px-4 text-xs font-semibold text-cyan-700 shadow-md transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
                        aria-label="Enviar mi precio"
                        title={
                          selectedVehicleReferencePriceAmount > 0
                            ? "Enviar mi precio"
                            : "No hay precio referencial disponible"
                        }
                      >
                        Enviar mi precio
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void shareSelectedVehicle();
                        }}
                        className="ui-focus inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 shadow-md transition hover:bg-slate-50"
                        aria-label="Compartir"
                        title="Compartir"
                      >
                        <ShareIcon className="h-4 w-4" />
                      </button>
                      <a
                        href={selectedVehicleWhatsappUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() =>
                          trackEvent("whatsapp_click_modal", {
                            ...(selectedVehicle
                              ? buildVehicleAnalyticsContextRef.current(selectedVehicle)
                              : { itemKey: selectedVehicleKey }),
                          })
                        }
                        className="ui-focus inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#25D366] text-white shadow-md transition hover:brightness-95"
                        aria-label={selectedVehiclePrimaryCtaLabel}
                        title={selectedVehiclePrimaryCtaLabel}
                      >
                        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="currentColor" aria-hidden="true">
                          <path d="M12.04 2C6.58 2 2.16 6.42 2.16 11.88c0 1.75.46 3.46 1.33 4.96L2 22l5.3-1.38a9.83 9.83 0 0 0 4.74 1.21h.01c5.45 0 9.87-4.42 9.87-9.88A9.87 9.87 0 0 0 12.04 2Zm0 18.03h-.01a8.13 8.13 0 0 1-4.14-1.14l-.3-.18-3.15.82.84-3.07-.2-.31a8.13 8.13 0 0 1-1.25-4.3c0-4.51 3.69-8.2 8.22-8.2 4.53 0 8.21 3.68 8.21 8.2 0 4.53-3.69 8.2-8.22 8.2Zm4.49-6.19c-.25-.12-1.49-.73-1.72-.81-.23-.09-.4-.12-.57.12-.17.25-.65.81-.8.97-.15.17-.29.19-.54.06-.25-.12-1.04-.38-1.99-1.22-.74-.66-1.24-1.48-1.39-1.72-.15-.25-.02-.38.11-.51.11-.11.25-.29.37-.44.12-.15.16-.25.25-.42.08-.17.04-.31-.02-.44-.06-.12-.57-1.37-.78-1.88-.21-.49-.42-.42-.57-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.09 0 1.23.9 2.42 1.03 2.58.12.17 1.77 2.71 4.29 3.8.6.26 1.07.42 1.43.54.6.19 1.15.16 1.59.1.49-.07 1.49-.61 1.7-1.2.21-.59.21-1.1.15-1.2-.06-.1-.23-.16-.48-.28Z" />
                        </svg>
                      </a>
                      {isStandaloneDetailPage ? (
                        <Link
                          href={standaloneBackHrefProp}
                          className="ui-focus inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 shadow-md transition hover:bg-slate-50"
                          aria-label="Volver a vehículos disponibles"
                          title="Volver a vehículos disponibles"
                        >
                          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
                            <path d="M11.75 4.5L6.25 10l5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </Link>
                      ) : (
                        <button
                          type="button"
                          className="ui-focus hidden h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 shadow-md transition hover:bg-slate-50 md:inline-flex"
                          onClick={navigateBackFromVehicleDetail}
                          aria-label="Volver a resultados"
                          title="Volver a resultados"
                        >
                          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
                            <path d="M11.75 4.5L6.25 10l5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>,
                document.body,
              )
            : null}
          {selectedVehicleLightboxImage ? (
            <div
              className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/80 p-4"
              onClick={closeSelectedVehicleLightbox}
            >
              <div className="relative max-h-[92vh] w-full max-w-5xl">
                <div className="absolute left-3 top-3 z-10 inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                  <span>{(selectedVehicleLightboxIndex ?? 0) + 1}</span>
                  <span>/</span>
                  <span>{selectedVehicleGalleryImages.length}</span>
                </div>
                <div className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-full bg-black/45 p-1 backdrop-blur-sm">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      zoomSelectedVehicleLightbox("out");
                    }}
                    className="ui-focus rounded-full bg-white/90 px-2 py-1 text-xs font-semibold text-slate-700"
                    title="Alejar"
                    aria-label="Alejar foto"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      zoomSelectedVehicleLightbox("in");
                    }}
                    className="ui-focus rounded-full bg-white/90 px-2 py-1 text-xs font-semibold text-slate-700"
                    title="Acercar"
                    aria-label="Acercar foto"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      closeSelectedVehicleLightbox();
                    }}
                    className="ui-focus rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700"
                  >
                    Cerrar
                  </button>
                </div>
                <div
                  className="flex max-h-[92vh] items-center justify-center overflow-auto rounded-xl"
                  onWheel={onSelectedVehicleLightboxWheel}
                  onClick={(event) => event.stopPropagation()}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selectedVehicleLightboxImage}
                    alt={`Foto ampliada ${selectedVehicle.title}`}
                    className="max-h-[92vh] w-full rounded-xl object-contain transition-transform duration-200"
                    style={{ transform: `scale(${selectedVehicleLightboxZoom})` }}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {isAdmin && pendingRevertSale ? (
        <div
          className="fixed inset-0 z-[74] flex items-center justify-center bg-slate-900/70 p-4"
          onClick={() => setPendingRevertSale(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Revertir venta"
            className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">Confirmación</p>
            <h3 className="mt-1 text-lg font-bold text-slate-900">¿Revertir esta venta?</h3>
            <p className="mt-2 text-sm text-slate-600">
              La unidad <span className="font-semibold text-slate-900">{pendingRevertSale.patent}</span>{" "}
              ({pendingRevertSale.title}) volverá al inventario actual.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingRevertSale(null)}
                className="ui-focus rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  revertVehicleSale(pendingRevertSale.vehicleKey);
                  showSystemNotice(
                    "success",
                    "Venta revertida",
                    `${pendingRevertSale.patent} volvió al inventario actual.`,
                  );
                  setPendingRevertSale(null);
                }}
                className="ui-focus rounded-md bg-cyan-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500"
              >
                Sí, revertir
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isAdmin && finalizeAuctionId && finalizeAuction ? (
        <div
          className="fixed inset-0 z-[74] flex items-center justify-center bg-slate-900/70 p-4"
          onClick={() => setFinalizeAuctionId(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Finalizar remate"
            className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Finalizar remate</p>
                <h3 className="text-lg font-bold text-slate-900">{finalizeAuction.name}</h3>
                <p className="text-xs text-slate-500">
                  Remate programado para {formatAuctionWindowLabel(finalizeAuction)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFinalizeAuctionId(null)}
                className="ui-focus rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 transition hover:bg-slate-50"
              >
                Cerrar
              </button>
            </div>
            <div className="space-y-3">
              <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3">
                <p className="text-sm font-semibold text-slate-800">¿Qué unidades fueron vendidas?</p>
                <p className="mt-1 text-xs text-slate-600">
                  Las unidades marcadas como vendidas pasan a historial y salen del catálogo/inventario visible.
                  Las no marcadas permanecen en inventario, pero quedan ocultas.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
                <input
                  value={finalizeAuctionSearchTerm}
                  onChange={(event) => setFinalizeAuctionSearchTerm(event.target.value)}
                  placeholder="Buscar por patente o modelo..."
                  className="ui-focus rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() =>
                    setFinalizeSoldVehicleKeys((prev) => {
                      const set = new Set(prev);
                      for (const item of finalizeAuctionItems) {
                        set.add(getVehicleKey(item));
                      }
                      return Array.from(set);
                    })
                  }
                  className="ui-focus rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                >
                  Seleccionar todos
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setFinalizeSoldVehicleKeys((prev) =>
                      prev.filter(
                        (key) => !finalizeAuctionItems.some((item) => getVehicleKey(item) === key),
                      ),
                    )
                  }
                  className="ui-focus rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Limpiar marcados
                </button>
                <button
                  type="button"
                  onClick={() => setFinalizeSoldVehicleKeys([])}
                  className="ui-focus rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Omitir
                </button>
              </div>
              <div className="max-h-[48vh] space-y-2 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
                {finalizeAuctionItems.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-slate-500">
                    No hay unidades para este remate con el filtro actual.
                  </p>
                ) : (
                  finalizeAuctionItems.map((item) => {
                    const vehicleKey = getVehicleKey(item);
                    const checked = finalizeSoldVehicleKeys.includes(vehicleKey);
                    return (
                      <label
                        key={`finalize-auction-${vehicleKey}`}
                        className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm ${
                          checked
                            ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                            : "border-slate-200 bg-white text-slate-700"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) =>
                            setFinalizeSoldVehicleKeys((prev) =>
                              event.target.checked
                                ? Array.from(new Set([...prev, vehicleKey]))
                                : prev.filter((key) => key !== vehicleKey),
                            )
                          }
                        />
                        <span className="min-w-20 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {getPatent(item)}
                        </span>
                        <span className="line-clamp-1 flex-1">{getModel(item)}</span>
                        <span className="text-xs text-slate-500">
                          {formatPrice(resolveVehiclePriceRaw(item, config.vehiclePrices) ?? undefined) ??
                            "Precio no definido"}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    finalizeUpcomingAuction(finalizeAuctionId, finalizeSoldVehicleKeys);
                  }}
                  className="ui-focus rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
                >
                  Confirmar y finalizar remate
                </button>
              </div>
            </div>
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
                <div className="space-y-2 rounded-md border border-cyan-200 bg-cyan-50/40 p-2 md:col-span-2">
                  <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-center">
                    <input
                      value={manualDraft.normalPrice}
                      onChange={(event) => setManualDraft((prev) => ({ ...prev, normalPrice: event.target.value }))}
                      placeholder="Precio normal CLP"
                      className="ui-focus rounded-md border border-cyan-200 bg-white px-3 py-2 text-sm"
                    />
                    <label className="inline-flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                      <input
                        type="checkbox"
                        checked={manualDraft.promoEnabled}
                        onChange={(event) =>
                          setManualDraft((prev) => ({ ...prev, promoEnabled: event.target.checked }))
                        }
                      />
                      Precio promocional
                    </label>
                  </div>
                  {manualDraft.promoEnabled ? (
                    <input
                      value={manualDraft.promoPrice}
                      onChange={(event) => setManualDraft((prev) => ({ ...prev, promoPrice: event.target.value }))}
                      placeholder="Precio oferta CLP"
                      className="ui-focus rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-900"
                    />
                  ) : null}
                </div>
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
                <details className="md:col-span-2">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Opciones avanzadas (links Cloudinary / Glo3D)
                  </summary>
                  <div className="mt-2 grid gap-2">
                    <textarea
                      value={manualDraft.imagesCsv}
                      onChange={(event) => setManualDraft((prev) => ({ ...prev, imagesCsv: event.target.value }))}
                      placeholder="URLs adicionales de Cloudinary separadas por coma (opcional)"
                      className="ui-focus min-h-16 rounded-md border border-cyan-200 bg-white px-3 py-2 text-sm"
                    />
                    <input
                      value={manualDraft.thumbnail}
                      onChange={(event) => setManualDraft((prev) => ({ ...prev, thumbnail: event.target.value }))}
                      placeholder="URL portada Cloudinary (opcional, si no se usa la primera)"
                      className="ui-focus rounded-md border border-cyan-200 bg-white px-3 py-2 text-sm"
                    />
                    <textarea
                      value={manualDraft.view3dUrl}
                      onChange={(event) => setManualDraft((prev) => ({ ...prev, view3dUrl: event.target.value }))}
                      onBlur={(event) => {
                        const normalized = normalizeGlo3dViewerInput(event.target.value);
                        if (!normalized || normalized === event.target.value.trim()) return;
                        setManualDraft((prev) => ({ ...prev, view3dUrl: normalized }));
                      }}
                      placeholder="Visor 3D: URL Glo3D, iframeNova o iframe completo (opcional)"
                      className="ui-focus min-h-16 rounded-md border border-cyan-200 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                </details>
                <select
                  value={manualDraft.upcomingAuctionId}
                  onChange={(event) => setManualDraft((prev) => ({ ...prev, upcomingAuctionId: event.target.value }))}
                  className="ui-focus rounded-md border border-cyan-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Sin remate</option>
                  {sortedUpcomingAuctions.map((auction) => (
                    <option key={auction.id} value={auction.id}>
                      {auction.name} ({formatAuctionWindowLabel(auction)})
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
                {(["proximos-remates", "ventas-directas"] as SectionId[]).map((sectionId) => (
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

      {showOfferModal && selectedVehicle ? (
        <div
          className="fixed inset-0 z-[78] flex items-center justify-center bg-slate-900/70 p-4"
          onClick={closeOfferModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Enviar mi precio"
            className="max-h-[92vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">Enviar mi precio</p>
                <h3 className="text-lg font-bold text-slate-900">{getModel(selectedVehicle)}</h3>
                {showPatents ? (
                  <p className="text-xs text-slate-500">Patente {getPatent(selectedVehicle)}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={closeOfferModal}
                className="ui-focus rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 transition hover:bg-slate-50"
              >
                Cerrar
              </button>
            </div>

            <div className="rounded-lg border border-cyan-100 bg-cyan-50/70 p-3">
              <p className="text-xs uppercase tracking-wide text-cyan-800">Precio referencial</p>
              <p className="mt-1 text-xl font-black text-slate-900">
                {selectedVehicleReferencePriceDisplay || selectedVehiclePriceLabel || "No informado"}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Este valor NO incluye gastos de transferencia ni impuestos.
              </p>
            </div>

            <div className="mt-4 space-y-2">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">Nombre *</span>
                <input
                  value={offerForm.customerName}
                  onChange={(event) =>
                    setOfferForm((prev) => ({ ...prev, customerName: event.target.value }))
                  }
                  placeholder="Tu nombre"
                  className="ui-focus w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">Mail *</span>
                <input
                  type="email"
                  value={offerForm.customerEmail}
                  onChange={(event) =>
                    setOfferForm((prev) => ({ ...prev, customerEmail: event.target.value }))
                  }
                  placeholder="correo@ejemplo.com"
                  className="ui-focus w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">Número de teléfono *</span>
                <input
                  value={offerForm.customerPhone}
                  onChange={(event) =>
                    setOfferForm((prev) => ({ ...prev, customerPhone: event.target.value }))
                  }
                  placeholder="+56 9 1234 5678"
                  className="ui-focus w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">Oferta *</span>
                <input
                  value={offerForm.offerAmount}
                  onChange={(event) =>
                    setOfferForm((prev) => ({
                      ...prev,
                      offerAmount: toCurrencyInput(event.target.value),
                    }))
                  }
                  placeholder="$0"
                  className="ui-focus w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold"
                />
              </label>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeOfferModal}
                className="ui-focus rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  void submitOffer();
                }}
                disabled={offerSending}
                className="ui-focus rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-60"
              >
                {offerSending ? "Enviando..." : "Enviar oferta"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isAdmin && groupManageTarget ? (
        <div
          className="fixed inset-0 z-[71] flex items-center justify-center bg-slate-900/70 p-4"
          onClick={closeGroupManageModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Gestionar unidades del grupo"
            className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">
                  Ver y gestionar
                </p>
                <h3 className="text-lg font-bold text-slate-900" suppressHydrationWarning>
                  {groupManageTargetLabel}
                </h3>
                <p className="text-xs text-slate-500">
                  {groupManageItems.length} unidad(es) visibles
                  {groupManageSearchTerm.trim()
                    ? ` de ${groupManageBaseItems.length} en este grupo`
                    : " en este grupo"}
                  {groupManageSelectedKeys.length > 0
                    ? ` · ${groupManageSelectedKeys.length} seleccionada(s)`
                    : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void syncAllGroupVehicles()}
                  disabled={Boolean(groupSyncAllState?.running || syncingVehicleKey || groupManageBaseItems.length === 0)}
                  className="ui-focus inline-flex h-9 w-9 items-center justify-center rounded border border-cyan-300 bg-cyan-50 text-cyan-800 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
                  title={
                    groupSyncAllState?.running
                      ? `Sincronizando ${groupSyncAllState.current}/${groupSyncAllState.total}${
                          groupSyncAllState.patente ? ` · ${groupSyncAllState.patente}` : ""
                        }`
                      : "Sincronizar grupo desde el sistema interno"
                  }
                  aria-label={
                    groupSyncAllState?.running
                      ? `Sincronizando ${groupSyncAllState.current} de ${groupSyncAllState.total} unidades`
                      : "Sincronizar todas las unidades del grupo desde el sistema interno"
                  }
                >
                  {groupSyncAllState?.running ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-300 border-t-cyan-700" />
                  ) : (
                    <VehicleSyncIcon className="h-4 w-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={closeGroupManageModal}
                  disabled={Boolean(groupSyncAllState?.running)}
                  className="ui-focus rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  Cerrar
                </button>
              </div>
            </div>

            {groupSyncAllState?.running ? (
              <div className="mb-3 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2">
                <p className="text-xs font-semibold text-cyan-900">
                  Sincronizando desde el sistema interno… {groupSyncAllState.current}/{groupSyncAllState.total}
                  {groupSyncAllState.patente ? ` · ${groupSyncAllState.patente}` : ""}
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-cyan-100">
                  <div
                    className="h-full rounded-full bg-cyan-600 transition-all duration-300"
                    style={{
                      width: `${Math.max(
                        4,
                        Math.round((groupSyncAllState.current / groupSyncAllState.total) * 100),
                      )}%`,
                    }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-cyan-800">
                  Puede tardar varios minutos. No cierres esta ventana.
                </p>
              </div>
            ) : null}

            {groupManageTarget.type === "auction" ? (
              <div className="mb-3 rounded-xl border border-indigo-200/80 bg-indigo-50/50 p-3">
                <p className="text-xs font-semibold text-indigo-950">
                  {groupManageCommercialEventType === "venta_directa"
                    ? "Sincronizar venta directa con Rainworx"
                    : "Sincronizar remate con Rainworx"}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                  {groupManageCommercialEventType === "venta_directa" ? (
                    <>
                      Pega la URL del evento en vehiculoschocados.cl. Se fusionará la ficha Rainworx con las{" "}
                      {groupManageBaseItems.length} patente(s) de esta venta directa sin reemplazar fotos Glo3D ni
                      Tasaciones.
                    </>
                  ) : (
                    <>
                      Pega la URL del evento en vehiculoschocados.cl. Se fusionará la ficha Rainworx con las{" "}
                      {groupManageBaseItems.length} patente(s) de este remate sin reemplazar fotos Glo3D ni Tasaciones.
                    </>
                  )}
                </p>
                <label className="mt-2 flex cursor-pointer items-start gap-2 text-[11px] text-slate-700">
                  <input
                    type="checkbox"
                    checked={groupRainworxAddMissing}
                    onChange={(event) => setGroupRainworxAddMissing(event.target.checked)}
                    disabled={groupRainworxImporting}
                    className="mt-0.5"
                  />
                  <span>
                    {groupManageCommercialEventType === "venta_directa"
                      ? "Agregar patentes del evento que aún no están en esta venta directa (importación completa Rainworx)"
                      : "Agregar patentes del evento que aún no están en este remate (importación completa Rainworx)"}
                  </span>
                </label>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                  <label className="min-w-0 flex-1">
                    <span className="sr-only">URL del evento Rainworx</span>
                    <input
                      type="url"
                      value={groupRainworxEventUrl}
                      onChange={(event) => setGroupRainworxEventUrl(event.target.value)}
                      placeholder="https://www.vehiculoschocados.cl/Event/Details/…"
                      disabled={groupRainworxImporting}
                      className="ui-focus w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void importGroupRainworxFromEvent()}
                    disabled={
                      groupRainworxImporting ||
                      (groupManageBaseItems.length === 0 && !groupRainworxAddMissing)
                    }
                    className="ui-focus shrink-0 rounded-md border border-indigo-400 bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {groupRainworxImporting ? "Sincronizando…" : "Importar desde Rainworx"}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mb-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={groupManageSearchTerm}
                  onChange={(event) => {
                    const value = event.target.value;
                    setGroupManageSearchTerm(value);
                    selectGroupManagePatentsFromSearch(value);
                  }}
                  placeholder="Buscar por patente o modelo. Varias patentes: JXZF63 GDJC57 THXX63"
                  className="ui-focus min-w-[14rem] flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!groupManageTarget) return;
                    openBatchAssignModal(groupManageTarget, true);
                  }}
                  className="ui-focus inline-flex h-9 items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                >
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[10px] text-white">
                    +
                  </span>
                  Agregar unidades
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={selectGroupManageFiltered}
                  disabled={groupManageItems.length === 0}
                  className="ui-focus rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Seleccionar filtrados
                </button>
                <button
                  type="button"
                  onClick={() => setGroupManageSelectedKeys([])}
                  disabled={groupManageSelectedKeys.length === 0}
                  className="ui-focus rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Limpiar selección
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (groupManageSelectedKeys.length === 0) return;
                    if (
                      !window.confirm(
                        `¿Marcar ${groupManageSelectedKeys.length} unidad(es) como vendidas? Pasarán a historial y dejarán de mostrarse en el catálogo.`,
                      )
                    ) {
                      return;
                    }
                    const markedCount = markVehiclesAsSoldBulk(
                      groupManageSelectedKeys,
                      groupManageSoldContext,
                    );
                    setGroupManageSelectedKeys([]);
                    showSystemNotice(
                      "success",
                      "Venta masiva registrada",
                      `${markedCount} unidad(es) pasaron a historial y dejaron de estar visibles.`,
                    );
                  }}
                  disabled={groupManageSelectedKeys.length === 0}
                  className="ui-focus rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Marcar vendidas ({groupManageSelectedKeys.length})
                </button>
              </div>
            </div>

            <div className="max-h-[52vh] space-y-2 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
              {groupManageItems.length === 0 ? (
                <p className="px-2 py-3 text-sm text-slate-500">
                  No hay unidades en este grupo con el filtro actual.
                </p>
              ) : (
                groupManageItems.map((item) => {
                  const key = getVehicleKey(item);
                  const hidden = mergedHiddenVehicleIds.has(key);
                  const needsQuickSync = vehicleNeedsQuickSync(item, key, config, isStaleEditorDraftValue);
                  const selected = groupManageSelectedKeys.includes(key);
                  return (
                    <article
                      key={`group-manage-${key}`}
                      className={`grid grid-cols-1 items-center gap-2 rounded-lg border px-2.5 py-1.5 sm:grid-cols-[auto_1.4fr_auto_1fr_auto] ${
                        selected
                          ? "border-cyan-300 bg-cyan-50/40"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <label className="flex items-center justify-center sm:justify-start">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleGroupManageVehicle(key)}
                          className="h-4 w-4 rounded border-slate-300 text-cyan-600"
                          aria-label={`Seleccionar ${getPatent(item)}`}
                        />
                      </label>
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          {getPatent(item)}
                          <span
                            className={`inline-flex h-1.5 w-1.5 rounded-full ${
                              hidden ? "bg-rose-500" : "bg-emerald-500"
                            }`}
                            aria-hidden="true"
                          />
                          <span className="normal-case tracking-normal text-[11px] text-slate-500">
                            {hidden ? "Oculto" : "Visible"}
                          </span>
                          {needsQuickSync ? (
                            <button
                              type="button"
                              onClick={() => void showPatentDiagnosis(getPatent(item))}
                              className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-amber-800 underline decoration-amber-400/70 underline-offset-2 hover:bg-amber-200"
                              title="Ver diagnóstico del sistema interno / Glo3D / Autored"
                            >
                              Sin sync
                            </button>
                          ) : null}
                        </p>
                        <p className="line-clamp-1 text-sm font-semibold leading-tight text-slate-900">
                          {resolveVehicleListTitle(item, config.vehicleDetails)}
                        </p>
                      </div>
                      <VehicleListThumbnailWithSync
                        item={item}
                        vehicleKey={key}
                        editorConfig={config}
                        onSync={(vehicleKey) => void syncVehicleWithGlo3dAutored(vehicleKey)}
                        syncingVehicleKey={syncingVehicleKey}
                        glo3dCooldownLabel={cooldownLabel}
                        isStaleTitle={isStaleEditorDraftValue}
                      />
                      <div className="min-w-0 text-xs text-slate-600 sm:text-right">
                        <p className="line-clamp-1">
                          {formatPrice(resolveVehiclePriceRaw(item, config.vehiclePrices) ?? undefined) ??
                            "Precio no definido"}
                        </p>
                      </div>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setManagingVehicleKey(key)}
                          className="ui-focus inline-flex h-7 w-7 items-center justify-center rounded border border-cyan-300 bg-cyan-50 text-cyan-700 transition hover:bg-cyan-100"
                          aria-label={`Gestionar unidad ${getPatent(item)}`}
                          title="Gestionar unidad"
                        >
                          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                            <path d="M13.586 2.586a2 2 0 0 1 2.828 2.828l-8.2 8.2a1 1 0 0 1-.475.264l-3 0.75a1 1 0 0 1-1.212-1.213l.75-3a1 1 0 0 1 .264-.474l8.2-8.2ZM12.172 4 5.24 10.932l-.39 1.56 1.56-.39L13.344 5.17 12.172 4Z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const nextHidden = !hidden;
                            toggleHidden(key);
                            showSystemNotice(
                              "success",
                              nextHidden ? "Unidad oculta del home" : "Unidad visible en home",
                              nextHidden
                                ? `${getPatent(item)} quedó oculta del home, sin eliminarse del inventario.`
                                : `${getPatent(item)} volvió a mostrarse en el home.`,
                            );
                          }}
                          className={`ui-focus inline-flex h-7 w-7 items-center justify-center rounded border transition ${
                            hidden
                              ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                          }`}
                          aria-label={`${hidden ? "Mostrar" : "Ocultar"} en home ${getPatent(item)}`}
                          title={hidden ? "Mostrar en home" : "Ocultar del home"}
                        >
                          {hidden ? (
                            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                              <path d="M10 4c3.38 0 6.63 2 8.37 5.42a1.3 1.3 0 0 1 0 1.16C16.63 14 13.38 16 10 16s-6.63-2-8.37-5.42a1.3 1.3 0 0 1 0-1.16C3.37 6 6.62 4 10 4Zm0 2c-2.6 0-5.16 1.5-6.71 4 .01.02.02.04.03.05C4.84 12.5 7.4 14 10 14s5.16-1.5 6.71-4a.63.63 0 0 0-.03-.05C15.16 7.5 12.6 6 10 6Zm0 1.75A2.25 2.25 0 1 1 10 12.25 2.25 2.25 0 0 1 10 7.75Z" />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                              <path d="M10 4c3.38 0 6.63 2 8.37 5.42a1.3 1.3 0 0 1 0 1.16C16.63 14 13.38 16 10 16c-1.72 0-3.42-.52-4.95-1.5l1.5-1.5c1.06.63 2.24.97 3.45.97 2.6 0 5.16-1.5 6.71-4a.63.63 0 0 0-.03-.05C15.16 7.5 12.6 6 10 6c-1.2 0-2.38.34-3.43.96L5.1 5.49A9.85 9.85 0 0 1 10 4Zm7.2 13.6a.75.75 0 0 1-1.06 0l-13-13a.75.75 0 1 1 1.06-1.06l13 13a.75.75 0 0 1 0 1.06ZM10 7.75c.7 0 1.33.32 1.75.83L8.58 11.75A2.25 2.25 0 0 1 10 7.75Z" />
                            </svg>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            removeVehicleFromGroupTarget(key);
                            showSystemNotice(
                              "success",
                              "Unidad removida del grupo",
                              `${getPatent(item)} ya no pertenece a ${groupManageTargetLabel}.`,
                            );
                          }}
                          className="ui-focus inline-flex h-7 w-7 items-center justify-center rounded border border-rose-300 bg-rose-50 text-rose-700 transition hover:bg-rose-100"
                          aria-label={`Quitar ${getPatent(item)} del grupo`}
                          title="Quitar del grupo"
                        >
                          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                            <path d="M7 2.5A1.5 1.5 0 0 0 5.5 4v.5H3.75a.75.75 0 0 0 0 1.5h.56l.75 9.02A2 2 0 0 0 7.06 17h5.88a2 2 0 0 0 1.99-1.98l.75-9.02h.57a.75.75 0 0 0 0-1.5H14.5V4A1.5 1.5 0 0 0 13 2.5H7Z" />
                          </svg>
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={closeGroupManageModal}
                className="ui-focus rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isAdmin && batchAssignTarget ? (
        <div
          className="fixed inset-0 z-[72] flex items-center justify-center bg-slate-900/70 p-4"
          onClick={closeBatchAssignModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Agregar unidades desde inventario"
            className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">
                  Agregar desde inventario
                </p>
                <h3 className="text-lg font-bold text-slate-900">{batchAssignTargetLabel}</h3>
                <p className="text-xs text-slate-500">
                  Busca por patente, puedes ingresar varias separadas por espacio: LRBR11 SWBC56 THXX63
                </p>
              </div>
              <button
                type="button"
                onClick={closeBatchAssignModal}
                className="ui-focus rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 transition hover:bg-slate-50"
              >
                Cerrar
              </button>
            </div>

            <div className="mb-3 flex flex-wrap gap-2">
              <input
                value={batchAssignSearchTerm}
                onChange={(event) => {
                  setBatchAssignSearchTerm(event.target.value);
                  lastAutoImportPatentRef.current = "";
                }}
                placeholder="Buscar por patente (ej. TJSX32)..."
                className="ui-focus min-w-[220px] flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => void importPatentsForBatchAssign()}
                disabled={batchAssignImporting || !resolveAutoImportPatent(batchAssignSearchTerm)}
                className="ui-focus rounded-md border border-cyan-300 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-800 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {batchAssignImporting ? "Importando…" : "Importar patente"}
              </button>
            </div>

            {batchAssignImporting ? (
              <p className="mb-3 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-800">
                {batchAssignSelectedNeedsImport
                  ? "Consultando Glo3D y Autored (solo unidades con ficha incompleta). Usa la patente exacta, por ejemplo "
                  : "Guardando asignación y sincronizando con Tasaciones…"}
                {batchAssignSelectedNeedsImport ? (
                  <>
                    <strong>TJSX32</strong>.
                  </>
                ) : null}
              </p>
            ) : null}

            {!batchAssignSearchTerm.trim() ? (
              <p className="mb-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                Busca en inventario local primero. Si no aparece, escribe la patente completa y pulsa
                &quot;Importar Glo3D&quot; (no se importa solo al escribir).
              </p>
            ) : null}

            {batchAssignSearchTerm.trim() && !resolveAutoImportPatent(batchAssignSearchTerm) ? (
              <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Escribe la patente completa de 6 caracteres (4 letras + 2 números), por ejemplo{" "}
                <strong>TJSX32</strong>.
              </p>
            ) : null}

            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-600">
                {batchAssignCandidates.length} resultados · {batchAssignSelectedKeys.length} seleccionados
                {batchAssignCandidates.length > 0 ? (
                  <span className="text-slate-500"> · clic en cada fila para seleccionar</span>
                ) : null}
              </p>
              <button
                type="button"
                onClick={() =>
                  setBatchAssignSelectedKeys((prev) => {
                    const set = new Set(prev);
                    for (const item of batchAssignCandidates) set.add(getVehicleKey(item));
                    return Array.from(set);
                  })
                }
                className="ui-focus rounded border border-cyan-300 bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700"
              >
                Seleccionar todos los resultados
              </button>
            </div>

            <div className="space-y-2">
              {batchAssignCandidates.map((item) => {
                const key = getVehicleKey(item);
                const checked = batchAssignSelectedKeys.includes(key);
                const alreadyInTarget =
                  batchAssignTarget.type === "auction"
                    ? (config.vehicleUpcomingAuctionIds[key] ?? "") === batchAssignTarget.auctionId
                    : (config.sectionVehicleIds[batchAssignTarget.sectionId] ?? []).includes(key);
                return (
                  <div
                    key={`assign-batch-${key}`}
                    role="checkbox"
                    aria-checked={checked}
                    aria-label={`${resolveVehicleListTitle(item, config.vehicleDetails)} · ${getPatent(item)}`}
                    tabIndex={0}
                    onClick={() => toggleBatchAssignVehicle(key)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggleBatchAssignVehicle(key);
                      }
                    }}
                    className={`ui-focus flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${
                      checked
                        ? "border-cyan-300 bg-cyan-50 ring-1 ring-cyan-200"
                        : "border-slate-200 bg-white hover:border-cyan-200 hover:bg-slate-50"
                    }`}
                  >
                    <div
                      className="shrink-0"
                      onClick={(event) => {
                        if ((event.target as HTMLElement).closest("button")) {
                          event.stopPropagation();
                        }
                      }}
                    >
                      <VehicleListThumbnailWithSync
                        item={item}
                        vehicleKey={key}
                        editorConfig={config}
                        onSync={(vehicleKey) => void syncVehicleWithGlo3dAutored(vehicleKey)}
                        syncingVehicleKey={syncingVehicleKey}
                        glo3dCooldownLabel={cooldownLabel}
                        isStaleTitle={isStaleEditorDraftValue}
                        className="relative h-11 w-16 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900">
                        {resolveVehicleListTitle(item, config.vehicleDetails)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {getPatent(item)}{" "}
                        {vehicleNeedsQuickSync(item, key, config, isStaleEditorDraftValue)
                          ? "· sin sync"
                          : vehicleNeedsAssignEnrich(item, key, config)
                            ? "· ficha incompleta"
                            : vehicleNeedsSourceSync(item, key, config)
                              ? "· sin fotos Glo3D"
                              : "· ficha OK"}
                        {alreadyInTarget ? " · ya agregado" : ""}
                      </p>
                    </div>
                    <span
                      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                        checked
                          ? "border-cyan-600 bg-cyan-600 text-white"
                          : "border-slate-300 bg-white text-transparent"
                      }`}
                      aria-hidden="true"
                    >
                      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.25 7.333a1 1 0 0 1-1.435.02L3.29 10.02a1 1 0 1 1 1.414-1.414l3.18 3.18 6.53-6.61a1 1 0 0 1 1.49-.006Z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </span>
                  </div>
                );
              })}
              {batchAssignCandidates.length === 0 &&
              batchAssignSearchTerm.trim() &&
              !batchAssignImporting ? (
                <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                  Sin resultados en inventario local. Pulsa &quot;Importar Glo3D&quot; para traer la
                  patente desde el sistema interno (o Glo3D/Autored si es nueva).
                </p>
              ) : null}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeBatchAssignModal}
                className="ui-focus rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void addBatchVehiclesToTarget()}
                disabled={batchAssignImporting || batchAssignSelectedKeys.length === 0}
                className="ui-focus rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {batchAssignImporting
                  ? batchAssignSelectedNeedsImport
                    ? "Importando y agregando…"
                    : "Agregando…"
                  : "Agregar seleccionados"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isAdmin && activeManagedCategory ? (
        <div
          className="fixed inset-0 z-[72] flex items-center justify-center bg-slate-900/70 p-4"
          onClick={() => setAssignCategoryId(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Asignar vehículos a categoría"
            className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">
                  Asignar vehículos
                </p>
                <h3 className="text-lg font-bold text-slate-900">{activeManagedCategory.name}</h3>
                <p className="text-xs text-slate-500">{activeManagedCategory.vehicleIds.length} unidades seleccionadas</p>
              </div>
              <button
                type="button"
                onClick={() => setAssignCategoryId(null)}
                className="ui-focus rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 transition hover:bg-slate-50"
              >
                Cerrar
              </button>
            </div>

            <input
              value={assignSearchTerm}
              onChange={(event) => setAssignSearchTerm(event.target.value)}
              placeholder="Buscar por patente, modelo o título..."
              className="ui-focus mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />

            <div className="space-y-2">
              {managedCategoryAssignCandidates.map((item) => {
                const key = getVehicleKey(item);
                const checked = activeManagedCategory.vehicleIds.includes(key);
                return (
                  <label
                    key={`assign-${activeManagedCategory.id}-${key}`}
                    className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${
                      checked ? "border-cyan-300 bg-cyan-50" : "border-slate-200 bg-white"
                    }`}
                  >
                    <div>
                      <p className="font-semibold text-slate-900">{getModel(item)}</p>
                      <p className="text-xs text-slate-500">{getPatent(item)}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleVehicleInManagedCategory(activeManagedCategory.id, key)}
                      className="ui-focus h-4 w-4"
                    />
                  </label>
                );
              })}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setAssignCategoryId(null)}
                className="ui-focus rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <AdminLoginDialog
        open={showLogin}
        email={loginEmail}
        password={loginPassword}
        error={loginError}
        onEmailChange={setLoginEmail}
        onPasswordChange={setLoginPassword}
        onCancel={() => setShowLogin(false)}
        onSubmit={login}
      />
      <FloatingWhatsappButton
        hidden={!showPublicHome || Boolean(selectedVehicle) || showAdminEditor}
        onClick={() => trackEvent("whatsapp_click_floating")}
      />

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

      {isAdmin && managingVehicleKey && managingItem ? (
        <div
          className="fixed inset-0 z-[76] flex items-center justify-center bg-slate-900/70 p-3"
          onClick={() => setManagingVehicleKey(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Gestionar unidad"
            className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-cyan-700">
                  Gestionar unidad
                </p>
                <h3 className="truncate text-sm font-bold text-slate-900">
                  {managingItem.title?.trim() && !isPlaceholderVehicleLabel(managingItem.title)
                    ? managingItem.title
                    : getModel(managingItem)}
                </h3>
                <p className="text-[11px] text-slate-500">{getPatent(managingItem)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {!managingVehicleKey.startsWith("manual-") ? (
                  <button
                    type="button"
                    onClick={() => void syncManagingVehicleWithGlo3dAutored()}
                    disabled={Boolean(syncingVehicleKey)}
                    className="ui-focus rounded border border-cyan-300 bg-cyan-50 px-2 py-1 text-[11px] font-semibold text-cyan-800 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
                    title="Traer miniatura y ficha desde el sistema interno"
                  >
                    {syncingVehicleKey === managingVehicleKey ? "Sync…" : "Sistema interno"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setManagingVehicleKey(null)}
                  className="ui-focus rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-600 transition hover:bg-slate-50"
                >
                  Cerrar
                </button>
              </div>
            </div>

            <div className="space-y-2.5 px-3 py-2.5">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="inline-flex items-center gap-1.5 rounded border border-slate-200 px-2 py-1.5 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={!mergedHiddenVehicleIds.has(managingVehicleKey)}
                    onChange={() => toggleHidden(managingVehicleKey)}
                  />
                  Visible en sitio
                </label>
                <label className="inline-flex items-center gap-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs font-medium text-amber-900">
                  <input
                    type="checkbox"
                    checked={managingVehiclePromoMeta.promoEnabled}
                    onChange={(event) =>
                      updateVehiclePromoSettings(managingVehicleKey, {
                        promoEnabled: event.target.checked,
                      })
                    }
                  />
                  Precio promo
                </label>
                <input
                  className="ui-focus rounded border border-slate-300 px-2 py-1.5 text-xs sm:col-span-2"
                  placeholder="Precio normal CLP"
                  value={managingVehiclePromoMeta.originalPrice}
                  onChange={(event) =>
                    updateVehiclePromoSettings(managingVehicleKey, {
                      originalPrice: event.target.value,
                    })
                  }
                />
                {managingVehiclePromoMeta.promoEnabled ? (
                  <input
                    className="ui-focus rounded border border-rose-300 px-2 py-1.5 text-xs sm:col-span-2"
                    placeholder="Precio oferta CLP"
                    value={managingVehiclePromoMeta.promoPrice}
                    onChange={(event) =>
                      updateVehiclePromoSettings(managingVehicleKey, {
                        promoPrice: event.target.value,
                      })
                    }
                  />
                ) : null}
                <select
                  className="ui-focus rounded border border-slate-300 px-2 py-1.5 text-xs sm:col-span-2"
                  value={normalizeVehicleCategoryValue(
                    String(
                      config.vehicleDetails[managingVehicleKey]?.category ??
                        getLookupValue(buildVehicleLookup(managingItem.raw as Record<string, unknown>), [
                          "categoria",
                          "tipo_vehiculo",
                          "tipo",
                        ]) ??
                        "",
                    ),
                  )}
                  onChange={(event) => setVehicleCategory(managingVehicleKey, event.target.value)}
                >
                  <option value="">Categoría de vehículo</option>
                  {VEHICLE_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <select
                className="ui-focus w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                value={config.vehicleUpcomingAuctionIds[managingVehicleKey] ?? ""}
                onChange={(event) =>
                  assignVehicleToUpcomingAuction(managingVehicleKey, event.target.value)
                }
              >
                <option value="">Sin remate asignado</option>
                {sortedUpcomingAuctions.map((auction) => (
                  <option key={auction.id} value={auction.id}>
                    {auction.name} ({formatAuctionWindowLabel(auction)})
                  </option>
                ))}
              </select>

              <div className="flex flex-wrap gap-1.5">
                {(["ventas-directas"] as SectionId[]).map((sectionId) => {
                  const selected = (config.sectionVehicleIds[sectionId] ?? []).includes(managingVehicleKey);
                  return (
                    <label
                      key={`manage-${managingVehicleKey}-${sectionId}`}
                      className={`inline-flex cursor-pointer items-center gap-1 rounded border px-2 py-1 text-[11px] ${
                        selected
                          ? "border-cyan-300 bg-cyan-50 text-cyan-800"
                          : "border-slate-200 text-slate-600"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleItemInSection(sectionId, managingVehicleKey)}
                      />
                      {SECTION_LABELS[sectionId]}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-1.5 border-t border-slate-200 px-3 py-2">
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    markVehicleAsSold(managingVehicleKey);
                    setManagingVehicleKey(null);
                    showSystemNotice(
                      "success",
                      "Unidad vendida",
                      `${getPatent(managingItem)} pasó a historial y dejó de estar visible en inventario/catálogo.`,
                    );
                  }}
                  className="ui-focus rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 transition hover:bg-amber-100"
                >
                  Vendida
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setManagingVehicleKey(null);
                    openDetailsEditor(managingItem);
                  }}
                  className="ui-focus rounded border border-cyan-300 bg-cyan-50 px-2 py-1 text-[11px] font-semibold text-cyan-700 transition hover:bg-cyan-100"
                >
                  Editar ficha
                </button>
                {managingVehicleKey.startsWith("manual-") ? (
                  <button
                    type="button"
                    onClick={() => {
                      deleteManualPublication(managingVehicleKey.replace("manual-", ""));
                      setManagingVehicleKey(null);
                    }}
                    className="ui-focus rounded border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100"
                  >
                    Borrar
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setManagingVehicleKey(null)}
                className="ui-focus rounded bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-slate-700"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isAdmin && editingVehicleKey && editingDetails && editingItem ? (
        <div className="fixed inset-0 z-[82] flex items-center justify-center bg-slate-900/70 p-4" onClick={cancelDetailsEditor}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Editar ficha del vehículo"
            className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-cyan-50/30 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 pb-3">
            <div className="mb-4 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">Editar ficha</p>
                  <EditorLabeledField label="Título (como se ve en el home)">
                    <input
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-lg font-bold text-slate-900"
                      placeholder="Ej. NISSAN KICKS 1.6 2020"
                      value={editingDetails.title ?? ""}
                      onChange={(event) =>
                        setEditingDetails((prev) => ({ ...(prev ?? {}), title: event.target.value }))
                      }
                    />
                  </EditorLabeledField>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-800">
                      {editingDetails.patente?.trim() || getPatent(editingItem)}
                    </span>
                    <input
                      className="min-w-[200px] flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700"
                      placeholder="Subtítulo / chips (DIESEL, 4X4, ÚNICO DUEÑO…)"
                      value={editingDetails.subtitle ?? ""}
                      onChange={(event) =>
                        setEditingDetails((prev) => ({ ...(prev ?? {}), subtitle: event.target.value }))
                      }
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={cancelDetailsEditor}
                  className="ui-focus inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 transition hover:border-slate-400 hover:bg-slate-100 hover:text-slate-900"
                  aria-label="Cerrar editor de ficha"
                  title="Cerrar"
                >
                  <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
                    <path
                      d="M5 5l10 10M15 5L5 15"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
              {DETAIL_EDITOR_TABS.map(([tabId, label]) => (
                <button
                  key={tabId}
                  type="button"
                  onClick={() => setDetailEditorTab(tabId)}
                  className={`ui-focus rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    detailEditorTab === tabId
                      ? "bg-cyan-600 text-white shadow-sm"
                      : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {detailEditorTab === "descripcion" ? (
              <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs text-slate-600">
                  Mismo contenido que la pestaña Descripción del home. Usa el editor para observaciones,
                  condiciones y narrativa comercial.
                </p>
                <div className="flex flex-wrap items-center gap-2 rounded border border-slate-300 bg-white px-2 py-2">
                  <button type="button" onClick={() => runObservationsCommand("bold")} className="ui-focus rounded border border-slate-300 px-2 py-1 text-xs font-bold text-slate-700">B</button>
                  <button type="button" onClick={() => runObservationsCommand("italic")} className="ui-focus rounded border border-slate-300 px-2 py-1 text-xs italic text-slate-700">I</button>
                  <button type="button" onClick={() => runObservationsCommand("underline")} className="ui-focus rounded border border-slate-300 px-2 py-1 text-xs underline text-slate-700">U</button>
                  <button type="button" onClick={() => runObservationsCommand("insertUnorderedList")} className="ui-focus rounded border border-slate-300 px-2 py-1 text-xs text-slate-700">Lista</button>
                </div>
                <div
                  ref={manualObservationsEditorRef}
                  className="ui-focus min-h-[220px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed text-slate-800"
                  contentEditable
                  suppressContentEditableWarning
                  suppressHydrationWarning
                  onInput={(event) => syncManualObservations(event.currentTarget.innerHTML)}
                  aria-label="Editor de descripción ampliada con formato HTML"
                />
              </div>
            ) : null}

            {detailEditorTab === "documentos" ? (
              <EditorVehiculoDocumentos
                patente={editingDetails.patente?.trim() || getPatent(editingItem)}
                editorDocuments={editingLotDocuments}
                onEditorDocumentsChange={setEditingLotDocuments}
                uploadSlot={
                  <div
                    onDragOver={(event) => {
                      event.preventDefault();
                      setEditorDocumentDropActive(true);
                    }}
                    onDragLeave={() => setEditorDocumentDropActive(false)}
                    onDrop={(event) => void handleEditorDocumentDrop(event)}
                    className={`rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
                      editorDocumentDropActive
                        ? "border-cyan-400 bg-cyan-50/70"
                        : "border-slate-300 bg-slate-50/60"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => editorDocumentFileInputRef.current?.click()}
                      disabled={editorDocumentUploading}
                      className="ui-focus rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-wait disabled:opacity-60"
                    >
                      {editorDocumentUploading ? "Subiendo…" : "Seleccionar archivos"}
                    </button>
                    <input
                      ref={editorDocumentFileInputRef}
                      type="file"
                      multiple
                      accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.xls,.xlsx,.doc,.docx,.ppt,.pptx,.csv,.txt,image/*,application/pdf"
                      className="hidden"
                      onChange={(event) => {
                        const picked = Array.from(event.target.files ?? []);
                        if (picked.length > 0) void uploadEditorDocuments(picked);
                      }}
                    />
                  </div>
                }
              />
            ) : null}

            {detailEditorTab === "publicacion" ? (
              <div className="space-y-4">
                <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
                  <EditorLabeledField label="Estado comercial">
                    <input className="w-full rounded border border-slate-300 px-3 py-2 text-sm" value={editingDetails.status ?? ""} onChange={(event) => setEditingDetails((prev) => ({ ...(prev ?? {}), status: event.target.value }))} />
                  </EditorLabeledField>
                  <EditorLabeledField label="Condición del vehículo">
                    <select className="w-full rounded border border-slate-300 px-3 py-2 text-sm" value={editingDetails.vehicleCondition ?? ""} onChange={(event) => setEditingDetails((prev) => ({ ...(prev ?? {}), vehicleCondition: event.target.value }))}>
                      <option value="">Seleccionar…</option>
                      {VEHICLE_CONDITION_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </EditorLabeledField>
                  <EditorLabeledField label="Ubicación comercial">
                    <input className="w-full rounded border border-slate-300 px-3 py-2 text-sm" value={editingDetails.location ?? ""} onChange={(event) => setEditingDetails((prev) => ({ ...(prev ?? {}), location: event.target.value }))} />
                  </EditorLabeledField>
                  <EditorLabeledField label="Lote">
                    <input className="w-full rounded border border-slate-300 px-3 py-2 text-sm" value={editingDetails.lot ?? ""} onChange={(event) => setEditingDetails((prev) => ({ ...(prev ?? {}), lot: event.target.value }))} />
                  </EditorLabeledField>
                  <EditorLabeledField label="Fecha remate" className="md:col-span-2">
                    <input className={getEditorInputClass("auctionDate")} value={editingDetails.auctionDate ?? ""} onChange={(event) => setEditingDetails((prev) => ({ ...(prev ?? {}), auctionDate: event.target.value }))} />
                  </EditorLabeledField>
                </div>
                <div className="rounded-xl border border-emerald-200/90 bg-emerald-50/60 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900">
                Importar URL de Rainworx
              </p>
              <p className="mt-1 text-xs text-emerald-900/85">
                Pega la URL de la ficha (ej.{" "}
                <span className="font-mono text-[11px]">.../Event/LotDetails/11860442/...</span>).{" "}
                {getExpectedPatenteForRainworx(editingItem, editingDetails) ? (
                  <>
                    Solo se importa si la patente del lote coincide con{" "}
                    <strong>{getExpectedPatenteForRainworx(editingItem, editingDetails)}</strong>.
                  </>
                ) : (
                  <>Como esta ficha no tiene patente cargada, no se exige coincidencia; revisa que la URL sea del vehículo correcto.</>
                )}
              </p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="url"
                  className="ui-focus min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                  placeholder="https://vehiculoschocados.cl/Event/LotDetails/..."
                  value={detailRainworxUrl}
                  onChange={(e) => setDetailRainworxUrl(e.target.value)}
                  disabled={detailRainworxImporting}
                />
                <button
                  type="button"
                  onClick={() => void importRainworxInDetailEditor()}
                  disabled={detailRainworxImporting}
                  className="ui-focus shrink-0 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
                >
                  {detailRainworxImporting ? "Sincronizando…" : "Importar desde esta URL"}
                </button>
              </div>
                </div>
              </div>
            ) : null}

            {detailEditorTab === "general" ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Clasificación comercial
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <EditorLabeledField label="Patente" className="md:col-span-2">
                      <input
                        className="w-full rounded border border-slate-300 px-3 py-2 text-sm font-semibold uppercase tracking-wide"
                        value={editingDetails.patente ?? ""}
                        onChange={(event) =>
                          setEditingDetails((prev) => ({ ...(prev ?? {}), patente: event.target.value }))
                        }
                      />
                    </EditorLabeledField>
                    <EditorLabeledField label="Marca">
                      <input
                        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                        value={editingDetails.brand ?? ""}
                        onChange={(event) =>
                          setEditingDetails((prev) => ({ ...(prev ?? {}), brand: event.target.value }))
                        }
                      />
                    </EditorLabeledField>
                    <EditorLabeledField label="Modelo">
                      <input
                        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                        value={editingDetails.model ?? ""}
                        onChange={(event) =>
                          setEditingDetails((prev) => ({ ...(prev ?? {}), model: event.target.value }))
                        }
                      />
                    </EditorLabeledField>
                    <EditorLabeledField label="Año">
                      <input
                        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                        value={editingDetails.year ?? ""}
                        onChange={(event) =>
                          setEditingDetails((prev) => ({ ...(prev ?? {}), year: event.target.value }))
                        }
                      />
                    </EditorLabeledField>
                    <EditorLabeledField label="Versión (ver / trim)">
                      <input
                        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                        value={editingDetails.version ?? ""}
                        onChange={(event) =>
                          setEditingDetails((prev) => ({ ...(prev ?? {}), version: event.target.value }))
                        }
                      />
                    </EditorLabeledField>
                    <EditorLabeledField label="Tipo de vehículo">
                      <input
                        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                        value={editingDetails.tipoVehiculo ?? ""}
                        onChange={(event) =>
                          setEditingDetails((prev) => ({ ...(prev ?? {}), tipoVehiculo: event.target.value }))
                        }
                      />
                    </EditorLabeledField>
                    <EditorLabeledField label="Tipo">
                      <input
                        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                        value={editingDetails.tipo ?? ""}
                        onChange={(event) =>
                          setEditingDetails((prev) => ({ ...(prev ?? {}), tipo: event.target.value }))
                        }
                      />
                    </EditorLabeledField>
                    <EditorLabeledField label="Categoría">
                      <select
                        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                        value={normalizeVehicleCategoryValue(editingDetails.category ?? "")}
                        onChange={(event) =>
                          setEditingDetails((prev) => ({
                            ...(prev ?? {}),
                            category: event.target.value,
                          }))
                        }
                      >
                        <option value="">Seleccionar…</option>
                        {VEHICLE_CATEGORY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </EditorLabeledField>
                    <EditorLabeledField label="Condición">
                      <select
                        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                        value={editingDetails.vehicleCondition ?? ""}
                        onChange={(event) =>
                          setEditingDetails((prev) => ({
                            ...(prev ?? {}),
                            vehicleCondition: event.target.value,
                          }))
                        }
                      >
                        <option value="">Seleccionar…</option>
                        {VEHICLE_CONDITION_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </EditorLabeledField>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Identificación y trazabilidad
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <EditorLabeledField label="Patente verificador (DV)">
                      <input
                        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                        value={editingDetails.patenteVerifier ?? ""}
                        onChange={(event) =>
                          setEditingDetails((prev) => ({ ...(prev ?? {}), patenteVerifier: event.target.value }))
                        }
                      />
                    </EditorLabeledField>
                    <EditorLabeledField label="VIN">
                      <input
                        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                        value={editingDetails.vin ?? ""}
                        onChange={(event) =>
                          setEditingDetails((prev) => ({ ...(prev ?? {}), vin: event.target.value }))
                        }
                      />
                    </EditorLabeledField>
                    <EditorLabeledField label="N° Chasis">
                      <input
                        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                        value={editingDetails.nChasis ?? ""}
                        onChange={(event) =>
                          setEditingDetails((prev) => ({ ...(prev ?? {}), nChasis: event.target.value }))
                        }
                      />
                    </EditorLabeledField>
                    <EditorLabeledField label="N° Motor">
                      <input
                        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                        value={editingDetails.nMotor ?? ""}
                        onChange={(event) =>
                          setEditingDetails((prev) => ({ ...(prev ?? {}), nMotor: event.target.value }))
                        }
                      />
                    </EditorLabeledField>
                    <EditorLabeledField label="N° Serie">
                      <input
                        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                        value={editingDetails.nSerie ?? ""}
                        onChange={(event) =>
                          setEditingDetails((prev) => ({ ...(prev ?? {}), nSerie: event.target.value }))
                        }
                      />
                    </EditorLabeledField>
                    <EditorLabeledField label="N° de siniestro" className="md:col-span-2">
                      <input
                        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                        value={editingDetails.nSiniestro ?? ""}
                        onChange={(event) =>
                          setEditingDetails((prev) => ({ ...(prev ?? {}), nSiniestro: event.target.value }))
                        }
                      />
                    </EditorLabeledField>
                  </div>
                </div>
              </div>
            ) : detailEditorTab === "tecnica" ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Mecánica y configuración
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <input className="rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Kilometraje / KM" value={editingDetails.kilometraje ?? ""} onChange={(event) => setEditingDetails((prev) => ({ ...(prev ?? {}), kilometraje: event.target.value }))} />
                    <input className="rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Color" value={editingDetails.color ?? ""} onChange={(event) => setEditingDetails((prev) => ({ ...(prev ?? {}), color: event.target.value }))} />
                    <input className="rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Combustible" value={editingDetails.combustible ?? ""} onChange={(event) => setEditingDetails((prev) => ({ ...(prev ?? {}), combustible: event.target.value }))} />
                    <input className="rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Transmisión" value={editingDetails.transmision ?? ""} onChange={(event) => setEditingDetails((prev) => ({ ...(prev ?? {}), transmision: event.target.value }))} />
                    <input className="rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Tracción" value={editingDetails.traccion ?? ""} onChange={(event) => setEditingDetails((prev) => ({ ...(prev ?? {}), traccion: event.target.value }))} />
                    <input className="rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Aro" value={editingDetails.aro ?? ""} onChange={(event) => setEditingDetails((prev) => ({ ...(prev ?? {}), aro: event.target.value }))} />
                    <input className="rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Cilindrada" value={editingDetails.cilindrada ?? ""} onChange={(event) => setEditingDetails((prev) => ({ ...(prev ?? {}), cilindrada: event.target.value }))} />
                    <input className="rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Estado de airbags" value={editingDetails.estadoAirbags ?? ""} onChange={(event) => setEditingDetails((prev) => ({ ...(prev ?? {}), estadoAirbags: event.target.value }))} />
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Pruebas y condición operativa
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {([
                      ["llaves", "Llaves (SI/NO)"],
                      ["aireAcondicionado", "Aire acondicionado (SI/NO)"],
                      ["unicoPropietario", "Único propietario (SI/NO)"],
                      ["condicionado", "Condicionado (SI/NO)"],
                      ["pruebaMotor", "Prueba de motor (SI/NO)"],
                      ["pruebaDesplazamiento", "Prueba de desplazamiento (SI/NO)"],
                    ] as Array<[keyof EditorVehicleDetails, string]>).map(([field, label]) => (
                      <div key={field} className="space-y-1">
                        <div className="flex gap-2">
                          <input
                            className={`${getEditorInputClass(field)} flex-1`}
                            placeholder={label}
                            value={String(editingDetails[field] ?? "")}
                            onChange={(event) => setEditingDetailField(field, event.target.value)}
                          />
                          <button
                            type="button"
                            onClick={() => setEditingDetailField(field, "SI")}
                            className="ui-focus rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700"
                          >
                            SI
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingDetailField(field, "NO")}
                            className="ui-focus rounded border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700"
                          >
                            NO
                          </button>
                        </div>
                        {getEditorFieldError(field) ? (
                          <p className="text-xs text-rose-600">{getEditorFieldError(field)}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Documentación y logística
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <input className="rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Ubicación física" value={editingDetails.ubicacionFisica ?? ""} onChange={(event) => setEditingDetails((prev) => ({ ...(prev ?? {}), ubicacionFisica: event.target.value }))} />
                    <input className="rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Transportista" value={editingDetails.transportista ?? ""} onChange={(event) => setEditingDetails((prev) => ({ ...(prev ?? {}), transportista: event.target.value }))} />
                    <input className="rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Taller" value={editingDetails.taller ?? ""} onChange={(event) => setEditingDetails((prev) => ({ ...(prev ?? {}), taller: event.target.value }))} />
                    <input className="rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Multas" value={editingDetails.multas ?? ""} onChange={(event) => setEditingDetails((prev) => ({ ...(prev ?? {}), multas: event.target.value }))} />
                    <input className="rounded border border-slate-300 px-3 py-2 text-sm" placeholder="TAG" value={editingDetails.tag ?? ""} onChange={(event) => setEditingDetails((prev) => ({ ...(prev ?? {}), tag: event.target.value }))} />
                    <div className="space-y-1">
                      <input className={getEditorInputClass("vencRevisionTecnica")} placeholder="Vencimiento revisión técnica" value={editingDetails.vencRevisionTecnica ?? ""} onChange={(event) => setEditingDetails((prev) => ({ ...(prev ?? {}), vencRevisionTecnica: event.target.value }))} />
                      {getEditorFieldError("vencRevisionTecnica") ? <p className="text-xs text-rose-600">{getEditorFieldError("vencRevisionTecnica")}</p> : null}
                    </div>
                    <div className="space-y-1">
                      <input className={getEditorInputClass("vencPermisoCirculacion")} placeholder="Vencimiento permiso circulación" value={editingDetails.vencPermisoCirculacion ?? ""} onChange={(event) => setEditingDetails((prev) => ({ ...(prev ?? {}), vencPermisoCirculacion: event.target.value }))} />
                      {getEditorFieldError("vencPermisoCirculacion") ? <p className="text-xs text-rose-600">{getEditorFieldError("vencPermisoCirculacion")}</p> : null}
                    </div>
                    <div className="space-y-1">
                      <input className={getEditorInputClass("vencSeguroObligatorio")} placeholder="Vencimiento seguro obligatorio" value={editingDetails.vencSeguroObligatorio ?? ""} onChange={(event) => setEditingDetails((prev) => ({ ...(prev ?? {}), vencSeguroObligatorio: event.target.value }))} />
                      {getEditorFieldError("vencSeguroObligatorio") ? <p className="text-xs text-rose-600">{getEditorFieldError("vencSeguroObligatorio")}</p> : null}
                    </div>
                    <input className="rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Nombre propietario anterior" value={editingDetails.nombrePropietarioAnterior ?? ""} onChange={(event) => setEditingDetails((prev) => ({ ...(prev ?? {}), nombrePropietarioAnterior: event.target.value }))} />
                    <div className="space-y-1">
                      <input className={getEditorInputClass("rutPropietarioAnterior")} placeholder="RUT propietario anterior" value={editingDetails.rutPropietarioAnterior ?? ""} onChange={(event) => setEditingDetails((prev) => ({ ...(prev ?? {}), rutPropietarioAnterior: event.target.value }))} />
                      {getEditorFieldError("rutPropietarioAnterior") ? <p className="text-xs text-rose-600">{getEditorFieldError("rutPropietarioAnterior")}</p> : null}
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <input className={getEditorInputClass("rutVerificador")} placeholder="RUT verificador" value={editingDetails.rutVerificador ?? ""} onChange={(event) => setEditingDetails((prev) => ({ ...(prev ?? {}), rutVerificador: event.target.value }))} />
                      {getEditorFieldError("rutVerificador") ? <p className="text-xs text-rose-600">{getEditorFieldError("rutVerificador")}</p> : null}
                    </div>
                  </div>
                </div>
              </div>
            ) : detailEditorTab === "fotos" ? (
              <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
                <div className="rounded-lg border border-cyan-100 bg-cyan-50/50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-cyan-800">
                    Visor 3D (Glo3D)
                  </p>
                  <EditorLabeledField label="URL del visor 3D" className="mt-2">
                    <textarea
                      className="min-h-20 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                      placeholder="Pega URL Glo3D, enlace iframeNova o el iframe completo"
                      value={editingDetails.view3dUrl ?? editingItem?.view3dUrl ?? ""}
                      onChange={(event) =>
                        setEditingDetails((prev) => ({ ...(prev ?? {}), view3dUrl: event.target.value }))
                      }
                      onBlur={(event) => {
                        const normalized = normalizeGlo3dViewerInput(event.target.value);
                        if (!normalized || normalized === event.target.value.trim()) return;
                        setEditingDetails((prev) => ({ ...(prev ?? {}), view3dUrl: normalized }));
                      }}
                    />
                  </EditorLabeledField>
                  {resolveGlo3dViewerPreviewUrl(
                    editingDetails.view3dUrl ?? editingItem?.view3dUrl,
                  ) ? (
                    <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-900/5">
                      <iframe
                        title="Vista previa visor 3D"
                        src={
                          resolveGlo3dViewerPreviewUrl(
                            editingDetails.view3dUrl ?? editingItem?.view3dUrl,
                          ) ?? ""
                        }
                        className="h-56 w-full"
                        loading="lazy"
                        allow="fullscreen"
                      />
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">
                      Sin visor 3D cargado. Usa &quot;Cargar desde el sistema interno&quot; en la sección Fotos.
                    </p>
                  )}
                </div>

                <EditorLabeledField label="Miniatura (URL)">
                  <input
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    value={editingDetails.thumbnail ?? editingItem?.thumbnail ?? ""}
                    onChange={(event) =>
                      setEditingDetails((prev) => ({ ...(prev ?? {}), thumbnail: event.target.value }))
                    }
                  />
                </EditorLabeledField>
                {(editingDetails.thumbnail ?? editingItem?.thumbnail)?.startsWith("http") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={editingDetails.thumbnail ?? editingItem?.thumbnail}
                    alt="Miniatura"
                    className="h-36 w-auto rounded-lg border border-slate-200 object-cover"
                  />
                ) : null}

                <EditorLabeledField label="Galería (URLs separadas por coma)">
                  <textarea
                    className="min-h-28 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    value={
                      editingDetails.imagesCsv ??
                      editingItem?.images.filter((url) => url.startsWith("http")).join(", ") ??
                      ""
                    }
                    onChange={(event) =>
                      setEditingDetails((prev) => ({ ...(prev ?? {}), imagesCsv: event.target.value }))
                    }
                  />
                </EditorLabeledField>

                {parseImagesCsv(
                  editingDetails.imagesCsv ??
                    editingItem?.images.filter((url) => url.startsWith("http")).join(", "),
                ).length > 0 ? (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {parseImagesCsv(
                      editingDetails.imagesCsv ??
                        editingItem?.images.filter((url) => url.startsWith("http")).join(", "),
                    ).map((url) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={url}
                        src={url}
                        alt="Foto del vehículo"
                        className="h-24 w-full rounded-lg border border-slate-200 object-cover"
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    Sin fotos en galería. Carga desde el sistema interno o pega URLs manualmente.
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => void loadTasacionesInventoryIntoEditor()}
                  disabled={Boolean(loadingTasacionesMedia || syncingVehicleKey)}
                  className="ui-focus rounded border border-cyan-300 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-800 disabled:opacity-60"
                >
                  {loadingTasacionesMedia ? "Cargando desde el sistema interno…" : "Cargar desde el sistema interno"}
                </button>
              </div>
            ) : null}
            </div>

            <footer className="shrink-0 border-t border-slate-200 bg-white/95 px-5 py-3 backdrop-blur-sm">
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={cancelDetailsEditor}
                  className="ui-focus rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={saveDetailsEditor}
                  className="ui-focus rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-500"
                >
                  Guardar detalle
                </button>
              </div>
            </footer>
          </div>
        </div>
      ) : null}
    </main>
  );
}
