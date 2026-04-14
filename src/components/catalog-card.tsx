import type { CatalogItem } from "@/types/catalog";

type CatalogCardProps = {
  item: CatalogItem;
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

export function CatalogCard({ item }: CatalogCardProps) {
  const cover = item.thumbnail ?? item.images[0] ?? "/placeholder-car.svg";
  const thumbs = item.images.slice(0, 8);
  const formattedDate = formatDate(item.auctionDate);

  return (
    <article className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition hover:shadow-md">
      <div className="relative h-56 w-full bg-zinc-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cover}
          alt={item.title}
          className="h-full w-full object-cover"
          loading="lazy"
        />
        {item.status ? (
          <span className="absolute right-3 top-3 rounded bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
            {item.status}
          </span>
        ) : null}
      </div>

      <div className="space-y-3 p-4">
        <div>
          <h3 className="line-clamp-1 text-base font-semibold text-zinc-900">
            {item.title}
          </h3>
          {item.subtitle ? (
            <p className="mt-1 text-sm text-zinc-600">{shortText(item.subtitle)}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-zinc-600">
          {item.lot ? (
            <span className="rounded-full bg-zinc-100 px-2 py-1">Lote {item.lot}</span>
          ) : null}
          {formattedDate ? (
            <span className="rounded-full bg-zinc-100 px-2 py-1">
              Remate {formattedDate}
            </span>
          ) : null}
          {item.location ? (
            <span className="rounded-full bg-zinc-100 px-2 py-1">
              {shortText(item.location, 35)}
            </span>
          ) : null}
        </div>

        {thumbs.length > 1 ? (
          <div className="grid grid-cols-6 gap-1">
            {thumbs.map((thumb) => (
              <div key={thumb} className="h-10 overflow-hidden rounded bg-zinc-100">
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

        <div className="flex items-center justify-between border-t border-zinc-200 pt-3">
          <span className="text-xs text-zinc-500">
            {item.images.length} foto{item.images.length === 1 ? "" : "s"}
          </span>
          {item.view3dUrl ? (
            <a
              href={item.view3dUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-700"
            >
              Ver 3D
            </a>
          ) : (
            <span className="text-xs text-zinc-400">Sin visor 3D</span>
          )}
        </div>
      </div>
    </article>
  );
}
