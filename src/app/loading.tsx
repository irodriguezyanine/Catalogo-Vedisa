export default function Loading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-slate-600">
        <span
          className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-200 border-t-cyan-600"
          aria-hidden="true"
        />
        <p className="text-sm font-medium">Cargando catálogo…</p>
      </div>
    </div>
  );
}
