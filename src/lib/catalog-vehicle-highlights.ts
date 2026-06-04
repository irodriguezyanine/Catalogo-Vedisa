import type { CatalogItem } from "@/types/catalog";
import type { EditorVehicleDetails } from "@/types/editor";

export type VehicleHighlightItem = {
  id: string;
  label: string;
};

function normalizeLookupKey(value: string): string {
  return value
    .trim()
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

function getLookupValue(lookup: Map<string, unknown>, aliases: string[]): unknown {
  for (const alias of aliases) {
    const value = lookup.get(normalizeLookupKey(alias));
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return undefined;
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") {
    const sample = value.trim().toLowerCase();
    if (!sample) return false;
    if (["n/a", "na", "sin info", "no informado", "-", "--"].includes(sample)) return false;
    return true;
  }
  return true;
}

function pickString(value: unknown): string | null {
  if (!hasMeaningfulValue(value)) return null;
  return String(value).trim();
}

function isAffirmative(value: unknown): boolean {
  const sample = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (["si", "yes", "y", "true", "1"].includes(sample)) return true;
  if (/^(con|tiene|motor arranca|se desplaza|unico dueno|aire acondicionado)/.test(sample)) return true;
  if (sample.includes("arranca") || sample.includes("desplaza") || sample.includes("operativ")) return true;
  return false;
}

function formatKilometraje(value: string): string {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return value.toUpperCase();
  const amount = Number(digits);
  if (!Number.isFinite(amount)) return value.toUpperCase();
  return `${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(amount)} kms.`;
}

function formatUpper(value: string): string {
  return value.trim().toUpperCase();
}

function formatTraccion(value: string): string {
  const sample = value.trim().toUpperCase();
  if (/^TRACCION\b/.test(sample)) return sample;
  return `TRACCIÓN ${sample}`;
}

type HighlightResolver = {
  id: VehicleHighlightItem["id"];
  resolve: (
    lookup: Map<string, unknown>,
    override?: EditorVehicleDetails,
  ) => string | null;
};

const HIGHLIGHT_RESOLVERS: HighlightResolver[] = [
  {
    id: "kilometraje",
    resolve: (lookup, override) => {
      const raw =
        pickString(override?.kilometraje) ??
        pickString(
          getLookupValue(lookup, [
            "kilometraje",
            "km",
            "kms",
            "odometro",
            "odómetro",
            "mileage",
            "odometer",
            "cav_campos.kilometraje",
            "autored.kilometraje",
          ]),
        );
      return raw ? formatKilometraje(raw) : null;
    },
  },
  {
    id: "ano",
    resolve: (lookup, override) => {
      const raw =
        pickString(override?.year) ??
        pickString(getLookupValue(lookup, ["ano", "anio", "year", "glo3d.year", "cav_campos.ano"]));
      return raw ? formatUpper(raw) : null;
    },
  },
  {
    id: "combustible",
    resolve: (lookup, override) => {
      const raw =
        pickString(override?.combustible) ??
        pickString(
          getLookupValue(lookup, [
            "combustible",
            "tipo_combustible",
            "fuel",
            "fuel_type",
            "cav_campos.combustible",
            "autored.combustible",
          ]),
        );
      return raw ? formatUpper(raw) : null;
    },
  },
  {
    id: "transmision",
    resolve: (lookup, override) => {
      const raw =
        pickString(override?.transmision) ??
        pickString(
          getLookupValue(lookup, [
            "transmision",
            "transmisión",
            "caja",
            "tipo_caja",
            "transmission",
            "gearbox",
            "cav_campos.transmision",
            "autored.transmision",
          ]),
        );
      return raw ? formatUpper(raw) : null;
    },
  },
  {
    id: "prueba_motor",
    resolve: (lookup, override) => {
      const raw =
        pickString(override?.pruebaMotor) ??
        pickString(getLookupValue(lookup, ["prueba_motor", "prueba_motor_arranca", "pdm", "glo3d.prueba_motor"]));
      if (!raw) return null;
      if (isAffirmative(raw)) return "MOTOR ARRANCA";
      return formatUpper(raw);
    },
  },
  {
    id: "prueba_desplazamiento",
    resolve: (lookup, override) => {
      const raw =
        pickString(override?.pruebaDesplazamiento) ??
        pickString(
          getLookupValue(lookup, [
            "prueba_desplazamiento",
            "prueba_desplazamiento_mueve",
            "pdd",
            "glo3d.prueba_desplazamiento",
          ]),
        );
      if (!raw) return null;
      if (isAffirmative(raw)) return "SE DESPLAZA";
      return formatUpper(raw);
    },
  },
  {
    id: "unico_propietario",
    resolve: (lookup, override) => {
      const raw =
        pickString(override?.unicoPropietario) ??
        pickString(
          getLookupValue(lookup, ["unico_propietario", "único_propietario", "single_owner", "glo3d.unico_propietario"]),
        );
      if (!raw || !isAffirmative(raw)) return null;
      return "ÚNICO DUEÑO";
    },
  },
  {
    id: "aire_acondicionado",
    resolve: (lookup, override) => {
      const raw =
        pickString(override?.aireAcondicionado) ??
        pickString(
          getLookupValue(lookup, ["aire_acondicionado", "air_conditioning", "has_ac", "ac", "glo3d.aire_acondicionado"]),
        );
      if (!raw || !isAffirmative(raw)) return null;
      return "AIRE ACONDICIONADO";
    },
  },
  {
    id: "llaves",
    resolve: (lookup, override) => {
      const raw =
        pickString(override?.llaves) ??
        pickString(getLookupValue(lookup, ["llaves", "keys", "has_keys", "tiene_llaves", "glo3d.llaves"]));
      if (!raw || !isAffirmative(raw)) return null;
      return "CON LLAVES";
    },
  },
  {
    id: "traccion",
    resolve: (lookup, override) => {
      const raw =
        pickString(override?.traccion) ??
        pickString(
          getLookupValue(lookup, [
            "traccion",
            "tracción",
            "tipo_traccion",
            "drivetrain",
            "traction",
            "drive_type",
            "cav_campos.traccion",
            "autored.traccion",
            "glo3d.drive_type",
          ]),
        );
      return raw ? formatTraccion(raw) : null;
    },
  },
];

export function resolveVehicleHighlights(
  item: CatalogItem,
  override?: EditorVehicleDetails,
): VehicleHighlightItem[] {
  const lookup = buildVehicleLookup(item.raw as Record<string, unknown>);
  const highlights: VehicleHighlightItem[] = [];

  for (const resolver of HIGHLIGHT_RESOLVERS) {
    const label = resolver.resolve(lookup, override);
    if (!label) continue;
    highlights.push({ id: resolver.id, label });
  }

  return highlights;
}
