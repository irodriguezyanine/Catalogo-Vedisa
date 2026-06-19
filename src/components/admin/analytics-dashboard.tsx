"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AnalyticsFunnelStep,
  AnalyticsInventoryInsight,
  AnalyticsSectionRow,
  AnalyticsSummaryKpis,
  AnalyticsVehicleRow,
  MetricWithDelta,
} from "@/lib/analytics-types";

type AnalyticsDays = 7 | 30 | 90;

type DashboardPayload = {
  ok: boolean;
  error?: string;
  days: number;
  source?: string;
  period: { days: number; from: string; to: string };
  previousPeriod: { days: number; from: string; to: string };
  kpis: AnalyticsSummaryKpis;
  funnel: AnalyticsFunnelStep[];
  vehicles: AnalyticsVehicleRow[];
  sections: AnalyticsSectionRow[];
  searches: {
    searches: Array<{ term: string; count: number; noResultsCount: number }>;
    filters: Array<{ filterId: string; label: string; count: number }>;
    sorts: Array<{ sort: string; count: number }>;
    avgOfferAmount: number | null;
  };
  timeline: Array<{
    date: string;
    total: number;
    visits: number;
    detailOpens: number;
    whatsappClicks: number;
    leads: number;
    offersSent: number;
  }>;
  topEvents: Array<{ eventName: string; total: number }>;
  inventory: AnalyticsInventoryInsight;
};

function formatCompactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${Math.round(value / 1000)}k`;
  return new Intl.NumberFormat("es-CL").format(value);
}

function formatCurrency(value: number | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

function DeltaBadge({ metric }: { metric: MetricWithDelta }) {
  const delta = metric.deltaPp ?? metric.deltaPct;
  if (delta == null) return <span className="text-[11px] text-slate-400">—</span>;
  const positive = delta > 0;
  const negative = delta < 0;
  const suffix = metric.deltaPp != null ? "pp" : "%";
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${
        positive ? "text-emerald-600" : negative ? "text-rose-600" : "text-slate-500"
      }`}
    >
      {positive ? "▲" : negative ? "▼" : "•"} {Math.abs(delta)}
      {suffix}
    </span>
  );
}

function KpiCard({
  label,
  metric,
  hint,
  format = "number",
}: {
  label: string;
  metric: MetricWithDelta;
  hint?: string;
  format?: "number" | "percent" | "decimal";
}) {
  const display =
    format === "percent"
      ? `${metric.value}%`
      : format === "decimal"
        ? metric.value.toFixed(1)
        : formatCompactNumber(metric.value);

  return (
    <div
      className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/80 p-3 shadow-sm"
      title={hint}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className="text-2xl font-black text-slate-900">{display}</p>
        <DeltaBadge metric={metric} />
      </div>
      <p className="mt-1 text-[11px] text-slate-400">
        Antes: {format === "percent" ? `${metric.previous}%` : formatCompactNumber(metric.previous)}
      </p>
    </div>
  );
}

