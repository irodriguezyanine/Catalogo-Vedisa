const GLO3D_IFRAME_NOVA_BASE = "https://glo3d.net/iframeNova";
const GLO3D_IFRAME_PARAMS =
  "gallery=true&featurevideos=true&condition=false&interior=false&footerGallery=false&zoom=false&navigationarrows=false&spinicon=basic&font=Roboto&topbarblinking=false&fullscreen=false&load=false&autorotate=false&themetextcolor=black";

/** Extrae la URL de un iframe HTML o devuelve la cadena si ya es http(s). */
export function extractGlo3dEmbedUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const raw = value.trim();
  if (!raw) return undefined;
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\$.*$/, "");
  const match = raw.match(/src\s*=\s*["']([^"']+)["']/i);
  return match?.[1]?.trim();
}

export function extractGlo3dId(value?: string): string | undefined {
  if (!value) return undefined;
  const s = value.trim();
  if (!s) return undefined;

  const idQuery = s.match(/[?&]id=([^&\s]+)/);
  if (idQuery?.[1]) return idQuery[1];

  const iframePath = s.match(/glo3d\.net\/(?:iframe|iframeNova)\/([^/?\s]+)/i);
  if (iframePath?.[1]) return iframePath[1];

  const relativeIframePath = s.match(/(?:^|\/)(?:iframe|iframeNova)\/([^/?\s]+)/i);
  if (relativeIframePath?.[1]) return relativeIframePath[1];

  const genericPath = s.match(/glo3d\.net\/([^/?\s]+)(?:\?|$)/i);
  if (genericPath?.[1] && !genericPath[1].match(/^(iframe|iframeNova|embed)$/i)) {
    return genericPath[1];
  }

  return undefined;
}

export function buildGlo3dIframeNovaUrl(id: string): string {
  return `${GLO3D_IFRAME_NOVA_BASE}/${id}?&${GLO3D_IFRAME_PARAMS}`;
}

function normalizeGlo3dUrl(value: string): string {
  if (value.startsWith("//")) return `https:${value}`;
  if (value.startsWith("/")) return `https://glo3d.net${value}`;
  return value;
}

/**
 * Acepta URL corta Glo3D, iframeNova o iframe HTML completo y devuelve una URL usable en src.
 */
export function normalizeGlo3dViewerInput(raw?: string | null): string | undefined {
  if (!raw?.trim()) return undefined;

  const embed = extractGlo3dEmbedUrl(raw.trim());
  if (!embed) return undefined;

  const normalized = normalizeGlo3dUrl(embed).replace(/\$.*$/, "");

  if (/(?:iframe|iframeNova)\//i.test(normalized)) {
    return normalized;
  }

  const id = extractGlo3dId(normalized);
  if (id) {
    return buildGlo3dIframeNovaUrl(id);
  }

  if (normalized.startsWith("http")) return normalized;
  return undefined;
}

export function resolveGlo3dViewerPreviewUrl(raw?: string | null): string | undefined {
  return normalizeGlo3dViewerInput(raw);
}
