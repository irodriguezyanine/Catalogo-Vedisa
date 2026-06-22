import {
  buildWeeklyAnalyticsReportPreview,
  runWeeklyAnalyticsReport,
  shouldSendWeeklyReportNow,
} from "@/lib/analytics-weekly-report";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

/** Viernes 15:00 Chile: cron horario en viernes; solo envía en esa ventana. */
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const force = searchParams.get("force") === "1";

  const result = await runWeeklyAnalyticsReport({
    force,
    skipScheduleCheck: force,
  });

  if (!result.ok && !result.skipped) {
    return Response.json({ ok: false, error: result.reason }, { status: 500 });
  }

  return Response.json({
    ok: true,
    skipped: result.skipped ?? false,
    reason: result.reason,
    fileName: result.fileName,
    recipients: result.recipients,
    scheduleWindow: shouldSendWeeklyReportNow(),
    sentAt: new Date().toISOString(),
  });
}
