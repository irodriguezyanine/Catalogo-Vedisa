import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/admin-session";
import { getEditorConfig, saveEditorConfig } from "@/lib/editor-config";
import {
  formatClpString,
  mergeEditorVehicleDetails,
  normalizePatenteKey,
  rainworxToEditorVehicleDetails,
} from "@/lib/rainworx-to-editor";
import {
  fetchRainworxHtml,
  getRainworxOrigin,
  parseLotDetailsHtml,
  type RainworxLotScraped,
  scrapeEventLots,
  toAbsoluteUrl,
} from "@/lib/rainworx-scrape";

type Body = {
  /** URL completa de `/Event/Details/{eventId}/...`. */
  eventUrl?: string;
  /** Una o más URLs de `/Event/LotDetails/{lotId}/...`. */
  lotUrls?: string[];
  /** Si se envía `eventUrl`, filtra lotes cuya patente coincida (ej. STHC32 o XXYY12). */
  patente?: string;
  maxLots?: number;
  delayMs?: number;
  /**
   * Si es true, fusiona en `catalogo_editor_config` → `vehicleDetails` usando la misma clave que el catálogo (patente normalizada).
   */
  applyToEditor?: boolean;
  /** Por defecto `rainworx_wins` (la ficha Rainworx actualiza campos). Usa `fill_empty` para no sobrescribir lo ya editado. */
  editorMerge?: "rainworx_wins" | "fill_empty";
  /** Si es true (default con `applyToEditor`), actualiza `vehiclePrices` con el precio actual del lote. */
  updateVehiclePrices?: boolean;
};

/**
 * Extrae datos de Rainworx (vehiculoschocados.cl / vedisaremates.cl) para alimentar el catálogo.
 * Con `applyToEditor`, escribe en Supabase la configuración del editor (misma clave por patente que `getVehicleKey` en el cliente).
 */
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const session = verifyAdminSessionToken(token);

  if (!session.valid || !session.email) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const origin = getRainworxOrigin();
  const applyToEditor = Boolean(body.applyToEditor);
  const editorMerge = body.editorMerge ?? "rainworx_wins";
  const updateVehiclePrices = body.updateVehiclePrices !== false;

  try {
    let items: RainworxLotScraped[];

    if (body.lotUrls?.length) {
      items = [];
      for (const raw of body.lotUrls) {
        const url = toAbsoluteUrl(origin, raw);
        const html = await fetchRainworxHtml(url);
        items.push(parseLotDetailsHtml(html, url));
      }
    } else if (body.eventUrl) {
      items = await scrapeEventLots({
        eventPageUrl: body.eventUrl,
        patente: body.patente,
        maxLots: body.maxLots,
        delayMs: body.delayMs,
      });
    } else {
      return Response.json(
        { error: "Indica eventUrl o lotUrls en el cuerpo JSON" },
        { status: 400 },
      );
    }

    const mapped = items.map((scraped) => ({
      vehicleKey: normalizePatenteKey(
        scraped.detalles.PATENTE ?? scraped.detallesNormalizados.patente,
      ),
      details: rainworxToEditorVehicleDetails(scraped),
      scraped,
    }));

    if (!applyToEditor) {
      return Response.json({
        ok: true,
        count: items.length,
        items,
        mapped: mapped.map((m) => ({ vehicleKey: m.vehicleKey, details: m.details })),
      });
    }

    const load = await getEditorConfig();
    let config = load.config;
    const applied: string[] = [];
    const skipped: { reason: string; lotId?: string }[] = [];

    for (const row of mapped) {
      if (!row.vehicleKey) {
        skipped.push({ reason: "Sin patente en ficha Rainworx", lotId: row.scraped.lotId });
        continue;
      }
      const prev = config.vehicleDetails[row.vehicleKey];
      config = {
        ...config,
        vehicleDetails: {
          ...config.vehicleDetails,
          [row.vehicleKey]: mergeEditorVehicleDetails(prev, row.details, editorMerge),
        },
      };
      if (updateVehiclePrices && row.scraped.precioActualClp != null) {
        config = {
          ...config,
          vehiclePrices: {
            ...config.vehiclePrices,
            [row.vehicleKey]: formatClpString(row.scraped.precioActualClp),
          },
        };
      }
      applied.push(row.vehicleKey);
    }

    const saved = await saveEditorConfig(config, session.email);
    if (!saved.ok) {
      return Response.json(
        {
          ok: false,
          error: saved.error,
          count: items.length,
          items,
          mapped: mapped.map((m) => ({ vehicleKey: m.vehicleKey, details: m.details })),
          applied,
          skipped,
        },
        { status: 400 },
      );
    }

    return Response.json({
      ok: true,
      count: items.length,
      items,
      mapped: mapped.map((m) => ({ vehicleKey: m.vehicleKey, details: m.details })),
      editor: {
        saved: true,
        merge: editorMerge,
        pricesUpdated: updateVehiclePrices,
        applied,
        skipped,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return Response.json({ error: message }, { status: 502 });
  }
}
