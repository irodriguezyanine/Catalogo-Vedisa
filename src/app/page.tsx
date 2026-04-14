import { CatalogCard } from "@/components/catalog-card";
import { getCatalogFeed, sourceLabel } from "@/lib/catalog";

export const revalidate = 300;

export default async function Home() {
  const feed = await getCatalogFeed();

  return (
    <main className="min-h-screen bg-zinc-50">
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-cyan-700">
                Catalogo Vedisa
              </p>
              <h1 className="mt-1 text-2xl font-bold text-zinc-900 md:text-3xl">
                Historial de remates e inventario visual
              </h1>
              <p className="mt-2 text-sm text-zinc-600">
                Vista dinamica conectada a la fuente de datos de Tasaciones.
              </p>
            </div>

            <div className="space-y-2 text-left md:text-right">
              <p className="inline-flex rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
                Fuente: {sourceLabel(feed.source)}
              </p>
              <p className="text-sm text-zinc-600">{feed.items.length} vehiculos cargados</p>
            </div>
          </div>
          {feed.warning ? (
            <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {feed.warning}
            </p>
          ) : null}
        </header>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
        {feed.items.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center shadow-sm">
            <p className="text-lg font-medium text-zinc-800">
              Aun no hay vehiculos disponibles para el catalogo.
            </p>
            <p className="mt-2 text-sm text-zinc-500">
              Revisa la configuracion de variables de entorno y la conectividad.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {feed.items.map((item) => (
              <CatalogCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
