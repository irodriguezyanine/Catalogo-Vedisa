import type { AnalyticsFunnelStep, AnalyticsSummaryKpis, MetricWithDelta } from "@/lib/analytics-types";
import type { ReportInsight, WeeklyReportPayload } from "@/lib/analytics-report-insights";
import { buildExecutiveSummary, formatReportPeriodLabel } from "@/lib/analytics-report-insights";

const BRAND = {
  navy: [12, 28, 61] as const,
  navyDeep: [6, 18, 42] as const,
  cyan: [8, 145, 178] as const,
  cyanBright: [14, 165, 233] as const,
  cyanSoft: [236, 254, 255] as const,
  gold: [245, 158, 11] as const,
  green: [22, 163, 74] as const,
  red: [220, 38, 38] as const,
  slate: [30, 41, 59] as const,
  slateMuted: [71, 85, 105] as const,
  slateLight: [148, 163, 184] as const,
  border: [226, 232, 240] as const,
  rowAlt: [248, 250, 252] as const,
  white: [255, 255, 255] as const,
};

const MARGIN = 42;
const LOGO_URL = "https://catalogo.vedisaremates.cl/vedisa-logo.png";

type JsPdf = {
  internal: { pageSize: { getWidth: () => number; getHeight: () => number }; getNumberOfPages: () => number };
  addPage: () => void;
  setPage: (page: number) => void;
  setFillColor: (...c: number[]) => void;
  setDrawColor: (...c: number[]) => void;
  setTextColor: (...c: number[]) => void;
  setFont: (font: string, style: string) => void;
  setFontSize: (size: number) => void;
  setLineWidth: (width: number) => void;
  text: (text: string, x: number, y: number, options?: { align?: string; maxWidth?: number }) => void;
  rect: (x: number, y: number, w: number, h: number, style?: string) => void;
  roundedRect: (x: number, y: number, w: number, h: number, rx: number, ry: number, style?: string) => void;
  line: (x1: number, y1: number, x2: number, y2: number) => void;
  addImage: (data: string, format: string, x: number, y: number, w: number, h: number) => void;
  splitTextToSize: (text: string, maxWidth: number) => string[];
  output: (type: "arraybuffer") => ArrayBuffer;
};

function sanitizePdfText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[^\x09\x0a\x0d\x20-\x7e\u00a0-\u024f\u1e00-\u1eff]/g, "")
    .trim();
}

function fmtNum(value: number): string {
  return new Intl.NumberFormat("es-CL").format(Math.round(value));
}

function fmtPctDelta(metric: MetricWithDelta): string {
  const delta = metric.deltaPp ?? metric.deltaPct;
  if (delta == null) return "—";
  const suffix = metric.deltaPp != null ? "pp" : "%";
  if (delta > 0) return `+${delta}${suffix}`;
  if (delta < 0) return `${delta}${suffix}`;
  return "0";
}

function deltaColor(metric: MetricWithDelta): readonly [number, number, number] {
  const delta = metric.deltaPp ?? metric.deltaPct ?? 0;
  if (delta > 0) return BRAND.green;
  if (delta < 0) return BRAND.red;
  return BRAND.slateMuted;
}

function insightAccent(tone: ReportInsight["tone"]): readonly [number, number, number] {
  if (tone === "positive") return BRAND.green;
  if (tone === "negative" || tone === "warning") return BRAND.red;
  if (tone === "action") return BRAND.gold;
  return BRAND.cyan;
}

async function fetchLogoDataUrl(): Promise<string | null> {
  try {
    const response = await fetch(LOGO_URL, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

function drawPageFooter(doc: JsPdf, pageWidth: number, pageHeight: number, pageNum: number, totalPages: number) {
  doc.setDrawColor(...BRAND.border);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, pageHeight - 28, pageWidth - MARGIN, pageHeight - 28);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...BRAND.slateLight);
  doc.text("VEDISA REMATES · Informe comercial Catálogo", MARGIN, pageHeight - 14);
  doc.text(`Página ${pageNum} de ${totalPages}`, pageWidth - MARGIN, pageHeight - 14, { align: "right" });
  doc.text("catalogo.vedisaremates.cl", pageWidth / 2, pageHeight - 14, { align: "center" });
}

function drawSectionHeader(doc: JsPdf, x: number, y: number, width: number, title: string, subtitle?: string): number {
  doc.setFillColor(...BRAND.navy);
  doc.roundedRect(x, y, width, subtitle ? 36 : 28, 4, 4, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...BRAND.white);
  doc.text(sanitizePdfText(title), x + 12, y + 18);
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(191, 219, 254);
    doc.text(sanitizePdfText(subtitle), x + 12, y + 30);
    return y + 44;
  }
  return y + 36;
}

