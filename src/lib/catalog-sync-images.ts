/** Fusión de imágenes Glo3D + Autored con prioridad Glo3D para miniatura. */

export type CatalogThumbnailSource = "glo3d" | "autored" | "inventario" | "none";

export function mergeVehicleImageSources(options: {
  glo3dImages: string[];
  autoredImages: string[];
  inventarioImages?: string[];
}): {
  images: string[];
  thumbnail?: string;
  thumbnailSource: CatalogThumbnailSource;
} {
  const glo3dImages = options.glo3dImages.filter((url) => url.startsWith("http"));
  const autoredImages = options.autoredImages.filter((url) => url.startsWith("http"));
  const inventarioImages = (options.inventarioImages ?? []).filter((url) => url.startsWith("http"));

  const thumbnail = glo3dImages[0] ?? autoredImages[0] ?? inventarioImages[0];
  const thumbnailSource: CatalogThumbnailSource = glo3dImages[0]
    ? "glo3d"
    : autoredImages[0]
      ? "autored"
      : inventarioImages[0]
        ? "inventario"
        : "none";

  const images = [
    ...new Set([
      ...glo3dImages,
      ...(glo3dImages.length === 0 ? autoredImages : []),
      ...inventarioImages.filter((url) => !glo3dImages.includes(url)),
    ]),
  ];

  return { images, thumbnail, thumbnailSource };
}

export function extractAutoredImagesFromRecord(autored?: Record<string, unknown> | null): string[] {
  if (!autored) return [];
  const urls: string[] = [];
  const push = (value?: string) => {
    if (value?.startsWith("http") && !urls.includes(value)) urls.push(value);
  };
  const merged: Record<string, unknown> = { ...autored };
  for (const value of Object.values(autored)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(merged, value as Record<string, unknown>);
    }
  }
  for (const key of ["imagenes", "fotos", "fotos_urls", "images", "photos", "galeria", "galeria_fotos"]) {
    const candidate = merged[key];
    if (Array.isArray(candidate)) {
      for (const entry of candidate) {
        if (typeof entry === "string") push(entry.trim());
      }
    } else if (typeof candidate === "string" && candidate.startsWith("http")) {
      push(candidate.trim());
    }
  }
  for (const key of ["thumbnail", "imagen_principal", "foto_portada", "foto_principal"]) {
    const value = merged[key];
    if (typeof value === "string") push(value.trim());
  }
  return urls;
}
