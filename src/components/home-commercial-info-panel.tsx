type HomeCommercialInfoPanelProps = {
  className?: string;
  showTitle?: boolean;
};

export function HomeCommercialInfoPanel({
  className = "",
  showTitle = true,
}: HomeCommercialInfoPanelProps) {
  return (
    <div className={className}>
      {showTitle ? (
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 md:mb-4">
          Información comercial
        </p>
      ) : null}
      <div className="space-y-2.5 md:space-y-3">
        <div className="info-tile">
          <p className="text-[11px] uppercase tracking-widest text-slate-500">📍 Exhibición presencial</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">Arturo Prat 6457, Noviciado, Pudahuel</p>
        </div>
        <div className="info-tile">
          <p className="text-[11px] uppercase tracking-widest text-slate-500">🕒 Horario</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">Lunes a Viernes 9:00 - 13:00 / 14:00 - 17:00</p>
        </div>
        <div className="info-tile">
          <p className="text-[11px] uppercase tracking-widest text-slate-500">💻 Remates 100% online</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            Plataforma pública con registro multimedia 3D, trazabilidad y soporte de contact center
          </p>
        </div>
        <div className="info-tile">
          <p className="text-[11px] uppercase tracking-widest text-slate-500">🏢 Oficinas</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">Américo Vespucio 2880, Piso 7</p>
        </div>
      </div>
    </div>
  );
}
