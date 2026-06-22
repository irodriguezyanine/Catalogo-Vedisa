import { assertAdminAnalytics } from "@/lib/analytics-admin-shared";
import {
  buildWeeklyAnalyticsReportPreview,
  runWeeklyAnalyticsReport,
} from "@/lib/analytics-weekly-report";

export const maxDuration = 120;

/** Vista previa PDF o envío manual del informe semanal (solo admin). */
export async function GET(req: Request) {
  const auth = await assertAdminAnalytics();
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.error }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const days = Math.max(7, Math.min(Number(searchParams.get("days") ?? "7"), 30));

  try {
    const { bytes, fileName } = await buildWeeklyAnalyticsReportPreview(days);
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo generar el informe.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await assertAdminAnalytics();
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.error }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const days = Math.max(7, Math.min(Number(searchParams.get("days") ?? "7"), 30));

  try {
    const result = await runWeeklyAnalyticsReport({
      days,
      force: true,
      skipScheduleCheck: true,
    });
    if (!result.ok) {
      return Response.json({ ok: false, error: result.reason }, { status: 500 });
    }
    return Response.json({
      ok: true,
      fileName: result.fileName,
      recipients: result.recipients,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo enviar el informe.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
