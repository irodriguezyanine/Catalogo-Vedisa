export type SectionId = "proximos-remates" | "ventas-directas" | "novedades" | "catalogo";

export type VehicleTypeId = "livianos" | "pesados" | "maquinaria" | "otros";

export type UpcomingAuction = {
  id: string;
  name: string;
  date: string;
};

export type SectionTextConfig = {
  title: string;
  subtitle: string;
};

export type HomeLayoutConfig = {
  heroKicker: string;
  heroTitle: string;
  heroDescription: string;
  showFeaturedStrip: boolean;
  showCommercialPanel: boolean;
  sectionOrder: SectionId[];
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
};

export type EditorVehicleDetails = {
  title?: string;
  subtitle?: string;
  patente?: string;
  vin?: string;
  status?: string;
  location?: string;
  lot?: string;
  auctionDate?: string;
  description?: string;
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
  thumbnail?: string;
  view3dUrl?: string;
  imagesCsv?: string;
};

export type EditorConfig = {
  sectionVehicleIds: Record<SectionId, string[]>;
  hiddenVehicleIds: string[];
  vehiclePrices: Record<string, string>;
  vehicleDetails: Record<string, EditorVehicleDetails>;
  upcomingAuctions: UpcomingAuction[];
  vehicleUpcomingAuctionIds: Record<string, string>;
  sectionTexts: Record<SectionId, SectionTextConfig>;
  homeLayout: HomeLayoutConfig;
  manualPublications: ManualPublication[];
};

export const DEFAULT_EDITOR_CONFIG: EditorConfig = {
  sectionVehicleIds: {
    "proximos-remates": [],
    "ventas-directas": [],
    novedades: [],
    catalogo: [],
  },
  hiddenVehicleIds: [],
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
    heroKicker: "Catálogo oficial de VEDISA REMATES",
    heroTitle: "Inventario de vehiculos",
    heroDescription:
      "Plataforma oficial de ofertas online en vedisaremates.cl. Revisa cada unidad con información clara, fotos y trazabilidad comercial para tomar decisiones con confianza.",
    showFeaturedStrip: true,
    showCommercialPanel: true,
    sectionOrder: ["proximos-remates", "ventas-directas", "novedades", "catalogo"],
  },
  manualPublications: [],
};
