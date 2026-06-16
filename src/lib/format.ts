/** Formato de precios, fechas y texto para UI del catálogo. */

export function formatClpPrice(value?: number | string | null): string {
  const num = typeof value === "string" ? Number(value.replace(/\D/g, "")) : Number(value ?? 0);
  if (!Number.isFinite(num) || num <= 0) return "No informado";
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatChileDate(value?: string | null): string {
  if (!value?.trim()) return "";
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
  const date = iso ? new Date(`${value.trim()}T12:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return value.trim();
  return date.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function parseImagesCsv(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith("http"));
}

export function isLikelyImageUrl(url?: string | null): boolean {
  if (!url?.trim().startsWith("http")) return false;
  const lower = url.toLowerCase();
  if (lower.includes("placeholder")) return false;
  return (
    /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(lower) ||
    /cloudinary|glo3d|cdn\.|image|foto|thumb|media/i.test(lower)
  );
}
