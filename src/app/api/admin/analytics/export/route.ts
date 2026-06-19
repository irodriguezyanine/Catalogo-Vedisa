import {
  assertAdminAnalytics,
  buildAnalyticsDashboardPayload,
  parseAnalyticsDays,
} from "@/lib/analytics-admin-shared";

function toCsvCell(value: string | number | null | undefined): string {
  const sample = value == null ? "" : String(value);
  if (/[",\n\r]/.test(sample)) return `"${sample.replace(/"/g, '""')}"`;
  return sample;
}

export async function GET(req: Request) {
  const auth = await assertAdminAnalytics();
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.error }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const days = parseAnalyticsDays(searchParams);
  const format = (searchParams.get("format") ?? "csv").toLowerCase();

  const payload = await buildAnalyticsDashboardPayload(days);
  if (!payload.ok) {
    return Response.json({ ok: false, error: payload.error }, { status: 400 });
  }

  if (format !== "csv") {
    return Response.json({ ok: false, error: "Solo se admite format=csv." }, { status: 400 });
  }

  const lines: string[] = [];

  lines.push("RESUMEN KPI");
  lines.push(
    ["KPI", "Valor", "Periodo anterior", "Delta %", "Delta pp"]
      .map(toCsvCell)
      .join(","),
  );
  for (const [key, metric] of Object.entries(payload.kpis)) {
    if (key === "dominantWhatsappChannel") continue;
    const m = metric as { value: number; previous: number; deltaPct: number | null; deltaPp?: number | null };
    lines.push(
      [key, m.value, m.previous, m.deltaPct ?? "", m.deltaPp ?? ""].map(toCsvCell).join(","),
    );
  }

  lines.push("");
  lines.push("EMBUDO");
  lines.push(["Etapa", "Conteo", "% desde anterior", "% desde inicio"].map(toCsvCell).join(","));
  for (const step of payload.funnel) {
    lines.push(
      [step.label, step.count, step.rateFromPrevious ?? "", step.rateFromStart ?? ""]
        .map(toCsvCell)
        .join(","),
    );
  }

  lines.push("");
  lines.push("TOP VEHICULOS");
  lines.push(
    ["Patente", "Modelo", "Seccion", "Detalles", "WhatsApp", "Ofertas", "Score", "Delta score %"]
      .map(toCsvCell)
      .join(","),
  );
  for (const row of payload.vehicles) {
    lines.push(
      [
        row.patent,
        row.model,
        row.sectionLabel,
        row.detailOpens,
        row.whatsappClicks,
        row.offersSent,
        row.score,
        row.deltaScorePct ?? "",
      ]
        .map(toCsvCell)
        .join(","),
    );
  }

  lines.push("");
  lines.push("SECCIONES Y SEGMENTOS");
  lines.push(["Clave", "Etiqueta", "Detalles", "WhatsApp", "Ofertas", "Leads", "Score"].map(toCsvCell).join(","));
  for (const row of payload.sections) {
    lines.push(
      [row.key, row.label, row.detailOpens, row.whatsappClicks, row.offersSent, row.leads, row.score]
        .map(toCsvCell)
        .join(","),
    );
  }

  lines.push("");
  lines.push("BUSQUEDAS");
  lines.push(["Termino", "Busquedas", "Sin resultados"].map(toCsvCell).join(","));
  for (const row of payload.searches.searches) {
    lines.push([row.term, row.count, row.noResultsCount].map(toCsvCell).join(","));
  }

  lines.push("");
  lines.push("ACTIVIDAD DIARIA");
  lines.push(
    ["Fecha", "Eventos", "Visitas", "Detalles", "WhatsApp", "Leads", "Ofertas"]
      .map(toCsvCell)
      .join(","),
  );
  for (const row of payload.timeline) {
    lines.push(
      [row.date, row.total, row.visits, row.detailOpens, row.whatsappClicks, row.leads, row.offersSent]
        .map(toCsvCell)
        .join(","),
    );
  }

  const csv = `\uFEFF${lines.join("\n")}`;
  const dateTag = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="analytics-${days}d-${dateTag}.csv"`,
    },
  });
}
