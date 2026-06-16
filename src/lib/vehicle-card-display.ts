import type { CatalogItem } from "@/types/catalog";

function normalizeSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function isVedisaNoiseSegment(segment: string): boolean {
  const norm = normalizeSegment(segment);
  return (
    norm.includes("vedisaremates") ||
    norm.includes("vedisaremate") ||
    norm === "vedisa" ||
    norm === "remates" ||
    norm === "remate"
  );
}

function dedupeTitleSegments(title: string): string {
  const parts = title
    .split(/\s*-\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !isVedisaNoiseSegment(part));

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const part of parts) {
    const key = normalizeSegment(part);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(part);
  }
  return unique.join(" - ") || title.trim();
}

function readRawString(raw: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function formatKilometraje(value: unknown): string | null {
  if (value == null) return null;
  const sample = String(value).trim();
  if (!sample) return null;
  const digits = sample.replace(/[^\d]/g, "");
  if (!digits) return sample;
  const amount = Number(digits);
  if (!Number.isFinite(amount)) return sample;
  return new Intl.NumberFormat("es-CL").format(amount);
}

export function toSentenceCase(value?: string | null): string {
  if (!value?.trim()) return "";
  const trimmed = value.trim();
  if (trimmed === trimmed.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(trimmed)) {
    return trimmed
      .toLowerCase()
      .replace(/(?:^|[.!?]\s+)([^\s])/g, (match) => match.toUpperCase());
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function formatVehicleCardTitle(
  item: CatalogItem,
  override?: { brand?: string; model?: string; year?: string },
): string {
  const raw = item.raw as Record<string, unknown>;
  const brand = override?.brand?.trim() || readRawString(raw, ["marca", "brand", "make"]);
  const model = override?.model?.trim() || readRawString(raw, ["modelo", "model", "model2"]);
  const year = override?.year?.trim() || readRawString(raw, ["ano", "anio", "year"]);
  if (brand && model) {
    return [brand, model, year].filter(Boolean).join(" ");
  }
  return dedupeTitleSegments(item.title);
}

export function formatVehicleCardSpecsLine(item: CatalogItem): string | null {
  const raw = item.raw as Record<string, unknown>;
  const parts: string[] = [];
  const year = readRawString(raw, ["ano", "anio", "year"]);
  const km = formatKilometraje(raw.kilometraje ?? raw.kms ?? raw.odometer ?? raw.km);
  const fuel = readRawString(raw, ["combustible", "fuel", "fuel_type"]);
  if (year) parts.push(year);
  if (km) parts.push(`${km} km`);
  if (fuel) parts.push(fuel);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function formatVehicleCardImageAlt(item: CatalogItem): string {
  const title = formatVehicleCardTitle(item);
  const specs = formatVehicleCardSpecsLine(item);
  const raw = item.raw as Record<string, unknown>;
  const kind = readRawString(raw, ["categoria", "tipo_vehiculo", "tipo"]) || "vehículo";
  return specs
    ? `${title}, ${specs}, ${kind} disponible en Vedisa Remates`
    : `${title}, ${kind} disponible en Vedisa Remates`;
}

export function formatVehicleCardSubtitle(value?: string | null, max = 90): string | undefined {
  if (!value?.trim()) return undefined;
  const normalized = toSentenceCase(value.trim());
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized;
}
