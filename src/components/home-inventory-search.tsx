"use client";

export const HOME_SEARCH_PLACEHOLDER =
  "Busca tu SUV, camioneta, sedán, Hyundai, Toyota…";

export const HOME_SEARCH_SUGGESTIONS = [
  "Toyota",
  "Hyundai",
  "Nissan",
  "Chevrolet",
  "SUV",
  "Camioneta",
  "Sedán",
  "Diesel",
] as const;

type HomeInventorySearchProps = {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  showPatents: boolean;
  ariaLabel: string;
  children?: React.ReactNode;
};

export function HomeInventorySearch({
  value,
  onChange,
  onClear,
  showPatents,
  ariaLabel,
  children,
}: HomeInventorySearchProps) {
  const placeholder = showPatents
    ? `${HOME_SEARCH_PLACEHOLDER} o patente`
    : HOME_SEARCH_PLACEHOLDER;

  return (
    <div className="w-full">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
        Búsqueda de inventario
      </p>
      <div className="relative">
        <svg
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
        >
          <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="8.75" cy="8.75" r="5.75" stroke="currentColor" strokeWidth="1.8" />
        </svg>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          list="home-search-suggestions"
          className="ui-focus w-full rounded-xl border-2 border-slate-300 bg-white py-3 pl-10 pr-28 text-sm font-medium text-slate-900 shadow-sm placeholder:text-slate-500"
          aria-label={ariaLabel}
        />
        <datalist id="home-search-suggestions">
          {HOME_SEARCH_SUGGESTIONS.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
        {value ? (
          <button
            type="button"
            onClick={onClear}
            className="ui-focus absolute right-2 top-1/2 min-h-11 min-w-11 -translate-y-1/2 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50"
          >
            Limpiar
          </button>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {HOME_SEARCH_SUGGESTIONS.map((suggestion) => (
          <button
            key={`search-suggestion-${suggestion}`}
            type="button"
            onClick={() => onChange(suggestion)}
            className={`ui-focus rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              value.toLowerCase() === suggestion.toLowerCase()
                ? "border-cyan-400 bg-cyan-600 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:border-cyan-300 hover:bg-cyan-50"
            }`}
          >
            {suggestion}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}
