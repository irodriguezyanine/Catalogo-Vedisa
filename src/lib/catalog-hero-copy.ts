export const CATALOG_HERO_COPY = {
  kicker: "Catálogo oficial de VEDISA REMATES",
  title: "Encuentra tu próximo vehículo en remate o venta directa",
  description:
    "+500 vehículos al año · Exhibición en Pudahuel · Remates 100% online con fotos, historial y recorrido 360° cuando está disponible.",
} as const;

function normalizeHeroCopyKey(value?: string | null): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

const LEGACY_HERO_KICKERS = new Set(
  [
    "Automotora y compraventa oficial de Vedisa Remates",
    "Automotora y compraventa OFICIAL DE VEDISA REMATES",
    "Catalogo oficial de Vedisa Remates",
    "Catálogo oficial de Vedisa Remates",
  ].map(normalizeHeroCopyKey),
);

const LEGACY_HERO_TITLES = new Set(
  [
    "Inventario de vehículos para remate y venta directa",
    "Inventario de vehiculos",
    "Inventario de vehículos",
    "Encuentra tu próximo vehículo al mejor precio",
    "Encuentra tu proximo vehiculo al mejor precio",
    "Encuentra tu próximo seminuevo al mejor precio del mercado.",
    "Encuentra tu proximo seminuevo al mejor precio del mercado.",
  ].map(normalizeHeroCopyKey),
);

function isLegacyHeroDescription(value?: string | null): boolean {
  const norm = normalizeHeroCopyKey(value);
  if (!norm) return true;
  if (norm.includes("vehiculos de ocasion")) return true;
  if (norm.includes("vehiculos seminuevos")) return true;
  if (norm.includes("plataforma oficial de ofertas online en vedisaremates")) return true;
  if (norm.includes("catalogo oficial de vedisa remates con fotos")) return true;
  if (norm.includes("historial tecnico y trazabilidad")) return true;
  return false;
}

export function resolveCatalogHeroKicker(incoming?: string | null): string {
  const trimmed = String(incoming ?? "").trim();
  if (!trimmed || LEGACY_HERO_KICKERS.has(normalizeHeroCopyKey(trimmed))) {
    return CATALOG_HERO_COPY.kicker;
  }
  return trimmed;
}

export function resolveCatalogHeroTitle(incoming?: string | null): string {
  const trimmed = String(incoming ?? "").trim();
  if (!trimmed || LEGACY_HERO_TITLES.has(normalizeHeroCopyKey(trimmed))) {
    return CATALOG_HERO_COPY.title;
  }
  return trimmed;
}

export function resolveCatalogHeroDescription(incoming?: string | null): string {
  const trimmed = String(incoming ?? "").trim();
  if (isLegacyHeroDescription(trimmed)) {
    return CATALOG_HERO_COPY.description;
  }
  return trimmed;
}
