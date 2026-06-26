import { normalizePatenteKey } from "@/lib/rainworx-to-editor";
import {
  isPlaceholderVehicleIdentity,
  sanitizeMarcaValue,
  sanitizeModeloValue,
} from "@/lib/vehicle-identity";
import type { EditorVehicleDetails } from "@/types/editor";

function pickString(row: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function normalizeImageList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter((url) => url.startsWith("http"));
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[\n,;|]+/)
      .map((part) => part.trim())
      .filter((url) => url.startsWith("http"));
  }
  return [];
}

/** Convierte ficha Rainworx del editor a fila parcial de inventario compartido. */
export function editorDetailsToInventarioSeed(
  patente: string,
  details: EditorVehicleDetails,
): Record<string, unknown> {
  const images = (details.imagesCsv ?? "")
    .split(/[\n,;|]+/)
    .map((part) => part.trim())
    .filter((url) => url.startsWith("http"));
  const thumbnail =
    details.thumbnail?.startsWith("http")
      ? details.thumbnail
      : images[0];

  return {
    patente,
    PPU: patente,
    stock_number: patente,
    marca: details.brand,
    modelo: details.model,
    ano: details.year,
    version: details.version,
    descripcion: details.description ?? details.extendedDescription,
    imagenes: images.length > 0 ? images : thumbnail ? [thumbnail] : undefined,
    thumbnail,
    glo3d_url: details.view3dUrl?.includes("glo3d") ? details.view3dUrl : undefined,
    url_3d: details.view3dUrl?.includes("glo3d") ? details.view3dUrl : undefined,
    origen: "rainworx",
  };
}

/** Indica si el seed Rainworx tiene datos mínimos para crear inventario sin Tasaciones/Glo3D. */
export function inventarioSeedHasUsableIdentity(
  seed: Record<string, unknown> | undefined,
  patente: string,
): boolean {
  if (!seed || typeof seed !== "object") return false;
  const resolvedPatente = pickString(seed, ["patente", "PPU", "stock_number"]);
  if (!resolvedPatente || normalizePatenteKey(resolvedPatente) !== normalizePatenteKey(patente)) {
    return false;
  }
  const marca = sanitizeMarcaValue(pickString(seed, ["marca", "brand"]) ?? "");
  const modelo = sanitizeModeloValue(pickString(seed, ["modelo", "model"]) ?? "", patente);
  const hasIdentity =
    Boolean(marca && modelo) &&
    !isPlaceholderVehicleIdentity(marca) &&
    !isPlaceholderVehicleIdentity(modelo) &&
    normalizePatenteKey(modelo) !== normalizePatenteKey(patente);
  const hasImages =
    normalizeImageList(seed.imagenes).length > 0 ||
    pickString(seed, ["thumbnail", "imagen_principal", "foto_portada"])?.startsWith("http") === true;
  return hasIdentity || hasImages;
}
