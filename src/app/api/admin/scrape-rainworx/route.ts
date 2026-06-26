import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/admin-session";
import { getEditorConfig, saveEditorConfig } from "@/lib/editor-config";
import {
  deleteRemateItemsForRemovedAssignments,
  findRemovedVehicleAssignmentsForAuction,
  syncEditorConfigToSharedTablesWithOptions,
} from "@/lib/catalog-shared-sync";
import { ESTADO_RETIRO_VENTA_DIRECTA } from "@/lib/catalog-shared-constants";
import type { CommercialLane } from "@/lib/commercial-category-exclusivity";
import { removePatentFromAuctionAssignment } from "@/lib/catalog-remove-vehicle-from-event";
import {
  assignPatentesToTargetAuction,
  collectPatentesAssignedToAuction,
  resolveCommercialLaneForAuction,
  resolveVehicleKeysForAuctionPatente,
} from "@/lib/rainworx-auction-scope";
import { revalidateCatalogSurfaces } from "@/lib/revalidate-catalog";
import { hydrateRainworxPatentsInInventario } from "@/lib/rainworx-inventario-hydrate";
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
  parseRainworxEventPage,
  type RainworxEventPageMeta,
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
   * Con `eventUrl` + `assignNewLotsAuctionId`: quita del grupo las patentes que ya no aparecen en Rainworx
   * (el listado del evento queda como fuente de verdad).
   */
  syncGroupExclusive?: boolean;
  /**
   * Patente normalizada esperada (p. ej. al editar una ficha). Si se envía y no coincide con la del lote Rainworx, no se guarda (409).
   */
  expectedPatente?: string;
};

