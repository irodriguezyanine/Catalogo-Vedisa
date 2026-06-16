import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-cyan-700">404</p>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">Página no encontrada</h1>
      <p className="mt-3 text-sm text-slate-600">
        El vehículo o la sección que buscas no está disponible en el catálogo.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500"
        >
          Ir al inicio
        </Link>
        <Link
          href="/vehiculos"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          Ver vehículos
        </Link>
        <Link
          href="/#proximos-remates"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          Próximos remates
        </Link>
        <Link
          href="/#ventas-directas"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          Ventas directas
        </Link>
      </div>
    </main>
  );
}
