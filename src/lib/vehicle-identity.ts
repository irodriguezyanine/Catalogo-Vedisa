/** Utilidades compartidas para separar patente (PPU/stock Glo3D) de marca/modelo reales. */

export function normalizePatentKey(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "").replace(/-/g, "");
}

export function looksLikeChileanPatent(value?: string | null): boolean {
  if (!value?.trim()) return false;
  const normalized = normalizePatentKey(value);
  return /^[A-Z]{4}\d{2}$/.test(normalized) || /^[A-Z]{2}\d{4}$/.test(normalized);
}

export function isPlaceholderVehicleIdentity(value?: string | null): boolean {
  if (!value?.trim()) return true;
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return (
    normalized === "sin marca" ||
    normalized === "sin modelo" ||
    normalized === "no informado" ||
    normalized === "sin informacion" ||
    normalized === "unidad"
  );
}

export function sanitizeModeloValue(
  value: string | undefined,
  patente?: string,
): string | undefined {
  if (!value?.trim()) return undefined;
  const trimmed = value.trim();
  if (isPlaceholderVehicleIdentity(trimmed)) return undefined;
  if (patente && normalizePatentKey(trimmed) === normalizePatentKey(patente)) return undefined;
  if (looksLikeChileanPatent(trimmed)) return undefined;
  return trimmed;
}

export function sanitizeMarcaValue(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const trimmed = value.trim();
  if (isPlaceholderVehicleIdentity(trimmed)) return undefined;
  if (looksLikeChileanPatent(trimmed)) return undefined;
  return trimmed;
}

export function autoredRecordHasIdentity(
  record: Record<string, unknown> | null | undefined,
  patente?: string,
): boolean {
  if (!record) return false;
  const merged: Record<string, unknown> = { ...record };
  for (const [key, value] of Object.entries(record)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(merged, value as Record<string, unknown>);
    }
    merged[key.toLowerCase()] = value;
  }
  const read = (aliases: string[]) => {
    for (const alias of aliases) {
      const value = merged[alias] ?? merged[alias.toLowerCase()];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number") return String(value);
    }
    return undefined;
  };
  const marca = sanitizeMarcaValue(
    read(["marca", "brand", "make", "vehicle_brand", "brand_name", "original_brand_name"]),
  );
  const modelo = sanitizeModeloValue(
    read(["modelo", "model", "model2", "vehicle_model", "model_name", "original_model_name"]),
    patente,
  );
  return Boolean(marca || modelo);
}
