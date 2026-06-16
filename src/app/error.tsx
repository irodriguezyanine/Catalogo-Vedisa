"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="text-xl font-bold text-slate-900">No pudimos cargar el catálogo</h1>
      <p className="mt-2 text-sm text-slate-600">{error.message || "Error inesperado."}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500"
      >
        Reintentar
      </button>
    </main>
  );
}
