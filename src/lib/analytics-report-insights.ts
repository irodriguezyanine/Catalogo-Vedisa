import type { AnalyticsFunnelStep, AnalyticsVehicleRow } from "@/lib/analytics-types";
import type { buildAnalyticsDashboardPayload } from "@/lib/analytics-admin-shared";

export type WeeklyReportPayload = Extract<
  Awaited<ReturnType<typeof buildAnalyticsDashboardPayload>>,
  { ok: true }
>;

export type ReportInsight = {
  tone: "positive" | "negative" | "neutral" | "warning" | "action";
  title: string;
  body: string;
};

function deltaLabel(metric: { value: number; previous: number; deltaPct: number | null; deltaPp?: number | null }): string {
  const delta = metric.deltaPp ?? metric.deltaPct;
  if (delta == null) return "sin variación";
  if (delta > 0) return `+${delta}${metric.deltaPp != null ? " pp" : "%"} vs semana anterior`;
  if (delta < 0) return `${delta}${metric.deltaPp != null ? " pp" : "%"} vs semana anterior`;
  return "sin cambio vs semana anterior";
}

export function buildAnalyticsReportInsights(payload: WeeklyReportPayload): ReportInsight[] {
  const { kpis, funnel, vehicles, sections, searches, inventory } = payload;
  const insights: ReportInsight[] = [];

  insights.push({
    tone: "neutral",
    title: "Demanda del catálogo",
    body: `En los últimos ${payload.days} días hubo ${kpis.visits.value.toLocaleString("es-CL")} visitas y ${kpis.detailOpens.value.toLocaleString("es-CL")} aperturas de ficha (${deltaLabel(kpis.visits)}). ${kpis.uniqueVisitors.value.toLocaleString("es-CL")} visitantes únicos exploraron ${kpis.uniqueVehiclesViewed.value} vehículos distintos.`,
  });

  const conversionDelta = deltaLabel(kpis.globalConversionRate);
  insights.push({
    tone: kpis.globalConversionRate.value >= 3 ? "positive" : kpis.globalConversionRate.value >= 1 ? "neutral" : "warning",
    title: "Conversión comercial global",
    body: `La tasa de conversión (WhatsApp + leads + ofertas / visitas) fue ${kpis.globalConversionRate.value}% (${conversionDelta}). Se registraron ${kpis.whatsappClicks.value} clicks en WhatsApp, ${kpis.leads.value} leads y ${kpis.offersSent.value} ofertas enviadas.`,
  });

  const funnelDetail = funnel.find((step) => step.id === "detail");
  const funnelConversion = funnel.find((step) => step.id === "conversion");
  if (funnelDetail && funnelConversion) {
    insights.push({
      tone: funnelDetail.rateFromStart != null && funnelDetail.rateFromStart < 25 ? "warning" : "neutral",
      title: "Embudo de interés",
      body: `Del total de visitas, ${funnelDetail.rateFromStart ?? 0}% abrió al menos una ficha y ${funnelConversion.rateFromStart ?? 0}% llegó a contacto u oferta. La mayor caída suele estar entre visita y detalle: conviene revisar hero, filtros y primeras tarjetas visibles.`,
    });
  }

  if (kpis.dominantWhatsappChannel) {
    insights.push({
      tone: "neutral",
      title: "Canal WhatsApp dominante",
      body: `El canal con más intención fue «${kpis.dominantWhatsappChannel}» (tarjeta ${kpis.whatsappCard.value}, modal ${kpis.whatsappModal.value}, flotante ${kpis.whatsappFloating.value}). Alinea CTAs y copy según el canal que más convierte.`,
    });
  }

  if (kpis.offerModalsOpened.value > 0) {
    const offerCloseRate =
      kpis.offerModalsOpened.value > 0
        ? Math.round((kpis.offersSent.value / kpis.offerModalsOpened.value) * 100)
        : 0;
    insights.push({
      tone: offerCloseRate >= 40 ? "positive" : "action",
      title: "Ofertas digitales",
      body: `Se abrieron ${kpis.offerModalsOpened.value} modales de oferta y se enviaron ${kpis.offersSent.value} ofertas (${offerCloseRate}% de cierre modal→envío).${
        searches.avgOfferAmount
          ? ` Monto promedio ofertado: ${new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(searches.avgOfferAmount)}.`
          : ""
      }`,
    });
  }

  const topVehicle = vehicles[0];
  if (topVehicle) {
    insights.push({
      tone: "positive",
      title: "Vehículo estrella de la semana",
      body: `${topVehicle.patent} · ${topVehicle.model} lideró con score ${topVehicle.score} (${topVehicle.detailOpens} detalles, ${topVehicle.whatsappClicks} WA, ${topVehicle.offersSent} ofertas) en ${topVehicle.sectionLabel}.`,
    });
  }

  const highInterestNoContact = vehicles.filter((row) => row.status === "high_interest_no_contact");
  if (highInterestNoContact.length > 0) {
    const sample = highInterestNoContact
      .slice(0, 3)
      .map((row: AnalyticsVehicleRow) => row.patent)
      .join(", ");
    insights.push({
      tone: "action",
      title: "Oportunidades sin contacto",
      body: `${highInterestNoContact.length} vehículo(s) con alto interés y sin WhatsApp/oferta. Revisar precio, fotos o ficha: ${sample}${highInterestNoContact.length > 3 ? "…" : ""}.`,
    });
  }

  const topSection = sections.filter((row) => !row.key.startsWith("type:") && !row.key.startsWith("price:"))[0];
  if (topSection) {
    insights.push({
      tone: "neutral",
      title: "Segmento comercial más fuerte",
      body: `«${topSection.label}» concentró mayor score comercial (${topSection.score} pts): ${topSection.detailOpens} detalles, ${topSection.whatsappClicks} WA y ${topSection.offersSent} ofertas.`,
    });
  }

  const topSearch = searches.searches[0];
  if (topSearch) {
    insights.push({
      tone: "neutral",
      title: "Qué buscan los usuarios",
      body: `Término más buscado: «${topSearch.term}» (${topSearch.count} búsquedas)${
        topSearch.noResultsCount > 0 ? `, con ${topSearch.noResultsCount} sin resultados` : ""
      }. Ajusta inventario o sinónimos en filtros si hay demanda no cubierta.`,
    });
  }

  if (inventory.zeroInteractions > 0) {
    insights.push({
      tone: "warning",
      title: "Inventario dormido",
      body: `${inventory.zeroInteractions} de ${inventory.publishedVisible} vehículos publicados no registraron interacciones en el período. Prioriza visibilidad, precio o promoción en esas unidades.`,
    });
  }

  if (kpis.bounceRate.value >= 45) {
    insights.push({
      tone: "warning",
      title: "Rebote elevado",
      body: `El ${kpis.bounceRate.value}% de sesiones no abrió ninguna ficha (${deltaLabel(kpis.bounceRate)}). Mejora primera pantalla, velocidad de carga y relevancia del inventario above the fold.`,
    });
  } else if (kpis.avgDepthPerSession.value >= 2) {
    insights.push({
      tone: "positive",
      title: "Exploración profunda",
      body: `Promedio de ${kpis.avgDepthPerSession.value} fichas por sesión (${deltaLabel(kpis.avgDepthPerSession)}). El catálogo está generando exploración más allá de la primera unidad.`,
    });
  }

  const recommendations: ReportInsight[] = [];
  if (kpis.whatsappPerDetailRate.value < 5 && kpis.detailOpens.value >= 10) {
    recommendations.push({
      tone: "action",
      title: "Recomendación comercial",
      body: "La tasa WhatsApp/detalle está baja. Refuerza precio visible, botón WA en ficha y urgencia (remate próximo / stock limitado).",
    });
  }
  if (kpis.offersSent.value === 0 && kpis.detailOpens.value >= 20) {
    recommendations.push({
      tone: "action",
      title: "Recomendación de ofertas",
      body: "Hay detalle de ficha pero cero ofertas. Prueba destacar «Enviar mi precio» en venta directa o unidades con precio referencial claro.",
    });
  }
  if (kpis.shares.value >= 3) {
    recommendations.push({
      tone: "positive",
      title: "Viralidad orgánica",
      body: `${kpis.shares.value} compartidos de vehículos. Identifica qué unidades se comparten y repite el patrón (fotos, precio, tipo).`,
    });
  }

  return [...insights, ...recommendations].slice(0, 14);
}

