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
  /** Mismo orden que `lotUrls`: `id` del vehículo en catálogo (UUID de inventario) para guardar también bajo esa clave si el listado no tiene patente. */
  catalogItemIds?: string[];
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
  /**
   * Patente normalizada esperada (p. ej. al editar una ficha). Si se envía y no coincide con la del lote Rainworx, no se guarda (409).
   */
  expectedPatente?: string;
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

    const expectedPatente = normalizePatenteKey(body.expectedPatente);
    if (expectedPatente) {
      for (const row of mapped) {
        if (!row.vehicleKey) {
          return Response.json(
            {
              error:
                "El lote Rainworx no incluye patente; no se puede verificar que corresponda a esta ficha.",
            },
            { status: 409 },
          );
        }
        if (row.vehicleKey !== expectedPatente) {
          return Response.json(
            {
              error: `La patente en Rainworx (${row.vehicleKey}) no coincide con esta ficha (${expectedPatente}). Revisa la URL o la patente del vehículo.`,
            },
            { status: 409 },
          );
        }
      }
    }

    const load = await getEditorConfig();
    let config = load.config;
    const applied = new Set<string>();
    const skipped: { reason: string; lotId?: string }[] = [];

    for (let i = 0; i < mapped.length; i++) {
      const row = mapped[i];
      if (!row.vehicleKey) {
        skipped.push({ reason: "Sin patente en ficha Rainworx", lotId: row.scraped.lotId });
        continue;
      }

      const keysToWrite = new Set<string>([row.vehicleKey]);
      const catalogId = body.catalogItemIds?.[i]?.trim();
      if (catalogId) keysToWrite.add(catalogId);
      for (const [k, v] of Object.entries(config.vehicleDetails)) {
        if (normalizePatenteKey(v.patente) === row.vehicleKey) keysToWrite.add(k);
      }

      let nextDetails = { ...config.vehicleDetails };
      let nextPrices = { ...config.vehiclePrices };
      for (const k of keysToWrite) {
        nextDetails[k] = mergeEditorVehicleDetails(nextDetails[k], row.details, editorMerge);
        if (updateVehiclePrices && row.scraped.precioActualClp != null) {
          nextPrices[k] = formatClpString(row.scraped.precioActualClp);
        }
        applied.add(k);
      }
      config = { ...config, vehicleDetails: nextDetails, vehiclePrices: nextPrices };
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
          applied: [...applied],
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
        applied: [...applied],
        skipped,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return Response.json({ error: message }, { status: 502 });
  }
}
