const PATENT_DETAIL_LABELS = new Set(["patente", "patente verificador"]);

function normalizePatentKey(value?: string | null): string {
  return String(value ?? "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "");
}

export function shouldShowPatentsToViewer(isAdmin: boolean): boolean {
  return isAdmin;
}

export function maskPatentForDisplay(patent: string, isAdmin: boolean): string {
  if (isAdmin) return patent;
  return "";
}

export function stripPatentFromPublicText(
  text: string | undefined,
  patent: string,
  showPatents: boolean,
): string | undefined {
  if (!text?.trim()) return undefined;
  if (showPatents) return text.trim();
  const patentNorm = normalizePatentKey(patent);
  if (!patentNorm || patentNorm === "—") return text.trim();
  const trimmed = text.trim();
  if (normalizePatentKey(trimmed) === patentNorm) return undefined;
  const parts = trimmed
    .split(/\s*·\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  const filtered = parts.filter((part) => normalizePatentKey(part) !== patentNorm);
  if (filtered.length === 0) return undefined;
  return filtered.join(" · ");
}

export function isPatentLikePublicTitle(title: string, patent: string): boolean {
  const patentNorm = normalizePatentKey(patent);
  if (!patentNorm || patentNorm === "—") return false;
  const titleNorm = normalizePatentKey(title);
  if (titleNorm === patentNorm) return true;
  const compact = title.trim().toUpperCase();
  if (compact.startsWith("UNIDAD ") && compact.includes(patentNorm)) return true;
  return false;
}

export function sanitizePublicVehicleTitle(
  title: string,
  patent: string,
  showPatents: boolean,
  fallbackTitle?: string,
): string {
  if (showPatents || !isPatentLikePublicTitle(title, patent)) return title;
  return fallbackTitle?.trim() || "Vehículo disponible";
}

export function maskPatentForPdf(patent: string, showPatents: boolean): string {
  if (showPatents) return patent;
  return "";
}

export function filterPatentDetailFields(
  fields: Array<[string, string]>,
  showPatents: boolean,
): Array<[string, string]> {
  if (showPatents) return fields;
  return fields.filter(([label]) => !PATENT_DETAIL_LABELS.has(label.trim().toLowerCase()));
}

export function isPatentDetailLabel(label: string): boolean {
  return PATENT_DETAIL_LABELS.has(label.trim().toLowerCase());
}
