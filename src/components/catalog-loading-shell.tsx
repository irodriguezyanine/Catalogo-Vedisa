/** Shell de carga público — solo UI, sin lógica de datos ni integraciones. */
export function CatalogLoadingShell({ message = "Cargando catálogo…" }: { message?: string }) {
  return (
    <div className="premium-bg min-h-screen">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 h-10 w-48 animate-pulse rounded-lg bg-slate-200/80" />
        <div className="mb-8 h-40 animate-pulse rounded-2xl bg-gradient-to-r from-slate-200/60 via-slate-100/80 to-slate-200/60" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={`catalog-loading-skeleton-${index}`}
              className="h-56 animate-pulse rounded-2xl bg-slate-200/70"
            />
          ))}
        </div>
      </div>
      <div className="pointer-events-none fixed inset-x-0 bottom-8 flex justify-center">
        <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white/90 px-4 py-2 shadow-sm backdrop-blur">
          <span
            className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-200 border-t-cyan-600"
            aria-hidden="true"
          />
          <p className="text-sm font-medium text-slate-600">{message}</p>
        </div>
      </div>
    </div>
  );
}
