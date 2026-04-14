import type { CatalogItem } from "@/types/catalog";

type CatalogCardProps = {
  item: CatalogItem;
  priceLabel?: string | null;
  onOpen?: () => void;
};

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

export function CatalogCard({ item, priceLabel, onOpen }: CatalogCardProps) {
  const cover = item.thumbnail ?? item.images[0] ?? "/placeholder-car.svg";
  const thumbs = item.images.slice(0, 8);
  const formattedDate = formatDate(item.auctionDate);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group w-full overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-md transition duration-300 hover:-translate-y-1 hover:border-cyan-300 hover:shadow-lg"
    >
      <div className="relative h-56 w-full bg-slate-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cover}
          alt={item.title}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-transparent" />
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
  );
}
