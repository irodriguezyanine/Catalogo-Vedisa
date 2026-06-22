import { cloudinaryRawPdfUrlForInlineDisplay } from "@/lib/cloudinary-delivery";

export type LotDocumentLink = {
  url: string;
  label: string;
  mimeType?: string;
  /** Solo importados del editor; por defecto visible. */
  visibleInCatalog?: boolean;
};

export type LotDocumentKind = "pdf" | "image" | "excel" | "word" | "presentation" | "file";

export function parseLotDocumentsJson(json: string | undefined | null): LotDocumentLink[] {
  if (!json?.trim()) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: LotDocumentLink[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as Record<string, unknown>;
      const url = typeof row.url === "string" ? row.url.trim() : "";
      if (!url.startsWith("http")) continue;
      const label = typeof row.label === "string" && row.label.trim() ? row.label.trim() : "Documento";
      const mimeType = typeof row.mimeType === "string" ? row.mimeType : undefined;
      const visibleInCatalog =
        row.visibleInCatalog === false || row.visible_in_catalog === false ? false : true;
      out.push({ url, label, mimeType, visibleInCatalog });
    }
    return out;
  } catch {
    return [];
  }
}

export function serializeLotDocumentsJson(docs: LotDocumentLink[]): string {
  const clean = docs
    .map((doc) => ({
      url: doc.url.trim(),
      label: doc.label.trim() || "Documento",
      ...(doc.mimeType?.trim() ? { mimeType: doc.mimeType.trim() } : {}),
      ...(doc.visibleInCatalog === false ? { visibleInCatalog: false } : {}),
    }))
    .filter((doc) => doc.url.startsWith("http"));
  return JSON.stringify(clean);
}

export function inferLotDocumentKind(url: string, mimeType?: string): LotDocumentKind {
  const mime = (mimeType ?? "").toLowerCase();
  if (mime.includes("pdf") || /\.pdf($|\?)/i.test(url)) return "pdf";
  if (mime.startsWith("image/") || /\.(jpe?g|png|gif|webp|avif)($|\?)/i.test(url)) return "image";
  if (mime.includes("spreadsheet") || mime.includes("excel") || /\.xlsx?($|\?)/i.test(url)) return "excel";
  if (mime.includes("word") || /\.docx?($|\?)/i.test(url)) return "word";
  if (mime.includes("presentation") || mime.includes("powerpoint") || /\.pptx?($|\?)/i.test(url)) {
    return "presentation";
  }
  return "file";
}

export function lotDocumentKindLabel(kind: LotDocumentKind): string {
  if (kind === "pdf") return "PDF";
  if (kind === "image") return "IMG";
  if (kind === "excel") return "XLS";
  if (kind === "word") return "DOC";
  if (kind === "presentation") return "PPT";
  return "FILE";
}

export function lotDocumentKindBadgeClass(kind: LotDocumentKind): string {
  if (kind === "pdf") return "bg-red-50 text-red-700";
  if (kind === "image") return "bg-sky-50 text-sky-700";
  if (kind === "excel") return "bg-emerald-50 text-emerald-700";
  if (kind === "word") return "bg-blue-50 text-blue-700";
  if (kind === "presentation") return "bg-orange-50 text-orange-700";
  return "bg-slate-100 text-slate-700";
}

export function lotDocumentOpenUrl(url: string, kind: LotDocumentKind): string {
  if (kind === "image") return url;
  return cloudinaryRawPdfUrlForInlineDisplay(url);
}

function normalizeDocUrlKey(url: string): string {
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    return `${parsed.origin}${parsed.pathname}`.toLowerCase();
  } catch {
    return trimmed.toLowerCase().split("?")[0] ?? "";
  }
}

export function normalizeLotDocumentLabelKey(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isLotDocumentLabelBlocked(
  label: string,
  blockedLabels: Iterable<string>,
): boolean {
  const key = normalizeLotDocumentLabelKey(label);
  for (const blocked of blockedLabels) {
    if (normalizeLotDocumentLabelKey(blocked) === key) return true;
  }
  return false;
}

function normalizeDocLabelKey(label: string): string {
  return normalizeLotDocumentLabelKey(label);
}

/**
 * Une listas (p. ej. API Tasaciones + editor/catálogo) sin repetir por URL ni por nombre de archivo.
 * La primera lista tiene prioridad (recomendado: Tasaciones antes que importados externos).
 */
export function mergeLotDocumentLinks(...lists: LotDocumentLink[][]): LotDocumentLink[] {
  const seenUrls = new Set<string>();
  const seenLabels = new Set<string>();
  const out: LotDocumentLink[] = [];
  for (const list of lists) {
    for (const doc of list) {
      const url = doc.url.trim();
      if (!url.startsWith("http")) continue;
      const urlKey = normalizeDocUrlKey(url);
      const labelKey = normalizeDocLabelKey(doc.label || "Documento");
      if (seenUrls.has(urlKey) || seenLabels.has(labelKey)) continue;
      seenUrls.add(urlKey);
      seenLabels.add(labelKey);
      out.push({ ...doc, url, label: doc.label.trim() || "Documento" });
    }
  }
  return out;
}
