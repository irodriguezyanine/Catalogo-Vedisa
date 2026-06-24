/** Extracción compartida de miniaturas/galería desde payloads Glo3D. */

export type Glo3dImageEntry = {
  raw: Record<string, unknown>;
  technicalFields?: Record<string, unknown>;
};

/** Normaliza URLs de imagen (http, //, rutas relativas glo3d.net). */
export function normalizeCatalogImageUrl(value?: string | null): string | undefined {
  if (!value?.trim()) return undefined;
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("/")) return `https://glo3d.net${trimmed}`;
  return undefined;
}

function pickStringField(row: Record<string, unknown>, aliases: string[]): string | undefined {
  for (const alias of aliases) {
    const direct = row[alias];
    if (typeof direct === "string" && direct.trim()) return direct.trim();
    if (typeof direct === "number") return String(direct);
  }
  const lower = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) lower.set(key.toLowerCase(), value);
  for (const alias of aliases) {
    const value = lower.get(alias.toLowerCase());
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

export function pickImageUrlFromValue(value: unknown): string | undefined {
  if (typeof value === "string") return normalizeCatalogImageUrl(value);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const key of [
      "url",
      "src",
      "href",
      "image",
      "imagen",
      "thumb",
      "thumbnail",
      "image_url",
      "thumbnail_url",
      "photo",
      "picture",
    ]) {
      const candidate = record[key];
      if (typeof candidate === "string") {
        const normalized = normalizeCatalogImageUrl(candidate);
        if (normalized) return normalized;
      }
    }
  }
  return undefined;
}

function normalizeImageList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => {
        const fromString = typeof entry === "string" ? normalizeCatalogImageUrl(entry) : undefined;
        if (fromString) return [fromString];
        const fromObject = pickImageUrlFromValue(entry);
        return fromObject ? [fromObject] : [];
      })
      .filter(Boolean);
  }
  if (typeof value === "string") {
    const direct = normalizeCatalogImageUrl(value);
    if (direct) return [direct];
    return value
      .split(/[\n,;|]+/)
      .map((part) => normalizeCatalogImageUrl(part.trim()))
      .filter((url): url is string => Boolean(url));
  }
  const fromObject = pickImageUrlFromValue(value);
  return fromObject ? [fromObject] : [];
}

function pushUnique(urls: string[], value?: string) {
  const normalized = value ? normalizeCatalogImageUrl(value) : undefined;
  if (normalized && !urls.includes(normalized)) urls.push(normalized);
}

function pushMany(urls: string[], value: unknown) {
  for (const url of normalizeImageList(value)) pushUnique(urls, url);
}

/** Extrae todas las URLs de imagen utilizables desde un registro Glo3D. */
export function extractGlo3dImagesFromSources(
  raw: Record<string, unknown>,
  technicalFields: Record<string, unknown> = {},
): string[] {
  const urls: string[] = [];
  const merged = { ...raw, ...technicalFields };

  for (const key of [
    "thumb",
    "thumbnail",
    "thumbnail_url",
    "image",
    "image_url",
    "foto",
    "foto_portada",
    "imagen_principal",
    "main_image",
    "cover",
    "poster",
    "preview",
    "preview_url",
    "hero_image",
    "listing_image",
  ]) {
    pushUnique(urls, pickStringField(merged, [key]));
    const nested = merged[key];
    pushUnique(urls, pickImageUrlFromValue(nested));
  }

  pushUnique(urls, pickImageUrlFromValue(merged.main_frame));
  pushUnique(urls, pickImageUrlFromValue(raw.main_frame));

  for (const key of [
    "imagenes",
    "images",
    "photos",
    "fotos",
    "galeria",
    "gallery",
    "frames",
    "gallery_images",
    "exterior_images",
    "interior_images",
  ]) {
    pushMany(urls, merged[key]);
    pushMany(urls, raw[key]);
  }

  for (const key of ["src_with_params", "src", "iframe_with_params"]) {
    const candidate = pickStringField(merged, [key]) ?? pickStringField(raw, [key]);
    if (candidate && /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(candidate)) {
      pushUnique(urls, candidate);
    }
  }

  const frames = merged.frames ?? raw.frames;
  if (Array.isArray(frames)) {
    for (const frame of frames) {
      pushUnique(urls, typeof frame === "string" ? frame : pickImageUrlFromValue(frame));
    }
  } else {
    pushUnique(urls, pickImageUrlFromValue(frames));
  }

  const gallery = merged.gallery ?? raw.gallery;
  if (gallery && typeof gallery === "object" && !Array.isArray(gallery)) {
    for (const section of Object.values(gallery as Record<string, unknown>)) {
      pushMany(urls, section);
      if (section && typeof section === "object" && !Array.isArray(section)) {
        const record = section as Record<string, unknown>;
        for (const key of ["image_url", "url", "thumb", "thumbnail", "src", "image"]) {
          pushUnique(urls, pickStringField(record, [key]));
          pushUnique(urls, pickImageUrlFromValue(record[key]));
        }
      }
    }
  }

  deepCollectImageUrls(raw, urls, 0);
  deepCollectImageUrls(technicalFields, urls, 0);

  return urls;
}

const MAX_DEEP_SCAN_DEPTH = 8;
const IMAGE_URL_PATTERN =
  /^https?:\/\/[^\s"'<>]+\.(jpe?g|png|webp|gif|avif)(\?[^\s"'<>]*)?$/i;
const STORAGE_URL_PATTERN =
  /^https?:\/\/[^\s"'<>]*(firebasestorage|storage\.googleapis|cloudinary|glo3d)[^\s"'<>]*/i;

function deepCollectImageUrls(node: unknown, urls: string[], depth: number) {
  if (depth > MAX_DEEP_SCAN_DEPTH || node == null) return;
  if (typeof node === "string") {
    const normalized = normalizeCatalogImageUrl(node);
    if (normalized && (IMAGE_URL_PATTERN.test(normalized) || STORAGE_URL_PATTERN.test(normalized))) {
      pushUnique(urls, normalized);
    }
    return;
  }
  if (Array.isArray(node)) {
    for (const entry of node) deepCollectImageUrls(entry, urls, depth + 1);
    return;
  }
  if (typeof node === "object") {
    for (const value of Object.values(node as Record<string, unknown>)) {
      deepCollectImageUrls(value, urls, depth + 1);
    }
  }
}

export function extractGlo3dInventoryImages(entry: Glo3dImageEntry): string[] {
  return extractGlo3dImagesFromSources(entry.raw, entry.technicalFields ?? {});
}

export function glo3dSourcesHaveUsableImages(
  raw: Record<string, unknown>,
  technicalFields: Record<string, unknown> = {},
): boolean {
  return extractGlo3dImagesFromSources(raw, technicalFields).length > 0;
}

export function applyGlo3dImagesToInventarioRow(
  row: Record<string, unknown>,
  images: string[],
): Record<string, unknown> {
  if (images.length === 0) return row;
  const primary = images[0];
  return {
    ...row,
    imagenes: images,
    fotos_urls: images,
    fotos: images,
    thumbnail: primary,
    imagen_principal: primary,
    foto_portada: primary,
  };
}