function FunnelBlock({ steps }: { steps: AnalyticsFunnelStep[] }) {
  const max = steps[0]?.count ?? 1;
  return (
    <div className="space-y-3">
      {steps.map((step, index) => {
        const width = max > 0 ? Math.max(8, (step.count / max) * 100) : 0;
        return (
          <div key={step.id}>
            <div className="mb-1 flex items-center justify-between gap-2 text-sm">
              <span className="font-semibold text-slate-800">
                {index + 1}. {step.label}
              </span>
              <span className="text-slate-600">
                {formatCompactNumber(step.count)}
                {step.rateFromStart != null ? ` · ${step.rateFromStart}%` : ""}
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-700 transition-all"
                style={{ width: `${width}%` }}
              />
            </div>
            {step.rateFromPrevious != null && index > 0 ? (
              <p className="mt-0.5 text-[11px] text-slate-500">
                {step.rateFromPrevious}% desde etapa anterior
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function VehicleStatusBadge({ status }: { status: AnalyticsVehicleRow["status"] }) {
  const styles: Record<AnalyticsVehicleRow["status"], string> = {
    star: "bg-amber-100 text-amber-800 border-amber-200",
    high_interest_no_contact: "bg-orange-100 text-orange-800 border-orange-200",
    sleeping: "bg-slate-100 text-slate-600 border-slate-200",
    normal: "bg-cyan-50 text-cyan-800 border-cyan-200",
  };
  const labels: Record<AnalyticsVehicleRow["status"], string> = {
    star: "Estrella",
    high_interest_no_contact: "Interés sin contacto",
    sleeping: "Dormido",
    normal: "Normal",
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

type CommercialTab = "seccion" | "remate" | "tipo" | "precio";

function CommercialBlock({ sections }: { sections: AnalyticsSectionRow[] }) {
  const [tab, setTab] = useState<CommercialTab>("seccion");

  const filtered = useMemo(() => {
    if (tab === "remate") return sections.filter((row) => row.key.startsWith("auction:"));
    if (tab === "tipo") return sections.filter((row) => row.key.startsWith("type:"));
    if (tab === "precio") return sections.filter((row) => row.key.startsWith("price:"));
    return sections.filter(
      (row) =>
        !row.key.startsWith("auction:") &&
        !row.key.startsWith("type:") &&
        !row.key.startsWith("price:"),
    );
  }, [sections, tab]);

  const tabs: Array<{ id: CommercialTab; label: string }> = [
    { id: "seccion", label: "Por sección" },
    { id: "remate", label: "Por remate" },
    { id: "tipo", label: "Por tipo" },
    { id: "precio", label: "Por precio" },
  ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1 rounded-full border border-slate-200 bg-white p-1">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className={`ui-focus rounded-full px-3 py-1 text-xs font-semibold ${
              tab === entry.id ? "bg-cyan-600 text-white" : "text-slate-700"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-slate-500">Sin datos para este segmento en el período.</p>
      ) : (
        <div className="space-y-2">
          {filtered.slice(0, 12).map((row) => (
            <div
              key={row.key}
              className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <div>
                <p className="text-sm font-semibold text-slate-900">{row.label}</p>
                <p className="text-[11px] text-slate-500">
                  Detalle {row.detailOpens} · WA {row.whatsappClicks} · Ofertas {row.offersSent}
                </p>
              </div>
              <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-bold text-white">
                {row.score}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TimelineChart({
  rows,
}: {
  rows: DashboardPayload["timeline"];
}) {
  const max = rows.reduce((acc, row) => Math.max(acc, row.visits), 0);
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${Math.max(600, rows.length * 28)} 200`} className="h-48 min-w-full">
        <line x1="20" y1="170" x2={Math.max(580, rows.length * 28 - 20)} y2="170" stroke="#cbd5e1" />
        {rows.map((row, index) => {
          const x = 24 + index * 26;
          const h = max > 0 ? (row.visits / max) * 140 : 0;
          return (
            <g key={row.date}>
              <rect x={x} y={170 - h} width="18" height={Math.max(2, h)} rx="2" fill="#0891b2">
                <title>{`${row.date}: ${row.visits} visitas, ${row.detailOpens} detalles`}</title>
              </rect>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function AnalyticsDashboard() {
  const [days, setDays] = useState<AnalyticsDays>(30);
  const [viewMode, setViewMode] = useState<"simple" | "advanced">("simple");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<DashboardPayload | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/analytics/dashboard?days=${days}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as DashboardPayload;
      if (!response.ok || !payload.ok) {
        setError(payload.error ?? "No se pudo cargar analytics.");
        setData(null);
        return;
      }
      setData(payload);
    } catch {
      setError("Error de red al cargar analytics.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const handleExport = useCallback(() => {
    window.open(`/api/admin/analytics/export?days=${days}&format=csv`, "_blank");
  }, [days]);

  const kpis = data?.kpis;
  const vehicleLimit = viewMode === "simple" ? 5 : 20;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">Analytics comercial</p>
            <h2 className="text-lg font-bold text-slate-900">Demanda, embudo y conversión del catálogo</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Responde cuánta demanda real genera el catálogo, qué convierte mejor, dónde se pierde el usuario y qué
              cambió vs el período anterior.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {([7, 30, 90] as const).map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setDays(range)}
                className={`ui-focus rounded-full px-3 py-1 text-xs font-semibold ${
                  days === range ? "bg-cyan-600 text-white" : "border border-slate-300 bg-white text-slate-700"
                }`}
              >
                {range} días
              </button>
            ))}
            <button
              type="button"
              onClick={() => void loadDashboard()}
              className="ui-focus rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
            >
              Actualizar
            </button>
            <button
              type="button"
              onClick={handleExport}
              className="ui-focus rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
            >
              Exportar CSV
            </button>
          </div>
        </div>

        <div className="mt-3 inline-flex rounded-full border border-slate-300 bg-white p-1">
          <button
            type="button"
            onClick={() => setViewMode("simple")}
            className={`ui-focus rounded-full px-3 py-1 text-xs font-semibold ${
              viewMode === "simple" ? "bg-cyan-600 text-white" : "text-slate-700"
            }`}
          >
            Vista simple
          </button>
          <button
            type="button"
            onClick={() => setViewMode("advanced")}
            className={`ui-focus rounded-full px-3 py-1 text-xs font-semibold ${
              viewMode === "advanced" ? "bg-cyan-600 text-white" : "text-slate-700"
            }`}
          >
            Vista avanzada
          </button>
        </div>

        {loading ? <p className="mt-2 text-xs text-slate-500">Cargando métricas…</p> : null}
        {error ? <p className="mt-2 text-xs font-semibold text-rose-600">{error}</p> : null}
        {data?.source ? (
          <p className="mt-1 text-[11px] text-slate-400">
            Fuente: {data.source} · {new Date(data.period.from).toLocaleDateString("es-CL")} →{" "}
            {new Date(data.period.to).toLocaleDateString("es-CL")}
          </p>
        ) : null}
      </div>

      {kpis ? (
        <>
          <section className="space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">A · Resumen ejecutivo</h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Visitas" metric={kpis.visits} hint="Sesiones con page_view_home" />
              <KpiCard label="Detalles abiertos" metric={kpis.detailOpens} />
              <KpiCard label="WhatsApp" metric={kpis.whatsappClicks} />
              <KpiCard label="Ofertas enviadas" metric={kpis.offersSent} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Leads" metric={kpis.leads} />
              <KpiCard
                label="Conversión global"
                metric={kpis.globalConversionRate}
                format="percent"
                hint="(WA + leads + ofertas) / visitas"
              />
              <KpiCard label="Vehículos vistos" metric={kpis.uniqueVehiclesViewed} />
              <KpiCard label="Visitas / día" metric={kpis.avgVisitsPerDay} format="decimal" />
            </div>
            {viewMode === "advanced" ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard label="Visitantes únicos" metric={kpis.uniqueVisitors} />
                <KpiCard label="Profundidad / sesión" metric={kpis.avgDepthPerSession} format="decimal" />
                <KpiCard label="Rebote" metric={kpis.bounceRate} format="percent" />
                <KpiCard label="Compartidos" metric={kpis.shares} />
                <KpiCard label="Visor 3D" metric={kpis.viewer3dOpens} />
                <KpiCard label="PDF calendario" metric={kpis.pdfDownloads} />
                <KpiCard label="Modales oferta" metric={kpis.offerModalsOpened} />
                <KpiCard
                  label="Detalle / visita"
                  metric={kpis.detailPerVisitRate}
                  format="percent"
                />
              </div>
            ) : null}
            <div className="rounded-xl border border-cyan-100 bg-cyan-50/50 px-3 py-2 text-xs text-cyan-900">
              Canal WA dominante:{" "}
              <span className="font-semibold">{kpis.dominantWhatsappChannel ?? "Sin datos"}</span>
              {" · "}
              Tarjeta {kpis.whatsappCard.value} · Modal {kpis.whatsappModal.value} · Flotante{" "}
              {kpis.whatsappFloating.value}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-700">
              B · Embudo de conversión
            </h3>
            <FunnelBlock steps={data?.funnel ?? []} />
            <div className="mt-3 grid gap-2 text-xs text-slate-600 md:grid-cols-3">
              <p>
                <span className="font-semibold text-slate-800">WA / detalle:</span> {kpis.whatsappPerDetailRate.value}%
              </p>
              <p>
                <span className="font-semibold text-slate-800">Oferta / detalle:</span>{" "}
                {kpis.offerPerDetailRate.value}%
              </p>
              <p>
                <span className="font-semibold text-slate-800">Lead / detalle:</span> {kpis.leadPerDetailRate.value}%
              </p>
            </div>
          </section>

          {viewMode === "advanced" ? (
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-700">
                C · Rendimiento comercial
              </h3>
              <CommercialBlock sections={data?.sections ?? []} />
              {data?.inventory ? (
                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ["Publicados visibles", data.inventory.publishedVisible],
                    ["Sin interacciones", data.inventory.zeroInteractions],
                    ["Alto interés sin contacto", data.inventory.highInterestNoContact],
                    ["Estrellas", data.inventory.stars],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase text-slate-500">{label}</p>
                      <p className="text-xl font-black text-slate-900">{value}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-700">
              D · Ranking de vehículos (score ponderado)
            </h3>
            {(data?.vehicles ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">Sin actividad de vehículos en este período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="px-2 py-2">#</th>
                      <th className="px-2 py-2">Patente</th>
                      <th className="px-2 py-2">Modelo</th>
                      <th className="px-2 py-2">Sección</th>
                      <th className="px-2 py-2">Detalle</th>
                      <th className="px-2 py-2">WA</th>
                      <th className="px-2 py-2">Ofertas</th>
                      <th className="px-2 py-2">Score</th>
                      <th className="px-2 py-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.vehicles ?? []).slice(0, vehicleLimit).map((row, index) => (
                      <tr key={row.itemKey} className="border-b border-slate-100">
                        <td className="px-2 py-2 font-semibold text-slate-500">{index + 1}</td>
                        <td className="px-2 py-2 font-semibold text-slate-900">{row.patent}</td>
                        <td className="max-w-[12rem] truncate px-2 py-2 text-slate-700">{row.model}</td>
                        <td className="max-w-[10rem] truncate px-2 py-2 text-slate-600">{row.sectionLabel}</td>
                        <td className="px-2 py-2">{row.detailOpens}</td>
                        <td className="px-2 py-2">{row.whatsappClicks}</td>
                        <td className="px-2 py-2">{row.offersSent}</td>
                        <td className="px-2 py-2 font-bold text-slate-900">
                          {row.score}
                          {row.deltaScorePct != null ? (
                            <span className="ml-1 text-[10px] text-slate-500">({row.deltaScorePct}%)</span>
                          ) : null}
                        </td>
                        <td className="px-2 py-2">
                          <VehicleStatusBadge status={row.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {viewMode === "advanced" ? (
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-700">
                E · Exploración avanzada
              </h3>
              <div className="grid gap-4 xl:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Top búsquedas</p>
                  {(data?.searches.searches ?? []).length === 0 ? (
                    <p className="text-sm text-slate-500">Sin búsquedas registradas.</p>
                  ) : (
                    <div className="space-y-1">
                      {data?.searches.searches.slice(0, 10).map((row) => (
                        <div
                          key={row.term}
                          className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs"
                        >
                          <span className="font-semibold text-slate-800">{row.term}</span>
                          <span>
                            {row.count}
                            {row.noResultsCount > 0 ? (
                              <span className="ml-1 text-rose-600">({row.noResultsCount} sin resultado)</span>
                            ) : null}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Filtros y orden</p>
                  <div className="space-y-1">
                    {(data?.searches.filters ?? []).slice(0, 8).map((row) => (
                      <div
                        key={row.filterId}
                        className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs"
                      >
                        <span>{row.label}</span>
                        <span className="font-bold">{row.count}</span>
                      </div>
                    ))}
                  </div>
                  {data?.searches.avgOfferAmount != null ? (
                    <p className="mt-3 text-xs text-slate-600">
                      Monto promedio ofertado:{" "}
                      <span className="font-semibold text-slate-900">
                        {formatCurrency(data.searches.avgOfferAmount)}
                      </span>
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Actividad diaria</p>
                <TimelineChart rows={data?.timeline ?? []} />
              </div>

              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Eventos más frecuentes</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(data?.topEvents ?? []).map((row) => (
                    <div
                      key={row.eventName}
                      className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs"
                    >
                      <span className="line-clamp-1 font-semibold text-slate-700">{row.eventName}</span>
                      <span className="font-bold text-slate-900">{row.total}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