function drawKpiCard(
  doc: JsPdf,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  metric: MetricWithDelta,
  format: "number" | "percent" | "decimal" = "number",
) {
  doc.setFillColor(...BRAND.white);
  doc.setDrawColor(...BRAND.border);
  doc.roundedRect(x, y, w, h, 6, 6, "FD");
  doc.setFillColor(...BRAND.cyanSoft);
  doc.roundedRect(x, y, 4, h, 2, 2, "F");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...BRAND.slateMuted);
  doc.text(sanitizePdfText(label), x + 12, y + 14, { maxWidth: w - 16 });

  const display =
    format === "percent"
      ? `${metric.value}%`
      : format === "decimal"
        ? metric.value.toFixed(1)
        : fmtNum(metric.value);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...BRAND.slate);
  doc.text(display, x + 12, y + 34);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...deltaColor(metric));
  doc.text(fmtPctDelta(metric), x + 12, y + 48);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...BRAND.slateLight);
  const prev =
    format === "percent"
      ? `Ant: ${metric.previous}%`
      : format === "decimal"
        ? `Ant: ${metric.previous.toFixed(1)}`
        : `Ant: ${fmtNum(metric.previous)}`;
  doc.text(prev, x + 12, y + h - 8);
}

function drawFunnel(doc: JsPdf, x: number, y: number, width: number, steps: AnalyticsFunnelStep[]): number {
  const max = steps[0]?.count ?? 1;
  let cursorY = y;
  for (const [index, step] of steps.entries()) {
    const barW = Math.max(24, (step.count / max) * (width - 80));
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...BRAND.slate);
    doc.text(sanitizePdfText(`${index + 1}. ${step.label}`), x, cursorY + 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.slateMuted);
    const meta = `${fmtNum(step.count)}${step.rateFromStart != null ? ` · ${step.rateFromStart}% del inicio` : ""}`;
    doc.text(meta, x + width - 4, cursorY + 10, { align: "right" });

    doc.setFillColor(...BRAND.cyanSoft);
    doc.roundedRect(x, cursorY + 14, width, 10, 3, 3, "F");
    doc.setFillColor(...BRAND.cyan);
    doc.roundedRect(x, cursorY + 14, barW, 10, 3, 3, "F");
    cursorY += 32;
  }
  return cursorY;
}

function drawInsightCard(doc: JsPdf, x: number, y: number, width: number, insight: ReportInsight): number {
  const lines = doc.splitTextToSize(sanitizePdfText(insight.body), width - 24);
  const h = 22 + lines.length * 11 + 8;
  doc.setFillColor(...BRAND.white);
  doc.setDrawColor(...BRAND.border);
  doc.roundedRect(x, y, width, h, 5, 5, "FD");
  doc.setFillColor(...insightAccent(insight.tone));
  doc.roundedRect(x, y, 4, h, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...BRAND.slate);
  doc.text(sanitizePdfText(insight.title), x + 12, y + 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...BRAND.slateMuted);
  let lineY = y + 26;
  for (const line of lines) {
    doc.text(line, x + 12, lineY);
    lineY += 11;
  }
  return y + h + 8;
}

function drawTableHeader(doc: JsPdf, x: number, y: number, width: number, cols: string[], colWidths: number[]) {
  doc.setFillColor(...BRAND.navy);
  doc.roundedRect(x, y, width, 18, 3, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...BRAND.white);
  let cx = x + 6;
  for (let i = 0; i < cols.length; i += 1) {
    doc.text(cols[i], cx, y + 12);
    cx += colWidths[i] ?? 0;
  }
}

