export type SectionId = "proximos-remates" | "ventas-directas" | "novedades" | "catalogo";

export type VehicleTypeId = "livianos" | "pesados" | "maquinaria" | "otros";

export type EditorConfig = {
  sectionVehicleIds: Record<SectionId, string[]>;
  hiddenVehicleIds: string[];
  vehiclePrices: Record<string, string>;
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
};
