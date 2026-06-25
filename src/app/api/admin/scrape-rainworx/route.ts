import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/admin-session";
import { getEditorConfig, saveEditorConfig } from "@/lib/editor-config";
import { syncEditorConfigToSharedTables } from "@/lib/catalog-shared-sync";
import { mergeSharedEventsIntoConfig } from "@/lib/catalog-shared-merge";
import { applyExclusiveCommercialAssignment } from "@/lib/commercial-category-exclusivity";
import type { CommercialLane } from "@/lib/commercial-category-exclusivity";
import {
  formatClpString,
  mergeEditorVehicleDetails,
  normalizePatenteKey,
  rainworxToEditorVehicleDetails,
} from "@/lib/rainworx-to-editor";
import {
  mergeEditorVehicleDetailsSmart,
  type RainworxEditorMergeMode,
} from "@/lib/rainworx-merge-smart";
import { mirrorRainworxDocumentsToCloudinary } from "@/lib/rainworx-documents-cloudinary";
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
  /**
   * Con `eventUrl`, restringe a lotes cuya patente esté en esta lista (p. ej. patentes del inventario
   * visible en el editor). Si se omite, se consideran todos los lotes del evento (hasta `maxLots`).
   */
  matchInventoryPatentes?: string[];
  maxLots?: number;
  delayMs?: number;
  /**
   * Si es true, fusiona en `catalogo_editor_config` → `vehicleDetails` usando la misma clave que el catálogo (patente normalizada).
   */
  applyToEditor?: boolean;
  /** Por defecto `merge_smart` (preserva fotos Glo3D/Tasaciones y completa vacíos). */
  editorMerge?: RainworxEditorMergeMode;
  /** Si es true (default con `applyToEditor`), actualiza `vehiclePrices` con el precio actual del lote. */
  updateVehiclePrices?: boolean;
  /**
   * Con `eventUrl`: importa también lotes del evento cuya patente no está en `matchInventoryPatentes`
   * (fichas nuevas con merge completo Rainworx).
   */
  addNewLotsFromEvent?: boolean;
  /** Asigna patentes nuevas al remate o venta directa indicada. */
  assignNewLotsAuctionId?: string;
  /** Tipo comercial para la asignación (`remate` → próximos remates, `venta_directa` → ventas directas). */
  assignNewLotsEventType?: "remate" | "venta_directa";
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
  const editorMerge: RainworxEditorMergeMode = body.editorMerge ?? "merge_smart";
  const updateVehiclePrices = body.updateVehiclePrices !== false;
  const addNewLotsFromEvent = Boolean(body.addNewLotsFromEvent);
  const assignNewLotsAuctionId = body.assignNewLotsAuctionId?.trim();
  const assignNewLotsEventType = body.assignNewLotsEventType ?? "remate";

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
      const rawMatch = body.matchInventoryPatentes;
      const matchList =
        rawMatch && rawMatch.length > 0
          ? [...new Set(rawMatch.map((p) => normalizePatenteKey(p)).filter(Boolean))]
          : undefined;
      if (
        !addNewLotsFromEvent &&
        rawMatch &&
        rawMatch.length > 0 &&
        (!matchList || matchList.length === 0)
      ) {
        return Response.json(
          { error: "Ninguna patente válida en matchInventoryPatentes." },
          { status: 400 },
        );
      }
      items = await scrapeEventLots({
        eventPageUrl: body.eventUrl,
        patente: body.patente,
        ...(addNewLotsFromEvent || !matchList || matchList.length === 0
          ? {}
          : { matchPatentes: matchList }),
        maxLots:
          body.maxLots ??
          (addNewLotsFromEvent ? 200 : matchList && matchList.length > 0 ? 160 : 80),
        delayMs: body.delayMs ?? 250,
      });
    } else {
      return Response.json(
        { error: "Indica eventUrl o lotUrls en el cuerpo JSON" },
        { status: 400 },
      );
    }

    if (applyToEditor) {
      for (let i = 0; i < items.length; i++) {
        const s = items[i];
        if (!s.documentos.length) continue;
        items[i] = {
          ...s,
          documentos: await mirrorRainworxDocumentsToCloudinary(s.documentos, s.lotId),
        };
      }
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
    const updatedPatentes = new Set<string>();
    const newPatentes = new Set<string>();
    let photosPreserved = 0;

    const groupPatenteSet = new Set(
      (body.matchInventoryPatentes ?? []).map((p) => normalizePatenteKey(p)).filter(Boolean),
    );

    for (let i = 0; i < mapped.length; i++) {
      const row = mapped[i];
      if (!row.vehicleKey) {
        skipped.push({ reason: "Sin patente en ficha Rainworx", lotId: row.scraped.lotId });
        continue;
      }

      const isExistingInGroup = groupPatenteSet.has(row.vehicleKey);
      const isNewFromEvent = addNewLotsFromEvent && groupPatenteSet.size > 0 && !isExistingInGroup;
      const rowMerge: RainworxEditorMergeMode = isNewFromEvent ? "rainworx_wins" : editorMerge;

      const keysToWrite = new Set<string>([row.vehicleKey]);
      const catalogId = body.catalogItemIds?.[i]?.trim();
      if (catalogId) keysToWrite.add(catalogId);
      for (const [k, v] of Object.entries(config.vehicleDetails)) {
        if (normalizePatenteKey(v.patente) === row.vehicleKey) keysToWrite.add(k);
      }

      let nextDetails = { ...config.vehicleDetails };
      let nextPrices = { ...config.vehiclePrices };
      for (const k of keysToWrite) {
        const existing = nextDetails[k];
        if (rowMerge === "merge_smart") {
          const { details, stats } = mergeEditorVehicleDetailsSmart(existing, row.details);
          nextDetails[k] = details;
          if (stats.photosPreserved) photosPreserved += 1;
        } else {
          nextDetails[k] = mergeEditorVehicleDetails(existing, row.details, rowMerge);
        }
        if (updateVehiclePrices && row.scraped.precioActualClp != null) {
          nextPrices[k] = formatClpString(row.scraped.precioActualClp);
        }
        applied.add(k);
      }
      if (isNewFromEvent) {
        newPatentes.add(row.vehicleKey);
      } else if (isExistingInGroup || groupPatenteSet.size === 0) {
        updatedPatentes.add(row.vehicleKey);
      }
      config = { ...config, vehicleDetails: nextDetails, vehiclePrices: nextPrices };
    }

    if (addNewLotsFromEvent && assignNewLotsAuctionId && newPatentes.size > 0) {
      const lane: CommercialLane =
        assignNewLotsEventType === "venta_directa" ? "ventas-directas" : "proximos-remates";
      const assignment = applyExclusiveCommercialAssignment(
        config,
        [...newPatentes],
        { lane, auctionId: assignNewLotsAuctionId },
        config.upcomingAuctions ?? [],
      );
      config = {
        ...config,
        sectionVehicleIds: assignment.sectionVehicleIds,
        vehicleUpcomingAuctionIds: assignment.vehicleUpcomingAuctionIds,
      };
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

    const normalizedConfig = saved.normalizedConfig ?? config;
    const mergedConfig = await mergeSharedEventsIntoConfig(normalizedConfig);
    const sync = await syncEditorConfigToSharedTables(mergedConfig);

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
        updatedPatentes: [...updatedPatentes],
        newPatentes: [...newPatentes],
        photosPreserved,
        assignedAuctionId: assignNewLotsAuctionId && newPatentes.size > 0 ? assignNewLotsAuctionId : undefined,
      },
      sync,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return Response.json({ error: message }, { status: 502 });
  }
}
