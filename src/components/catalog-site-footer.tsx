const MAPS_URL =
  "https://www.google.com/maps/search/?api=1&query=Arturo+Prat+6457,+Noviciado,+Pudahuel,+Chile";

export function CatalogSiteFooter() {
  return (
    <footer className="relative z-10 border-t border-cyan-100/80 bg-white/90">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.2fr_1fr] lg:px-8">
        <div>
          <p className="premium-kicker">Visítanos</p>
          <h2 className="text-xl font-bold text-slate-900 md:text-2xl">Exhibición y retiro en bodega</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">
            Arturo Prat 6457, Noviciado, Pudahuel · Santiago, Chile
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-800">
            Lunes a viernes · 9:00–13:00 / 14:00–17:00
          </p>
          <a
            href={MAPS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="ui-focus premium-btn-primary mt-4 inline-flex min-h-11 items-center px-5"
          >
            Abrir en Google Maps
          </a>
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-md">
          <iframe
            title="Mapa de exhibición Vedisa Remates en Arturo Prat 6457, Pudahuel"
            src="https://maps.google.com/maps?q=Arturo+Prat+6457,+Noviciado,+Pudahuel,+Chile&z=15&output=embed"
            className="h-56 w-full border-0 md:h-full md:min-h-[220px]"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </div>
      <div className="border-t border-slate-200/80 py-4 text-center text-xs text-slate-600">
        © {new Date().getFullYear()} Vedisa Remates · Catálogo oficial de vehículos en remate y venta directa
      </div>
    </footer>
  );
}
