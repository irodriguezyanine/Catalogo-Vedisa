import { handleCatalogSyncEvent } from "@/lib/catalog-sync-event-handler";
import { buildCatalogSyncCorsHeaders, withCatalogSyncCors } from "@/lib/catalog-sync-cors";
import type { CatalogSyncEvent } from "@/types/catalog-sync-contract";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CATALOG_SYNC_WEBHOOK_SECRET?.trim();
  if (!secret) return true;
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const headerSecret = req.headers.get("x-catalog-sync-secret")?.trim();
  return bearer === secret || headerSecret === secret;
}

function parseCatalogSyncEvent(raw: unknown): CatalogSyncEvent | { error: string } {
  if (!raw || typeof raw !== "object") {
    return { error: "Body inválido." };
  }

  const body = raw as Record<string, unknown>;
  const type = String(body.type ?? "").trim();

  switch (type) {
    case "reconcile":
      return {
        type: "reconcile",
        source: typeof body.source === "string" ? body.source : undefined,
        idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
      };
    case "remove-vehicle": {
      const remateId = String(body.remateId ?? "").trim();
      if (!remateId) return { error: "Falta remateId." };
      return {
        type: "remove-vehicle",
        remateId,
        patente: typeof body.patente === "string" ? body.patente : undefined,
        patentes: Array.isArray(body.patentes)
          ? body.patentes.map((value) => String(value))
          : undefined,
        idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
      };
    }
    case "visibility-changed": {
      const remateId = String(body.remateId ?? "").trim();
      if (!remateId) return { error: "Falta remateId." };
      return {
        type: "visibility-changed",
        remateId,
        visible: body.visible === true || body.visible === "true",
        source: typeof body.source === "string" ? body.source : undefined,
        idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
      };
    }
    default:
      return { error: "Falta type en el evento o no es soportado." };
  }
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: buildCatalogSyncCorsHeaders(req) });
}

/** Endpoint idempotente unificado: reconcile | remove-vehicle | visibility-changed */
export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return withCatalogSyncCors(
      req,
      Response.json({ ok: false, error: "No autorizado." }, { status: 401 }),
    );
  }

  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseCatalogSyncEvent(rawBody);

  if ("error" in parsed) {
    return withCatalogSyncCors(
      req,
      Response.json({ ok: false, error: parsed.error }, { status: 400 }),
    );
  }

  const source =
    typeof rawBody === "object" &&
    rawBody !== null &&
    typeof (rawBody as Record<string, unknown>).source === "string"
      ? String((rawBody as Record<string, unknown>).source)
      : "webhook@sync-event";

  const result = await handleCatalogSyncEvent(parsed, source);

  return withCatalogSyncCors(
    req,
    Response.json(result, { status: result.ok ? 200 : 500 }),
  );
}