/**
 * Extrae datos de Rainworx (vehiculoschocados.cl / vedisaremates.cl) para alimentar el catálogo.
 * Con `applyToEditor`, escribe en Supabase la configuración del editor (misma clave por patente que `getVehicleKey` en el cliente).
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

const ESTADO_RETIRO_REMATE = "en_bodega_a_remate";
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
  const syncGroupExclusive = body.syncGroupExclusive !== false;

  try {
    let items: RainworxLotScraped[];
    let rainworxCollectionMeta: import("@/lib/rainworx-scrape").ScrapeEventCollectionMeta | undefined;
    let rainworxEventMeta: RainworxEventPageMeta | undefined;

    if (body.lotUrls?.length) {
      items = [];
      for (const raw of body.lotUrls) {
        const url = toAbsoluteUrl(origin, raw);
        const html = await fetchRainworxHtml(url);
        items.push(parseLotDetailsHtml(html, url));
      }
    } else if (body.eventUrl) {
      const eventUrlAbs = toAbsoluteUrl(origin, body.eventUrl);
      const eventHtml = await fetchRainworxHtml(eventUrlAbs);
      rainworxEventMeta = parseRainworxEventPage(eventHtml, eventUrlAbs);
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
      const scraped = await scrapeEventLots({
        eventPageUrl: body.eventUrl,
        patente: body.patente,
        ...(addNewLotsFromEvent || syncGroupExclusive || assignNewLotsAuctionId || !matchList || matchList.length === 0
          ? { fetchAllPages: true }
          : { matchPatentes: matchList, fetchAllPages: false }),
        maxLots:
          body.maxLots ??
          (addNewLotsFromEvent || syncGroupExclusive || assignNewLotsAuctionId ? 500 : matchList && matchList.length > 0 ? 160 : 80),
        delayMs: body.delayMs ?? 250,
      });
      items = scraped.items;
      rainworxCollectionMeta = scraped.collectionMeta;
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
    const previousConfig = load.config;
    let config = previousConfig;
    const applied = new Set<string>();
    const skipped: { reason: string; lotId?: string }[] = [];
    const updatedPatentes = new Set<string>();
    const newPatentes = new Set<string>();
    const removedFromGroup = new Set<string>();
    let photosPreserved = 0;

    const groupPatenteSet = assignNewLotsAuctionId
      ? collectPatentesAssignedToAuction(previousConfig, assignNewLotsAuctionId)
      : new Set(
          (body.matchInventoryPatentes ?? []).map((p) => normalizePatenteKey(p)).filter(Boolean),
        );

    const targetLane: CommercialLane | undefined = assignNewLotsAuctionId
      ? resolveCommercialLaneForAuction(previousConfig, assignNewLotsAuctionId)
      : undefined;

    for (let i = 0; i < mapped.length; i++) {
      const row = mapped[i];
      if (!row.vehicleKey) {
        skipped.push({ reason: "Sin patente en ficha Rainworx", lotId: row.scraped.lotId });
        continue;
      }

      const isExistingInGroup = groupPatenteSet.has(row.vehicleKey);
      const isNewFromEvent =
        Boolean(addNewLotsFromEvent || syncGroupExclusive) &&
        assignNewLotsAuctionId &&
        !isExistingInGroup;

      if (assignNewLotsAuctionId && !isExistingInGroup && !addNewLotsFromEvent) {
        continue;
      }

      const rowMerge: RainworxEditorMergeMode = isNewFromEvent ? "rainworx_wins" : editorMerge;

      const keysToWrite = new Set<string>();
      if (assignNewLotsAuctionId) {
        if (isExistingInGroup) {
          for (const k of resolveVehicleKeysForAuctionPatente(
            config,
            assignNewLotsAuctionId,
            row.vehicleKey,
          )) {
            keysToWrite.add(k);
          }
        } else {
          keysToWrite.add(row.vehicleKey);
        }
      } else {
        keysToWrite.add(row.vehicleKey);
        for (const [k, v] of Object.entries(config.vehicleDetails)) {
          if (normalizePatenteKey(v.patente) === row.vehicleKey) keysToWrite.add(k);
        }
      }

      const catalogId = body.catalogItemIds?.[i]?.trim();
      if (catalogId && !assignNewLotsAuctionId) keysToWrite.add(catalogId);

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

    if (assignNewLotsAuctionId && rainworxEventMeta?.title) {
      config = {
        ...config,
        upcomingAuctions: (config.upcomingAuctions ?? []).map((auction) =>
          auction.id === assignNewLotsAuctionId
            ? { ...auction, name: rainworxEventMeta.title! }
            : auction,
        ),
      };
    }

    const rainworxPatenteList = mapped
      .map((row) => row.vehicleKey)
      .filter((patente): patente is string => Boolean(patente));

    const expectedFromBadges = rainworxCollectionMeta?.expectedFromBadges;
    const lotUrlsFound = rainworxCollectionMeta?.lotUrlsFound;
    if (
      expectedFromBadges != null &&
      lotUrlsFound != null &&
      expectedFromBadges > 0 &&
      lotUrlsFound !== expectedFromBadges
    ) {
      skipped.push({
        reason: `Rainworx indica ${expectedFromBadges} lote(s) activo(s) en categorías; se leyeron ${lotUrlsFound} URL(s) de lote.`,
      });
    }

    if (syncGroupExclusive && assignNewLotsAuctionId && rainworxPatenteList.length > 0 && targetLane) {
      for (const patente of groupPatenteSet) {
        if (rainworxPatenteList.includes(patente)) continue;
        config = removePatentFromAuctionAssignment(config, assignNewLotsAuctionId, patente);
        removedFromGroup.add(patente);
      }

      const assignment = assignPatentesToTargetAuction(
        config,
        addNewLotsFromEvent
          ? rainworxPatenteList
          : rainworxPatenteList.filter((patente) => groupPatenteSet.has(patente)),
        {
          lane: targetLane,
          auctionId: assignNewLotsAuctionId,
        },
      );
      config = {
        ...config,
        sectionVehicleIds: assignment.sectionVehicleIds,
        vehicleUpcomingAuctionIds: assignment.vehicleUpcomingAuctionIds,
      };
      for (const patente of rainworxPatenteList) {
        if (groupPatenteSet.has(patente)) updatedPatentes.add(patente);
        else newPatentes.add(patente);
      }
    } else if (addNewLotsFromEvent && assignNewLotsAuctionId && newPatentes.size > 0 && targetLane) {
      const assignment = assignPatentesToTargetAuction(config, [...newPatentes], {
        lane: targetLane,
        auctionId: assignNewLotsAuctionId,
      });
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
    const removals = assignNewLotsAuctionId
      ? findRemovedVehicleAssignmentsForAuction(
          previousConfig,
          normalizedConfig,
          assignNewLotsAuctionId,
        )
      : [];
    const removalResult = await deleteRemateItemsForRemovedAssignments(removals, normalizedConfig);
    let configForSync = normalizedConfig;

    let inventarioHydration: Awaited<ReturnType<typeof hydrateRainworxPatentsInInventario>> | undefined;
    if (assignNewLotsAuctionId && rainworxPatenteList.length > 0) {
      const estadoRetiro =
        assignNewLotsEventType === "venta_directa"
          ? ESTADO_RETIRO_VENTA_DIRECTA
          : ESTADO_RETIRO_REMATE;
      const hydrateEntries = rainworxPatenteList
        .map((patente) => {
          const rainworxDetails =
            configForSync.vehicleDetails?.[patente] ??
            mapped.find((row) => row.vehicleKey === patente)?.details;
          if (!rainworxDetails) return null;
          return { patente, rainworxDetails };
        })
        .filter(
          (entry): entry is { patente: string; rainworxDetails: (typeof mapped)[number]["details"] } =>
            entry != null,
        );

      inventarioHydration = await hydrateRainworxPatentsInInventario(hydrateEntries, {
        estadoRetiro,
        allowExternalApisForNew: true,
      });

      if (Object.keys(inventarioHydration.mergedVehicleDetails).length > 0) {
        configForSync = {
          ...configForSync,
          vehicleDetails: {
            ...configForSync.vehicleDetails,
            ...inventarioHydration.mergedVehicleDetails,
          },
        };
        const hydratedSave = await saveEditorConfig(configForSync, session.email);
        if (hydratedSave.ok) {
          configForSync = hydratedSave.normalizedConfig ?? configForSync;
        }
      }
    }

    const sync = await syncEditorConfigToSharedTablesWithOptions(
      configForSync,
      assignNewLotsAuctionId ? { onlyAuctionIds: [assignNewLotsAuctionId] } : {},
    );
    revalidateCatalogSurfaces();

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
        removedFromGroup: [...removedFromGroup],
        photosPreserved,
        rainworxEventTitle: rainworxEventMeta?.title,
        rainworxLotsRead: items.length,
        rainworxPatentesResolved: rainworxPatenteList.length,
        rainworxLotUrlsFound: lotUrlsFound,
        rainworxExpectedFromBadges: expectedFromBadges,
        renamedAuctionId:
          assignNewLotsAuctionId && rainworxEventMeta?.title ? assignNewLotsAuctionId : undefined,
        assignedAuctionId: assignNewLotsAuctionId && newPatentes.size > 0 ? assignNewLotsAuctionId : undefined,
        removedFromRemateItems: removalResult.deleted,
        inventarioHydration: inventarioHydration
          ? {
              imported: inventarioHydration.imported,
              enriched: inventarioHydration.enriched,
              rainworxOnly: inventarioHydration.rainworxOnly,
              failed: inventarioHydration.failed,
              rateLimited: inventarioHydration.rateLimited,
            }
          : undefined,
      },
      sync,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return Response.json({ error: message }, { status: 502 });
  }
}