function drawTimelineChart(
  doc: JsPdf,
  x: number,
  y: number,
  width: number,
  height: number,
  rows: WeeklyReportPayload["timeline"],
) {
  if (rows.length === 0) return;
  const max = Math.max(...rows.map((row) => row.visits), 1);
  const barGap = 4;
  const barW = Math.min(28, (width - barGap * (rows.length - 1)) / rows.length);
  doc.setDrawColor(...BRAND.border);
  doc.line(x, y + height, x + width, y + height);
  rows.forEach((row, index) => {
    const barH = (row.visits / max) * (height - 16);
    const bx = x + index * (barW + barGap);
    doc.setFillColor(...BRAND.cyan);
    doc.roundedRect(bx, y + height - barH, barW, barH, 2, 2, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(...BRAND.slateMuted);
    const label = row.date.slice(5).replace("-", "/");
    doc.text(label, bx + barW / 2, y + height + 10, { align: "center" });
  });
}

export async function generateAnalyticsReportPdf(input: {
  payload: WeeklyReportPayload;
  insights: ReportInsight[];
}): Promise<{ bytes: Uint8Array; fileName: string }> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true }) as unknown as JsPdf;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;
  const { payload, insights } = input;
  const { kpis } = payload;
  const periodLabel = formatReportPeriodLabel(payload);
  const logo = await fetchLogoDataUrl();
  const now = new Date();
  const fileName = `Informe-Catalogo-Vedisa-${now.toISOString().slice(0, 10)}.pdf`;

  // --- Portada ---
  doc.setFillColor(...BRAND.navyDeep);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
  doc.setFillColor(...BRAND.cyan);
  doc.rect(0, pageHeight * 0.42, pageWidth, 4, "F");

  if (logo) {
    doc.addImage(logo, "PNG", pageWidth / 2 - 90, 72, 180, 40);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(...BRAND.white);
  doc.text("Informe Semanal", pageWidth / 2, 150, { align: "center" });
  doc.setFontSize(18);
  doc.setTextColor(...BRAND.cyanBright);
  doc.text("Catálogo VEDISA REMATES", pageWidth / 2, 178, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(191, 219, 254);
  doc.text(`Período analizado: ${sanitizePdfText(periodLabel)}`, pageWidth / 2, 210, { align: "center" });
  doc.text(`Últimos ${payload.days} días · Comparado vs semana anterior`, pageWidth / 2, 228, { align: "center" });

  doc.setFillColor(22, 44, 88);
  doc.roundedRect(MARGIN, 260, contentWidth, 120, 8, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND.gold);
  doc.text("RESUMEN EJECUTIVO", MARGIN + 16, 282);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...BRAND.white);
  const summaryLines = doc.splitTextToSize(sanitizePdfText(buildExecutiveSummary(payload, insights)), contentWidth - 32);
  summaryLines.slice(0, 6).forEach((line, index) => {
    doc.text(line, MARGIN + 16, 300 + index * 12);
  });

  const coverStats = [
    ["Visitas", fmtNum(kpis.visits.value)],
    ["Detalles", fmtNum(kpis.detailOpens.value)],
    ["WhatsApp", fmtNum(kpis.whatsappClicks.value)],
    ["Conversión", `${kpis.globalConversionRate.value}%`],
  ];
  const statW = (contentWidth - 24) / 4;
  coverStats.forEach(([label, value], index) => {
    const sx = MARGIN + index * (statW + 8);
    doc.setFillColor(...BRAND.white);
    doc.roundedRect(sx, 400, statW, 56, 6, 6, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.slateMuted);
    doc.text(label, sx + statW / 2, 420, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...BRAND.navy);
    doc.text(value, sx + statW / 2, 442, { align: "center" });
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...BRAND.slateLight);
  doc.text(
    `Generado ${now.toLocaleString("es-CL", { timeZone: "America/Santiago" })}`,
    pageWidth / 2,
    pageHeight - 48,
    { align: "center" },
  );

  // --- Página 2: KPIs ---
  doc.addPage();
  let y = MARGIN;
  y = drawSectionHeader(doc, MARGIN, y, contentWidth, "Indicadores clave (KPI)", "Comparación vs los 7 días previos");
  const kpiRows: Array<{ label: string; metric: MetricWithDelta; format?: "number" | "percent" | "decimal" }> = [
    { label: "Visitas (sesiones)", metric: kpis.visits },
    { label: "Visitantes únicos", metric: kpis.uniqueVisitors },
    { label: "Detalles abiertos", metric: kpis.detailOpens },
    { label: "Vehículos vistos", metric: kpis.uniqueVehiclesViewed },
    { label: "Clicks WhatsApp", metric: kpis.whatsappClicks },
    { label: "Leads", metric: kpis.leads },
    { label: "Ofertas enviadas", metric: kpis.offersSent },
    { label: "Conversión global", metric: kpis.globalConversionRate, format: "percent" },
    { label: "Detalle / visita", metric: kpis.detailPerVisitRate, format: "percent" },
    { label: "WA / detalle", metric: kpis.whatsappPerDetailRate, format: "percent" },
    { label: "Profundidad / sesión", metric: kpis.avgDepthPerSession, format: "decimal" },
    { label: "Rebote", metric: kpis.bounceRate, format: "percent" },
  ];
  const cardW = (contentWidth - 12) / 2;
  const cardH = 58;
  kpiRows.forEach((item, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    drawKpiCard(doc, MARGIN + col * (cardW + 12), y + row * (cardH + 10), cardW, cardH, item.label, item.metric, item.format);
  });
  y += Math.ceil(kpiRows.length / 2) * (cardH + 10) + 16;

  y = drawSectionHeader(doc, MARGIN, y, contentWidth, "Canales y engagement");
  const channelKpis = [
    { label: "WA tarjeta", metric: kpis.whatsappCard },
    { label: "WA modal", metric: kpis.whatsappModal },
    { label: "WA flotante", metric: kpis.whatsappFloating },
    { label: "Compartidos", metric: kpis.shares },
    { label: "Visor 3D", metric: kpis.viewer3dOpens },
    { label: "PDF calendario", metric: kpis.pdfDownloads },
  ];
  channelKpis.forEach((item, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const cw = (contentWidth - 16) / 3;
    drawKpiCard(doc, MARGIN + col * (cw + 8), y + row * (cardH + 8), cw, cardH - 4, item.label, item.metric);
  });

  // --- Página 3: Embudo + conclusiones ---
  doc.addPage();
  y = MARGIN;
  y = drawSectionHeader(doc, MARGIN, y, contentWidth, "Embudo de conversión", "De visita a contacto comercial");
  y = drawFunnel(doc, MARGIN, y, contentWidth, payload.funnel) + 8;

  y = drawSectionHeader(doc, MARGIN, y, contentWidth, "Conclusiones y hallazgos", "Análisis automático del período");
  for (const insight of insights.slice(0, 5)) {
    if (y > pageHeight - 100) {
      doc.addPage();
      y = MARGIN;
    }
    y = drawInsightCard(doc, MARGIN, y, contentWidth, insight);
  }

  // --- Página 4: Vehículos ---
  doc.addPage();
  y = MARGIN;
  y = drawSectionHeader(doc, MARGIN, y, contentWidth, "Ranking de vehículos", "Score ponderado por intención comercial");
  const vCols = ["#", "Patente", "Modelo", "Det.", "WA", "Of.", "Score"];
  const vWidths = [18, 52, contentWidth - 18 - 52 - 36 - 28 - 28 - 40, 36, 28, 28, 40];
  drawTableHeader(doc, MARGIN, y, contentWidth, vCols, vWidths);
  y += 22;
  payload.vehicles.slice(0, 12).forEach((row, index) => {
    if (y > pageHeight - 60) {
      doc.addPage();
      y = MARGIN;
      drawTableHeader(doc, MARGIN, y, contentWidth, vCols, vWidths);
      y += 22;
    }
    if (index % 2 === 0) {
      doc.setFillColor(...BRAND.rowAlt);
      doc.rect(MARGIN, y - 10, contentWidth, 16, "F");
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...BRAND.slate);
    let cx = MARGIN + 6;
    const cells = [
      String(index + 1),
      row.patent,
      row.model.slice(0, 42),
      String(row.detailOpens),
      String(row.whatsappClicks),
      String(row.offersSent),
      String(row.score),
    ];
    cells.forEach((cell, ci) => {
      doc.text(sanitizePdfText(cell), cx, y);
      cx += vWidths[ci] ?? 0;
    });
    y += 16;
  });

  // --- Página 5: Segmentos + búsquedas + timeline ---
  doc.addPage();
  y = MARGIN;
  y = drawSectionHeader(doc, MARGIN, y, contentWidth, "Rendimiento por segmento", "Secciones y remates con mayor score");
  const segRows = payload.sections
    .filter((row) => !row.key.startsWith("type:") && !row.key.startsWith("price:"))
    .slice(0, 8);
  segRows.forEach((row, index) => {
    doc.setFillColor(...(index % 2 === 0 ? BRAND.rowAlt : BRAND.white));
    doc.rect(MARGIN, y, contentWidth, 20, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.slate);
    doc.text(sanitizePdfText(row.label.slice(0, 48)), MARGIN + 8, y + 13);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...BRAND.slateMuted);
    doc.text(
      `Det ${row.detailOpens} · WA ${row.whatsappClicks} · Of ${row.offersSent} · Score ${row.score}`,
      pageWidth - MARGIN - 8,
      y + 13,
      { align: "right" },
    );
    y += 22;
  });
  y += 8;

  y = drawSectionHeader(doc, MARGIN, y, contentWidth, "Inventario publicado", "Salud del catálogo en el período");
  const inv = payload.inventory;
  const invStats = [
    ["Publicados visibles", inv.publishedVisible],
    ["Sin interacciones", inv.zeroInteractions],
    ["Alto interés sin contacto", inv.highInterestNoContact],
    ["Estrellas", inv.stars],
  ];
  invStats.forEach(([label, value], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const cw = (contentWidth - 12) / 2;
    const ix = MARGIN + col * (cw + 12);
    const iy = y + row * 66;
    doc.setFillColor(...BRAND.white);
    doc.setDrawColor(...BRAND.border);
    doc.roundedRect(ix, iy, cw, 56, 6, 6, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.slateMuted);
    doc.text(sanitizePdfText(String(label)), ix + 12, iy + 18);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...BRAND.slate);
    doc.text(fmtNum(Number(value)), ix + 12, iy + 40);
  });
  y += 140;

  y = drawSectionHeader(doc, MARGIN, y, contentWidth, "Actividad diaria", "Visitas por día en el período");
  drawTimelineChart(doc, MARGIN, y, contentWidth, 80, payload.timeline);
  y += 100;

  if (payload.searches.searches.length > 0) {
    y = drawSectionHeader(doc, MARGIN, y, contentWidth, "Búsquedas destacadas");
    payload.searches.searches.slice(0, 5).forEach((row) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...BRAND.slate);
      doc.text(`• ${sanitizePdfText(row.term)} — ${row.count} búsqueda(s)`, MARGIN + 8, y);
      y += 14;
    });
  }

  // --- Página 6: Más conclusiones ---
  doc.addPage();
  y = MARGIN;
  y = drawSectionHeader(doc, MARGIN, y, contentWidth, "Plan de acción sugerido", "Próximos pasos para la semana entrante");
  for (const insight of insights.slice(5)) {
    y = drawInsightCard(doc, MARGIN, y, contentWidth, insight);
    if (y > pageHeight - 80) break;
  }

  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(...BRAND.slateMuted);
  const footerNote = doc.splitTextToSize(
    sanitizePdfText(
      "Este informe se genera automáticamente desde los eventos first-party del catálogo (Supabase). Excluye actividad de administración. Para detalle interactivo, revisa el panel Analytics en el editor del catálogo.",
    ),
    contentWidth,
  );
  footerNote.forEach((line, index) => {
    doc.text(line, MARGIN, pageHeight - 72 + index * 11);
  });

  const totalPages = doc.internal.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    if (page > 1) drawPageFooter(doc, pageWidth, pageHeight, page, totalPages);
  }

  const buffer = doc.output("arraybuffer");
  return { bytes: new Uint8Array(buffer), fileName };
}