export function buildExecutiveSummary(
  payload: WeeklyReportPayload,
  insights: ReportInsight[],
): string {
  const { kpis, period } = payload;
  const from = new Date(period.from).toLocaleDateString("es-CL", { day: "numeric", month: "long" });
  const to = new Date(period.to).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" });
  const headline =
    kpis.visits.value >= kpis.visits.previous
      ? "La semana cerró con demanda estable o al alza respecto al período anterior."
      : "La semana muestra una contracción de tráfico respecto al período anterior; conviene revisar fuentes y destacados.";
  return `${headline} Entre el ${from} y el ${to}, el catálogo registró ${kpis.visits.value} visitas, ${kpis.detailOpens.value} detalles abiertos y una conversión global del ${kpis.globalConversionRate.value}%. ${insights[0]?.body ?? ""}`;
}

export function formatReportPeriodLabel(payload: WeeklyReportPayload): string {
  const from = new Date(payload.period.from);
  const to = new Date(payload.period.to);
  const fmt = (date: Date) =>
    date.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
  return `${fmt(from)} – ${fmt(to)}`;
}

export function buildFunnelNarrative(steps: AnalyticsFunnelStep[]): string {
  return steps
    .map((step, index) => {
      const arrow = index === 0 ? "" : " → ";
      const rate = step.rateFromStart != null ? ` (${step.rateFromStart}%)` : "";
      return `${arrow}${step.label}: ${step.count.toLocaleString("es-CL")}${rate}`;
    })
    .join("");
}
