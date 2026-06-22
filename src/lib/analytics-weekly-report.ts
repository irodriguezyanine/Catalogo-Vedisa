import { buildAnalyticsDashboardPayload } from "@/lib/analytics-admin-shared";
import {
  buildAnalyticsReportInsights,
  formatReportPeriodLabel,
  type ReportInsight,
} from "@/lib/analytics-report-insights";
import { generateAnalyticsReportPdf } from "@/lib/analytics-report-pdf";
import { sendEmailWithPdfAttachment } from "@/lib/ses-mail";

const REPORT_FROM_EMAIL =
  process.env.ANALYTICS_REPORT_FROM_EMAIL?.trim() || "comercial@vedisaremates.cl";

const REPORT_TO_EMAILS = (
  process.env.ANALYTICS_REPORT_TO_EMAILS?.trim() ||
  "jpmontero@vedisaremates.cl,tasaciones@vedisaremates.cl"
)
  .split(",")
  .map((email) => email.trim())
  .filter(Boolean);

const REPORT_LOGO_URL = "https://catalogo.vedisaremates.cl/vedisa-logo.png";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildReportEmailHtml(input: {
  periodLabel: string;
  days: number;
  insights: ReportInsight[];
  kpis: { visits: number; detailOpens: number; whatsappClicks: number; offersSent: number; conversion: number };
}): string {
  const insightRows = input.insights
    .slice(0, 6)
    .map(
      (insight) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">
          <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#0f172a;">${escapeHtml(insight.title)}</p>
          <p style="margin:0;font-size:12px;line-height:1.55;color:#475569;">${escapeHtml(insight.body)}</p>
        </td>
      </tr>`,
    )
    .join("");

  return `
<!doctype html>
<html lang="es">
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:640px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="padding:20px 24px;background:linear-gradient(120deg,#0c1c3d,#0891b2);">
            <img src="${REPORT_LOGO_URL}" alt="VEDISA" style="display:block;width:150px;height:auto;" />
            <p style="margin:16px 0 0;font-size:12px;letter-spacing:.5px;text-transform:uppercase;color:#a5f3fc;font-weight:700;">Informe semanal</p>
            <h1 style="margin:6px 0 0;font-size:22px;color:#fff;">Catálogo · ${escapeHtml(input.periodLabel)}</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 24px;">
            <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#334155;">
              Adjunto encontrarás el informe PDF con KPIs, embudo, ranking de vehículos y conclusiones de los últimos <strong>${input.days} días</strong>.
            </p>
            <table role="presentation" width="100%" style="border-collapse:separate;border-spacing:8px;margin-bottom:16px;">
              <tr>
                ${[
                  ["Visitas", input.kpis.visits],
                  ["Detalles", input.kpis.detailOpens],
                  ["WhatsApp", input.kpis.whatsappClicks],
                  ["Conversión", `${input.kpis.conversion}%`],
                ]
                  .map(
                    ([label, value]) => `
                <td style="width:25%;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px;text-align:center;">
                  <p style="margin:0;font-size:11px;color:#64748b;">${label}</p>
                  <p style="margin:4px 0 0;font-size:16px;font-weight:800;color:#0f172a;">${value}</p>
                </td>`,
                  )
                  .join("")}
              </tr>
            </table>
            <p style="margin:0 0 8px;font-size:12px;font-weight:700;text-transform:uppercase;color:#0e7490;">Destacados del informe</p>
            <table role="presentation" width="100%">${insightRows}</table>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;">
            <p style="margin:0;font-size:11px;color:#64748b;">Enviado automáticamente desde comercial@vedisaremates.cl · Catálogo Vedisa</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();
}

export function shouldSendWeeklyReportNow(date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santiago",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(date);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? -1);
  return weekday === "Fri" && hour === 15;
}

export async function runWeeklyAnalyticsReport(options?: {
  days?: number;
  force?: boolean;
  skipScheduleCheck?: boolean;
}): Promise<{
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  fileName?: string;
  recipients?: string[];
}> {
  if (process.env.ANALYTICS_WEEKLY_REPORT_ENABLED === "false") {
    return { ok: false, skipped: true, reason: "Informe semanal deshabilitado por configuración." };
  }

  if (!options?.skipScheduleCheck && !options?.force && !shouldSendWeeklyReportNow()) {
    return { ok: true, skipped: true, reason: "Fuera de ventana viernes 15:00 America/Santiago." };
  }

  const days = options?.days ?? 7;
  const payload = await buildAnalyticsDashboardPayload(days);
  if (!payload.ok) {
    return { ok: false, reason: payload.error ?? "No se pudo cargar analytics." };
  }

  const insights = buildAnalyticsReportInsights(payload);
  const { bytes, fileName } = await generateAnalyticsReportPdf({ payload, insights });
  const periodLabel = formatReportPeriodLabel(payload);
  const subject = `Informe semanal Catálogo Vedisa | ${days} días | ${periodLabel}`;

  const html = buildReportEmailHtml({
    periodLabel,
    days,
    insights,
    kpis: {
      visits: payload.kpis.visits.value,
      detailOpens: payload.kpis.detailOpens.value,
      whatsappClicks: payload.kpis.whatsappClicks.value,
      offersSent: payload.kpis.offersSent.value,
      conversion: payload.kpis.globalConversionRate.value,
    },
  });

  const text = [
    `Informe semanal Catálogo Vedisa (${periodLabel})`,
    "",
    `Visitas: ${payload.kpis.visits.value}`,
    `Detalles: ${payload.kpis.detailOpens.value}`,
    `WhatsApp: ${payload.kpis.whatsappClicks.value}`,
    `Ofertas: ${payload.kpis.offersSent.value}`,
    `Conversión: ${payload.kpis.globalConversionRate.value}%`,
    "",
    "Ver PDF adjunto para el análisis completo.",
  ].join("\n");

  await sendEmailWithPdfAttachment({
    from: REPORT_FROM_EMAIL,
    to: REPORT_TO_EMAILS,
    subject,
    html,
    text,
    attachmentName: fileName,
    attachmentBytes: bytes,
  });

  return { ok: true, fileName, recipients: REPORT_TO_EMAILS };
}

export async function buildWeeklyAnalyticsReportPreview(days = 7) {
  const payload = await buildAnalyticsDashboardPayload(days);
  if (!payload.ok) throw new Error(payload.error ?? "No se pudo cargar analytics.");
  const insights = buildAnalyticsReportInsights(payload);
  return generateAnalyticsReportPdf({ payload, insights });
}
