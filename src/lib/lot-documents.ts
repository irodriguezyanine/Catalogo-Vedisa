import { cloudinaryRawPdfUrlForInlineDisplay } from "@/lib/cloudinary-delivery";

export type LotDocumentLink = {
  url: string;
  label: string;
  mimeType?: string;
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
      out.push({ url, label, mimeType });
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
