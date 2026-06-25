/** Fusión de imágenes Glo3D + Autored + Tasaciones con prioridad Glo3D para miniatura y visor. */

export type CatalogThumbnailSource = "glo3d" | "autored" | "inventario" | "none";

export function isGlo3dCatalogImageUrl(url: string): boolean {
  return /glo3d|firebasestorage|storage\.googleapis|googleusercontent/i.test(url);
}

/** Fotos subidas en Inventario → pestaña Fotos (Supabase inventario-documentos). */
export function isTasacionesInventoryPhotoUrl(url: string): boolean {
  return /inventario-documentos|inventario_documentos/i.test(url);
}

export function isAutoredGenericModelImageUrl(url: string): boolean {
  return /autored-public-files\.s3\.amazonaws\.com\/autored\/models\//i.test(url);
}

function partitionInventarioImages(
  inventarioImages: string[],
  reserved: Set<string>,
): {
  extraGlo3d: string[];
  inventarioMisc: string[];
  tasaciones: string[];
} {
  const extraGlo3d: string[] = [];
  const inventarioMisc: string[] = [];
  const tasaciones: string[] = [];
  for (const url of inventarioImages) {
    if (reserved.has(url)) continue;
    if (isGlo3dCatalogImageUrl(url)) extraGlo3d.push(url);
    else if (isTasacionesInventoryPhotoUrl(url)) tasaciones.push(url);
    else inventarioMisc.push(url);
  }
  return { extraGlo3d, inventarioMisc, tasaciones };
}

export function mergeVehicleImageSources(options: {
  glo3dImages: string[];
  autoredImages: string[];
  inventarioImages?: string[];
}): {
  images: string[];
  thumbnail?: string;
  thumbnailSource: CatalogThumbnailSource;
} {
  const autoredImages = options.autoredImages.filter((url) => url.startsWith("http"));
  const inventarioImages = (options.inventarioImages ?? []).filter((url) => url.startsWith("http"));
  const reserved = new Set<string>([
    ...options.glo3dImages.filter((url) => url.startsWith("http")),
    ...autoredImages,
  ]);
  const { extraGlo3d, inventarioMisc, tasaciones } = partitionInventarioImages(
    inventarioImages,
    reserved,
  );
  const glo3dImages = [
    ...new Set([
      ...options.glo3dImages.filter((url) => url.startsWith("http")),
      ...extraGlo3d,
    ]),
  ];

  const thumbnail =
    glo3dImages[0] ??
    autoredImages.find((url) => !isAutoredGenericModelImageUrl(url)) ??
    autoredImages[0] ??
    inventarioMisc[0] ??
    tasaciones[0];
  const thumbnailSource: CatalogThumbnailSource = glo3dImages[0]
    ? "glo3d"
    : autoredImages[0]
      ? "autored"
      : inventarioMisc[0] || tasaciones[0]
        ? "inventario"
        : "none";

  const images = [
    ...new Set([
      ...glo3dImages,
      ...(glo3dImages.length === 0 ? autoredImages : []),
      ...inventarioMisc.filter(
        (url) => !glo3dImages.includes(url) && !autoredImages.includes(url),
      ),
      ...tasaciones.filter(
        (url) => !glo3dImages.includes(url) && !autoredImages.includes(url),
      ),
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
