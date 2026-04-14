import { useEffect, useMemo, useState } from "react";
import type { CatalogItem } from "@/types/catalog";

type CatalogCardProps = {
  item: CatalogItem;
  priceLabel?: string | null;
  upcomingAuctionLabel?: string;
  onOpen?: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  isCompared?: boolean;
  onToggleCompare?: () => void;
  onWhatsappClick?: () => void;
};

const WHATSAPP_BASE_URL = "https://api.whatsapp.com/send/?phone=56989323397";

function formatDate(date?: string): string {
  if (!date) return "";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;

  return parsed.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function shortText(value?: string, max = 90): string | undefined {
  if (!value) return undefined;
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function isLikelyImageUrl(url?: string): boolean {
  if (!url || !url.startsWith("http")) return false;
  const normalized = url.toLowerCase();
  if (normalized.includes("glo3d.net/iframe") || normalized.includes("<iframe")) return false;
  if (/\.(jpg|jpeg|png|webp|gif|bmp|avif)(\?|$)/i.test(normalized)) return true;
  return /cdn\.|cloudfront|amazonaws|supabase|img|image|media/.test(normalized);
}

function getPatent(item: CatalogItem): string {
  const raw = item.raw as Record<string, unknown>;
  const value = [raw.patente, raw.PATENTE, raw.PPU, raw.stock_number].find(
    (entry) => typeof entry === "string" && entry.trim().length > 0,
  ) as string | undefined;
  return value?.trim().toUpperCase().replace(/\s+/g, "").replace(/-/g, "") ?? "S/PATENTE";
}

function getBrandModel(item: CatalogItem): string {
  const raw = item.raw as Record<string, unknown>;
  const brand = [raw.marca, raw.brand].find(
    (entry) => typeof entry === "string" && entry.trim().length > 0,
  ) as string | undefined;
  const model = [raw.modelo, raw.model, item.title].find(
    (entry) => typeof entry === "string" && entry.trim().length > 0,
  ) as string | undefined;
  return `${brand ?? ""} ${model ?? ""}`.trim() || item.title;
}

export function CatalogCard({
  item,
  priceLabel,
  upcomingAuctionLabel,
  onOpen,
  isFavorite,
  onToggleFavorite,
  isCompared,
  onToggleCompare,
  onWhatsappClick,
}: CatalogCardProps) {
  const coverCandidate = item.thumbnail ?? item.images[0];
  const cover = isLikelyImageUrl(coverCandidate) ? (coverCandidate as string) : "/placeholder-car.svg";
  const [coverSrc, setCoverSrc] = useState(cover);
  const thumbs = useMemo(
    () =>
      item.images
        .filter((url) => isLikelyImageUrl(url) && url !== coverSrc)
        .slice(0, 8),
    [item.images, coverSrc],
  );
  const formattedDate = formatDate(item.auctionDate);
  const patent = getPatent(item);
  const brandModel = getBrandModel(item);
  const whatsappText = `Hola, estoy interesado en ofertar por el vehículo ${patent} ${brandModel}`;
  const whatsappUrl = `${WHATSAPP_BASE_URL}&text=${encodeURIComponent(whatsappText)}&type=phone_number&app_absent=0`;

  useEffect(() => {
    setCoverSrc(cover);
  }, [cover]);

  return (
    <article className="group glass-soft w-full overflow-hidden rounded-2xl text-left shadow-md transition duration-300 hover:-translate-y-1 hover:border-cyan-300 hover:shadow-lg">
      <button type="button" onClick={onOpen} className="ui-focus w-full text-left">
        <div className="relative h-56 w-full bg-slate-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverSrc}
            alt={item.title}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            loading="lazy"
            onError={() => setCoverSrc("/placeholder-car.svg")}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-transparent" />
          <div className="absolute left-3 top-3 flex flex-wrap gap-1">
            {item.view3dUrl ? (
              <span className="rounded-full bg-cyan-500 px-2 py-1 text-[10px] font-semibold text-white">3D</span>
            ) : null}
            {priceLabel ? (
              <span className="rounded-full bg-amber-500 px-2 py-1 text-[10px] font-semibold text-white">Precio</span>
            ) : null}
          </div>
          {item.status ? (
            <span className="absolute right-3 top-3 rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-white">
              {item.status}
            </span>
          ) : null}
        </div>

        <div className="space-y-3 p-4">
          <div>
            <h3 className="line-clamp-1 text-base font-semibold text-slate-900">
              {item.title}
            </h3>
            {item.subtitle ? (
              <p className="mt-1 text-sm text-slate-600">{shortText(item.subtitle)}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2 text-xs text-slate-700">
            {item.lot ? (
              <span className="rounded-full bg-slate-100 px-2 py-1">Lote {item.lot}</span>
            ) : null}
            {formattedDate ? (
              <span className="rounded-full bg-slate-100 px-2 py-1">
                Remate {formattedDate}
              </span>
            ) : null}
            {item.location ? (
              <span className="rounded-full bg-slate-100 px-2 py-1">
                {shortText(item.location, 35)}
              </span>
            ) : null}
            {upcomingAuctionLabel ? (
              <span className="rounded-full bg-indigo-100 px-2 py-1 font-semibold text-indigo-700">
                {shortText(`Remate: ${upcomingAuctionLabel}`, 38)}
              </span>
            ) : null}
          </div>

          {thumbs.length > 1 ? (
            <div className="grid grid-cols-6 gap-1">
              {thumbs.map((thumb) => (
                <div key={thumb} className="h-10 overflow-hidden rounded bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumb}
                    alt={`${item.title} miniatura`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex items-center justify-between border-t border-slate-200 pt-3">
            <div className="flex flex-col">
              {priceLabel ? <span className="text-sm font-semibold text-cyan-700">{priceLabel}</span> : null}
              <span className="text-xs text-slate-500">
                {item.images.length} foto{item.images.length === 1 ? "" : "s"}
              </span>
            </div>
            {item.view3dUrl ? (
              <span className="rounded-md bg-cyan-100 px-3 py-1.5 text-xs font-medium text-cyan-800">
                Ver detalle 3D
              </span>
            ) : (
              <span className="text-xs text-slate-400">Ver detalle</span>
            )}
          </div>
        </div>
      </button>

      <div className="space-y-2 border-t border-slate-100 px-4 pb-4 pt-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onToggleFavorite}
            className={`ui-focus inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              isFavorite
                ? "border-amber-300 bg-amber-50 text-amber-700"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <span aria-hidden="true">{isFavorite ? "★" : "☆"}</span>
            {isFavorite ? "Guardado" : "Guardar"}
          </button>
          <button
            type="button"
            onClick={onToggleCompare}
            className={`ui-focus inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              isCompared
                ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <span aria-hidden="true">{isCompared ? "✓" : "+"}</span>
            {isCompared ? "Comparando" : "Comparar"}
          </button>
        </div>
        <div className="flex justify-end">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer"
            onClick={onWhatsappClick}
            className="ui-focus inline-flex items-center gap-2 rounded-full bg-[#25D366] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:brightness-95"
            aria-label={`Contactar por WhatsApp por ${item.title}`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
              <path d="M12.04 2C6.58 2 2.16 6.42 2.16 11.88c0 1.75.46 3.45 1.32 4.95L2 22l5.33-1.4a9.83 9.83 0 0 0 4.7 1.2h.01c5.45 0 9.88-4.43 9.88-9.89A9.86 9.86 0 0 0 12.04 2zm0 17.96h-.01a8.08 8.08 0 0 1-4.11-1.12l-.3-.18-3.16.83.84-3.09-.2-.32a8.03 8.03 0 0 1-1.24-4.2 8.2 8.2 0 1 1 8.19 8.08zm4.49-6.14c-.25-.12-1.48-.73-1.71-.81-.23-.09-.4-.12-.56.12-.16.24-.65.8-.79.97-.15.17-.3.19-.55.07-.25-.12-1.07-.4-2.03-1.28-.75-.66-1.25-1.48-1.4-1.73-.15-.24-.01-.37.11-.49.11-.11.25-.29.37-.43.12-.14.16-.24.24-.4.08-.17.04-.31-.02-.43-.06-.12-.56-1.36-.77-1.87-.2-.48-.41-.41-.56-.42h-.48c-.17 0-.43.06-.65.3-.22.24-.85.83-.85 2.03s.87 2.35.99 2.51c.12.17 1.7 2.6 4.12 3.64.58.25 1.03.4 1.38.51.58.18 1.1.15 1.52.09.46-.07 1.48-.6 1.68-1.17.21-.58.21-1.07.15-1.17-.06-.1-.22-.16-.47-.28z" />
            </svg>
            WhatsApp
          </a>
        </div>
      </div>
    </article>
  );
}
