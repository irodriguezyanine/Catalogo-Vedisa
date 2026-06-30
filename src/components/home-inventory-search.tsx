"use client";

export const HOME_SEARCH_PLACEHOLDER = "Busca tu SUV, camioneta, sedán, Hyundai, Toyota…";

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
  showHeader?: boolean;
  showSuggestions?: boolean;
  compact?: boolean;
  dense?: boolean;
  toolbar?: React.ReactNode;
  suggestionsTrailing?: React.ReactNode;
  children?: React.ReactNode;
};

export function HomeInventorySearch({
  value,
  onChange,
  onClear,
  showPatents,
  ariaLabel,
  showHeader = true,
  showSuggestions = true,
  compact = false,
  dense = false,
  toolbar,
  suggestionsTrailing,
  children,
}: HomeInventorySearchProps) {
  const placeholder = showPatents
    ? "Busca marca, modelo o patente…"
    : "Busca marca, modelo…";

  const inputPaddingClass = compact
    ? "border-slate-200 py-2 pr-10"
    : dense
      ? "border-slate-300 py-2.5 pr-12"
      : "border-2 border-slate-300 py-3 pr-28";

  const clearButtonClass = compact
    ? "min-h-8 min-w-8 px-2"
    : dense
      ? "min-h-9 min-w-9 px-2"
      : "min-h-11 min-w-11 px-3";

  return (
    <div className="w-full">
      {showHeader ? (
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 md:mb-1.5">
          Búsqueda de inventario
        </p>
      ) : null}
      <div className={toolbar ? "flex items-center gap-2" : undefined}>
        <div className="relative min-w-0 flex-1">
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
            className={`ui-focus w-full rounded-xl border bg-white pl-10 text-sm font-medium text-slate-900 shadow-sm placeholder:text-slate-500 ${inputPaddingClass}`}
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
              className={`ui-focus absolute right-2 top-1/2 -translate-y-1/2 rounded-md border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50 ${clearButtonClass}`}
              aria-label="Limpiar búsqueda"
            >
              ×
            </button>
          ) : null}
        </div>
        {toolbar ? <div className="flex shrink-0 items-center gap-2">{toolbar}</div> : null}
      </div>
      {showSuggestions ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 md:mt-2">
          <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {HOME_SEARCH_SUGGESTIONS.map((suggestion) => (
              <button
                key={`search-suggestion-${suggestion}`}
                type="button"
                onClick={() => onChange(suggestion)}
                className={`ui-focus rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                  value.toLowerCase() === suggestion.toLowerCase()
                    ? "border-cyan-400 bg-cyan-600 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:border-cyan-300 hover:bg-cyan-50"
                }`}
              >
                {suggestion}
              </button>
            ))}
          </div>
          {suggestionsTrailing ? (
            <div className="flex shrink-0 items-center">{suggestionsTrailing}</div>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
