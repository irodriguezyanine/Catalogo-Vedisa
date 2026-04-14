import Image from "next/image";
import { CatalogCard } from "@/components/catalog-card";
import { getCatalogFeed, sourceLabel } from "@/lib/catalog";
import type { CatalogItem } from "@/types/catalog";

export const revalidate = 300;

type SectionProps = {
  id: string;
  title: string;
  subtitle: string;
  items: CatalogItem[];
  badgeClassName: string;
};

type FeaturedStripProps = {
  items: CatalogItem[];
};

function normalizeText(value?: string): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function pickByKeyword(items: CatalogItem[], keyword: string): CatalogItem[] {
  return items.filter((item) => {
    const joined = normalizeText(
      [item.status, item.subtitle, item.title, item.location].filter(Boolean).join(" "),
    );
    return joined.includes(keyword);
  });
}

function sectionFallback(items: CatalogItem[], start: number, count: number): CatalogItem[] {
  return items.slice(start, start + count);
}

function formatDate(date?: string): string | undefined {
  if (!date) return undefined;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function FeaturedStrip({ items }: FeaturedStripProps) {
  if (items.length === 0) return null;

  return (
    <section className="section-shell">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="premium-kicker">Selecciones premium</p>
          <h2 className="text-2xl font-bold text-white">Vitrina destacada</h2>
        </div>
        <p className="text-xs text-zinc-400">Desliza horizontalmente</p>
      </div>
      <div className="featured-strip">
        {items.map((item) => {
          const image = item.thumbnail ?? item.images[0] ?? "/placeholder-car.svg";
          const date = formatDate(item.auctionDate);
          return (
            <article key={`featured-${item.id}`} className="featured-item">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt={item.title} className="featured-image" loading="lazy" />
              <div className="featured-overlay" />
              <div className="featured-content">
                <p className="line-clamp-1 text-sm font-semibold uppercase tracking-wide text-cyan-300">
                  {item.status ?? "Unidad disponible"}
                </p>
                <h3 className="line-clamp-2 text-xl font-bold text-white">{item.title}</h3>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-200">
                  {item.subtitle ? <span className="featured-chip">{item.subtitle}</span> : null}
                  {date ? <span className="featured-chip">Remate {date}</span> : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Section({ id, title, subtitle, items, badgeClassName }: SectionProps) {
  return (
    <section id={id} className="section-shell scroll-mt-24">
      <header className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="premium-kicker">
            Seccion destacada
          </p>
          <h2 className="text-2xl font-bold text-white">{title}</h2>
          <p className="mt-1 text-sm text-zinc-300">{subtitle}</p>
        </div>
        <span className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${badgeClassName}`}>
          {items.length} publicaciones
        </span>
      </header>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/70 p-6 text-sm text-zinc-400">
          No hay elementos disponibles en esta seccion por ahora.
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <CatalogCard key={`${id}-${item.id}`} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}

export default async function Home() {
  const feed = await getCatalogFeed();
  const items = feed.items;
  const proximosByKeyword = pickByKeyword(items, "proxim");
  const ventasByKeyword = pickByKeyword(items, "venta directa");
  const novedadesByKeyword = pickByKeyword(items, "novedad");
  const proximosRemates =
    proximosByKeyword.length > 0 ? proximosByKeyword.slice(0, 6) : sectionFallback(items, 0, 6);
  const ventasDirectas =
    ventasByKeyword.length > 0 ? ventasByKeyword.slice(0, 6) : sectionFallback(items, 2, 6);
  const novedades =
    novedadesByKeyword.length > 0 ? novedadesByKeyword.slice(0, 6) : sectionFallback(items, 4, 6);
  const catalogo = items.slice(0, 12);
  const premiumPicks = items.slice(0, 8);
  const stats = [
    { label: "Publicaciones activas", value: String(items.length) },
    { label: "Fuente de datos", value: sourceLabel(feed.source) },
    { label: "Cobertura", value: "Nacional" },
    { label: "Actualizacion", value: "Cada 5 min" },
  ];

  return (
    <main className="premium-bg min-h-screen text-white">
      <div className="premium-glow premium-glow-cyan" />
      <div className="premium-glow premium-glow-gold" />

      <section className="relative z-10 border-b border-white/10 bg-black/40 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <Image
              src="/vedisa-logo.png"
              alt="Logo Vedisa Remates"
              width={440}
              height={90}
              priority
              className="h-auto w-full max-w-md"
            />
            <nav className="flex flex-wrap gap-2 text-sm">
              <a
                href="#proximos-remates"
                className="rounded-full border border-zinc-700 bg-zinc-900/40 px-3 py-1 transition hover:border-cyan-400 hover:text-cyan-300"
              >
                Proximos remates
              </a>
              <a
                href="#ventas-directas"
                className="rounded-full border border-zinc-700 bg-zinc-900/40 px-3 py-1 transition hover:border-cyan-400 hover:text-cyan-300"
              >
                Ventas Directas
              </a>
              <a
                href="#novedades"
                className="rounded-full border border-zinc-700 bg-zinc-900/40 px-3 py-1 transition hover:border-cyan-400 hover:text-cyan-300"
              >
                Novedades
              </a>
              <a
                href="#catalogo"
                className="rounded-full border border-zinc-700 bg-zinc-900/40 px-3 py-1 transition hover:border-cyan-400 hover:text-cyan-300"
              >
                Catalogo
              </a>
            </nav>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-zinc-300">
              Plataforma de exhibicion de remates e inventario con actualizacion dinamica.
            </p>
            <div className="flex items-center gap-2 text-xs">
              <span className="rounded-full bg-emerald-600 px-3 py-1 font-semibold text-white">
                Fuente: {sourceLabel(feed.source)}
              </span>
              <span className="rounded-full bg-zinc-800 px-3 py-1 text-zinc-200">
                {items.length} vehiculos
              </span>
            </div>
          </div>
          {feed.warning ? (
            <p className="rounded-md border border-amber-300/60 bg-amber-100 px-3 py-2 text-sm text-amber-900">
              {feed.warning}
            </p>
          ) : null}
        </div>
      </section>

      <section className="relative z-10 mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-5 lg:px-8">
        <div className="premium-panel premium-panel-hero lg:col-span-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
            Landing Premium
          </p>
          <h1 className="mt-3 text-3xl font-black leading-tight text-white md:text-5xl">
            Plataforma corporativa para exhibir remates y ventas de alto impacto.
          </h1>
          <p className="mt-4 max-w-2xl text-sm text-zinc-300 md:text-base">
            Vedisaremates conecta inventario dinamico, fotografias y experiencia visual moderna para una vitrina
            digital confiable, elegante y orientada a conversion.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="#catalogo"
              className="premium-btn-primary"
            >
              Ver catalogo completo
            </a>
            <a
              href="#proximos-remates"
              className="premium-btn-secondary"
            >
              Explorar secciones
            </a>
          </div>
        </div>
        <div className="grid gap-3 lg:col-span-2">
          {stats.map((stat) => (
            <div key={stat.label} className="premium-stat">
              <p className="text-xs uppercase tracking-widest text-zinc-400">{stat.label}</p>
              <p className="mt-1 text-xl font-bold text-white">{stat.value}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="relative z-10 mx-auto flex max-w-7xl flex-col gap-14 px-4 pb-14 sm:px-6 lg:px-8">
        <FeaturedStrip items={premiumPicks} />

        <section className="section-shell">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="premium-stat">
              <p className="premium-kicker">Experiencia</p>
              <h3 className="mt-1 text-lg font-bold text-white">Navegacion fluida</h3>
              <p className="mt-2 text-sm text-zinc-300">
                Arquitectura optimizada para mostrar mas inventario con carga veloz.
              </p>
            </div>
            <div className="premium-stat">
              <p className="premium-kicker">Confianza</p>
              <h3 className="mt-1 text-lg font-bold text-white">Data centralizada</h3>
              <p className="mt-2 text-sm text-zinc-300">
                Integracion directa a Supabase para evitar desfases entre sistemas.
              </p>
            </div>
            <div className="premium-stat">
              <p className="premium-kicker">Escalabilidad</p>
              <h3 className="mt-1 text-lg font-bold text-white">Listo para crecer</h3>
              <p className="mt-2 text-sm text-zinc-300">
                Base preparada para agregar buscador avanzado, filtros y portal de clientes.
              </p>
            </div>
          </div>
        </section>

        <Section
          id="proximos-remates"
          title="Proximos remates"
          subtitle="Vehiculos en agenda con mayor prioridad comercial."
          items={proximosRemates}
          badgeClassName="bg-cyan-100 text-cyan-900"
        />
        <Section
          id="ventas-directas"
          title="Ventas Directas"
          subtitle="Stock disponible para cierre rapido."
          items={ventasDirectas}
          badgeClassName="bg-emerald-100 text-emerald-900"
        />
        <Section
          id="novedades"
          title="Novedades"
          subtitle="Ultimas unidades ingresadas al ecosistema Vedisa."
          items={novedades}
          badgeClassName="bg-amber-100 text-amber-900"
        />
        <Section
          id="catalogo"
          title="Catalogo"
          subtitle="Galeria general con historial de remates y unidades destacadas."
          items={catalogo}
          badgeClassName="bg-zinc-200 text-zinc-900"
        />

        <section className="section-shell">
          <div className="premium-panel">
            <p className="premium-kicker">Call to action</p>
            <h2 className="mt-2 text-2xl font-bold text-white md:text-3xl">
              Potencia tu vitrina digital con una experiencia de remates de nivel corporativo.
            </h2>
            <p className="mt-3 max-w-2xl text-sm text-zinc-300">
              Este landing ya esta listo para integrar filtros inteligentes, formularios de contacto y automatizaciones
              comerciales para cerrar mas oportunidades.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="#catalogo" className="premium-btn-primary">
                Ir al catalogo
              </a>
              <a href="#ventas-directas" className="premium-btn-secondary">
                Ver ventas directas
              </a>
            </div>
          </div>
        </section>
      </div>

      <footer className="border-t border-white/10 bg-black/50">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-zinc-400 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <p>VEDISAREMATES.CL · Maximizacion de recupero vehicular</p>
          <p>Catalogo corporativo con actualizacion automatica de inventario</p>
        </div>
      </footer>
    </main>
  );
}
