export type SectionId = "proximos-remates" | "ventas-directas" | "novedades" | "catalogo";
export type HomeSectionOrderId = SectionId | `managed:${string}`;

export type VehicleTypeId = "livianos" | "pesados" | "maquinaria" | "otros";
export type CommercialEventType = "remate" | "venta_directa";

export type UpcomingAuction = {
  id: string;
  name: string;
  date: string;
  startAt?: string;
  endAt?: string;
  eventType?: CommercialEventType;
};

export type SectionTextConfig = {
  title: string;
  subtitle: string;
};

export type ManagedCategory = {
  id: string;
  name: string;
  description: string;
  vehicleIds: string[];
  visible: boolean;
};

export type SoldVehicleRecord = {
  vehicleKey: string;
  patent: string;
  title: string;
  soldAt: string;
  soldCategory?: string;
  auctionId?: string;
  auctionName?: string;
};

export type HomeLayoutConfig = {
  heroKicker: string;
  heroTitle: string;
  heroDescription: string;
  heroPrimaryCtaLabel: string;
  heroPrimaryCtaHref: string;
  heroSecondaryCtaLabel: string;
  heroSecondaryCtaHref: string;
  heroAlignment: "left" | "center";
  heroTheme: "cyan" | "indigo" | "slate";
  heroMaxWidth: "xl" | "2xl" | "full";
  showHeroChips: boolean;
  showHeroCtas: boolean;
  showFeaturedStrip: boolean;
  showRecentPublications: boolean;
  showFavoritesSection: boolean;
  showHowToSection: boolean;
  showSearchBar: boolean;
  showQuickFilters: boolean;
  showSortSelector: boolean;
  showStickySearchBar: boolean;
  showCommercialPanel: boolean;
  defaultCardDensity: "compact" | "detailed";
  sectionSpacing: "compact" | "normal" | "airy";
  sectionOrder: HomeSectionOrderId[];
};

export type ManualPublication = {
  id: string;
  title: string;
  subtitle?: string;
  status?: string;
  location?: string;
  lot?: string;
  auctionDate?: string;
  description?: string;
  patente?: string;
  brand?: string;
  model?: string;
  year?: string;
  category?: string;
  images: string[];
  thumbnail?: string;
  view3dUrl?: string;
  sectionIds: SectionId[];
  upcomingAuctionId?: string;
  visible: boolean;
  price?: string;
  originalPrice?: string;
  promoPrice?: string;
  promoEnabled?: boolean;
};

export type EditorVehicleDetails = {
  title?: string;
  subtitle?: string;
  patente?: string;
  patenteVerifier?: string;
  vin?: string;
  nChasis?: string;
  nMotor?: string;
  nSerie?: string;
  nSiniestro?: string;
  version?: string;
  tipo?: string;
  tipoVehiculo?: string;
  vehicleCondition?: string;
  status?: string;
  location?: string;
  ubicacionFisica?: string;
  transportista?: string;
  taller?: string;
  lot?: string;
  auctionDate?: string;
  description?: string;
  extendedDescription?: string;
  brand?: string;
  model?: string;
  year?: string;
  category?: string;
  kilometraje?: string;
  color?: string;
  combustible?: string;
  transmision?: string;
  traccion?: string;
  aro?: string;
  cilindrada?: string;
  llaves?: string;
  aireAcondicionado?: string;
  unicoPropietario?: string;
  condicionado?: string;
  multas?: string;
  tag?: string;
  vencRevisionTecnica?: string;
  vencPermisoCirculacion?: string;
  vencSeguroObligatorio?: string;
  pruebaMotor?: string;
  pruebaDesplazamiento?: string;
  estadoAirbags?: string;
  nombrePropietarioAnterior?: string;
  rutPropietarioAnterior?: string;
  rutVerificador?: string;
  thumbnail?: string;
  view3dUrl?: string;
  imagesCsv?: string;
  /** JSON: `[{"label":"…","url":"https://…"}]` documentos del lote (p. ej. PDF en Cloudinary). */
  lotDocumentsJson?: string;
  originalPrice?: string;
  promoPrice?: string;
  promoEnabled?: boolean;
};

export type EditorConfig = {
  sectionVehicleIds: Record<SectionId, string[]>;
  hiddenVehicleIds: string[];
  hiddenCategoryIds: string[];
  soldVehicleIds: string[];
  soldVehicleHistory: SoldVehicleRecord[];
  vehiclePrices: Record<string, string>;
  vehicleDetails: Record<string, EditorVehicleDetails>;
  upcomingAuctions: UpcomingAuction[];
  vehicleUpcomingAuctionIds: Record<string, string>;
  sectionTexts: Record<SectionId, SectionTextConfig>;
  homeLayout: HomeLayoutConfig;
  manualPublications: ManualPublication[];
  managedCategories: ManagedCategory[];
};

export const DEFAULT_EDITOR_CONFIG: EditorConfig = {
  sectionVehicleIds: {
    "proximos-remates": [],
    "ventas-directas": [],
    novedades: [],
    catalogo: [],
  },
  hiddenVehicleIds: [],
  hiddenCategoryIds: [],
  soldVehicleIds: [],
  soldVehicleHistory: [],
  vehiclePrices: {},
  vehicleDetails: {},
  upcomingAuctions: [],
  vehicleUpcomingAuctionIds: {},
  sectionTexts: {
    "proximos-remates": {
      title: "Próximos remates",
      subtitle: "Vehículos en agenda con mayor prioridad comercial.",
    },
    "ventas-directas": {
      title: "Ventas Directas",
      subtitle: "Stock disponible para cierre rápido.",
    },
    novedades: {
      title: "Novedades",
      subtitle: "Últimas unidades ingresadas al ecosistema Vedisa.",
    },
    catalogo: {
      title: "Catálogo",
      subtitle: "Inventario por tipo de vehículo.",
    },
  },
  homeLayout: {
    heroKicker: "Catálogo oficial de Vedisa Remates",
    heroTitle: "Encuentra tu próximo vehículo al mejor precio",
    heroDescription:
      "Catálogo oficial de Vedisa Remates con fotos, historial técnico y trazabilidad.",
    heroPrimaryCtaLabel: "Ver vehículos disponibles",
    heroPrimaryCtaHref: "#catalogo",
    heroSecondaryCtaLabel: "Cómo participar en el remate",
    heroSecondaryCtaHref: "#como-participar",
    heroAlignment: "left",
    heroTheme: "slate",
    heroMaxWidth: "xl",
    showHeroChips: true,
    showHeroCtas: true,
    showFeaturedStrip: true,
    showRecentPublications: false,
    showFavoritesSection: true,
    showHowToSection: true,
    showSearchBar: true,
    showQuickFilters: true,
    showSortSelector: true,
    showStickySearchBar: true,
    showCommercialPanel: true,
    defaultCardDensity: "detailed",
    sectionSpacing: "normal",
    sectionOrder: ["proximos-remates", "ventas-directas", "novedades", "catalogo"],
  },
  manualPublications: [],
  managedCategories: [],
};
