const PATENT_DETAIL_LABELS = new Set(["patente", "patente verificador"]);

export function shouldShowPatentsToViewer(isAdmin: boolean): boolean {
  return isAdmin;
}

export function maskPatentForDisplay(patent: string, isAdmin: boolean): string {
  if (isAdmin) return patent;
  return "";
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
