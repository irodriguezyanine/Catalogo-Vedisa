import type { CatalogItem } from "@/types/catalog";
import type { EditorVehicleDetails } from "@/types/editor";
import { resolveVehicleHighlights, type VehicleHighlightItem } from "@/lib/catalog-vehicle-highlights";

type Props = {
  item: CatalogItem;
  override?: EditorVehicleDetails;
};

function HighlightIcon({ id }: { id: VehicleHighlightItem["id"] }) {
  const className = "h-6 w-6 text-cyan-600";

  switch (id) {
    case "kilometraje":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
          <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M8 4.5 6 2M16 4.5 18 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "ano":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "combustible":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <path
            d="M6 4h8v16H6zM8 7h4M14 8h2l3 3v9h-5V8z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "transmision":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <path
            d="M7 7h4v4H7zM13 13h4v4h-4zM11 9l2 2M11 15l2-2"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "prueba_motor":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <path
            d="M5 14h2l1-4h8l1 4h2l-1.2-4.8A2 2 0 0 0 14.9 7H9.1a2 2 0 0 0-1.9 2.2L5 14z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path d="M8 17h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "prueba_desplazamiento":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <path d="M5 12h11M13 8l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "unico_propietario":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M6 19c1.2-2.8 3.4-4.2 6-4.2s4.8 1.4 6 4.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "aire_acondicionado":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <path
            d="M12 4v16M4 12h16M6.8 6.8l10.4 10.4M17.2 6.8 6.8 17.2"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      );
    case "llaves":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <circle cx="8" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
          <path d="M11 12h8M17 10v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "traccion":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <path
            d="M5 16h14M7 16V9a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v7"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <circle cx="8" cy="16" r="1.6" fill="currentColor" />
          <circle cx="16" cy="16" r="1.6" fill="currentColor" />
        </svg>
      );
    default:
      return null;
  }
}

export function CatalogVehicleHighlightStrip({ item, override }: Props) {
  const highlights = resolveVehicleHighlights(item, override);
  if (highlights.length === 0) return null;

  return (
    <section
      aria-label="Características destacadas del vehículo"
      className="mt-4 snap-x snap-mandatory overflow-x-auto rounded-2xl border border-cyan-100 bg-gradient-to-r from-cyan-50/90 via-white to-cyan-50/70 p-3 shadow-sm"
    >
      <div className="flex min-w-max items-stretch gap-2 sm:gap-3">
        {highlights.map((highlight) => (
          <div
            key={highlight.id}
            className="flex min-w-[104px] max-w-[140px] snap-start flex-col items-center justify-center gap-2 rounded-xl border border-slate-200/90 bg-white/95 px-3 py-3 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
          >
            <HighlightIcon id={highlight.id} />
            <p className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-slate-700 sm:text-[11px]">
              {highlight.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
