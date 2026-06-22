import { DEFAULT_VENTA_DIRECTA_EVENT_ID } from "@/lib/catalog-shared-constants";
import { removeVehicleFromCatalogEvent } from "@/lib/catalog-remove-vehicle-from-event";
import { reconcileSharedPlatforms } from "@/lib/catalog-shared-reconcile";
import { recordSharedSyncDlqEntries } from "@/lib/catalog-sync-dlq";
import {
  enqueueCatalogSyncOutbox,
  markCatalogSyncOutboxDone,
} from "@/lib/catalog-sync-outbox";
import { getEditorConfig, saveEditorConfig } from "@/lib/editor-config";
import { revalidateCatalogSurfaces } from "@/lib/revalidate-catalog";
import type { CatalogSyncEvent, CatalogSyncEventResult } from "@/types/catalog-sync-contract";
import { createClient } from "@supabase/supabase-js";

const REMATES_TABLE = process.env.CATALOG_SYNC_REMATES_TABLE ?? "remates";

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normalizePatente(value?: string | null): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "");
}

async function readConfigVersion(): Promise<number | undefined> {
  const supabase = getServerSupabase();
  if (!supabase) return undefined;
  const { data } = await supabase
    .from(process.env.CATALOG_EDITOR_TABLE ?? "catalogo_editor_config")
    .select("config_version")
    .eq("id", "global")
    .maybeSingle();
  const version = Number((data as { config_version?: number } | null)?.config_version ?? 0);
  return Number.isFinite(version) ? version : undefined;
}

async function handleVisibilityChanged(
  remateId: string,
  visible: boolean,
  updatedBy: string,
): Promise<CatalogSyncEventResult> {
  const loaded = await getEditorConfig();
  const hidden = new Set(loaded.config.hiddenCategoryIds ?? []);
  const auctionKey = `auction:${remateId}`;

  if (visible) {
    hidden.delete(auctionKey);
    if (remateId === DEFAULT_VENTA_DIRECTA_EVENT_ID) {
      hidden.delete("section:ventas-directas");
    }
  } else {
    hidden.add(auctionKey);
    if (remateId === DEFAULT_VENTA_DIRECTA_EVENT_ID) {
      hidden.add("section:ventas-directas");
    }
  }

  const saved = await saveEditorConfig(
    { ...loaded.config, hiddenCategoryIds: Array.from(hidden) },
    updatedBy,
  );
  if (!saved.ok) {
    return {
      ok: false,
      eventType: "visibility-changed",
      error: saved.error ?? "No se pudo guardar visibilidad.",
    };
  }

  const supabase = getServerSupabase();
  if (supabase) {
    await supabase
      .from(REMATES_TABLE)
      .update({ estado: visible ? "abierto" : "cerrado" })
      .eq("id", remateId);
  }

  const reconcile = await reconcileSharedPlatforms(updatedBy);
  revalidateCatalogSurfaces();

  return {
    ok: true,
    eventType: "visibility-changed",
    revalidated: true,
    configVersion: await readConfigVersion(),
    details: {
      remateId,
      visible,
      sync: reconcile.sync,
    },
  };
}

async function handleRemoveVehicle(
  remateId: string,
  patentes: string[],
  updatedBy: string,
): Promise<CatalogSyncEventResult> {
  const results: Array<{ patente: string; ok: boolean; removedKeys: string[] }> = [];
  for (const patente of patentes) {
    const removed = await removeVehicleFromCatalogEvent(remateId, patente, updatedBy);
    results.push({ patente, ok: removed.ok, removedKeys: removed.removedKeys });
    if (!removed.ok && removed.error) {
      void recordSharedSyncDlqEntries([removed.error], {
        source: updatedBy,
        skippedCount: 1,
      });
    }
  }
  revalidateCatalogSurfaces();
  const ok = results.every((row) => row.ok);
  return {
    ok,
    eventType: "remove-vehicle",
    revalidated: true,
    configVersion: await readConfigVersion(),
    details: { results },
    error: ok ? undefined : "Una o más patentes no se pudieron quitar.",
  };
}

export async function handleCatalogSyncEvent(
  event: CatalogSyncEvent,
  updatedBy = "sync@catalogo.vedisa",
): Promise<CatalogSyncEventResult> {
  try {
    let result: CatalogSyncEventResult;

    switch (event.type) {
      case "reconcile": {
        const reconcile = await reconcileSharedPlatforms(event.source ?? updatedBy);
        revalidateCatalogSurfaces();
        result = {
          ok: true,
          eventType: "reconcile",
          revalidated: true,
          configVersion: await readConfigVersion(),
          details: { sync: reconcile.sync },
        };
        break;
      }
      case "visibility-changed": {
        const remateId = String(event.remateId ?? "").trim();
        if (!remateId) {
          result = {
            ok: false,
            eventType: "visibility-changed",
            error: "Falta remateId.",
          };
          break;
        }
        result = await handleVisibilityChanged(remateId, Boolean(event.visible), updatedBy);
        break;
      }
      case "remove-vehicle": {
        const remateId = String(event.remateId ?? "").trim();
        const patentes = [
          ...new Set(
            [event.patente, ...(event.patentes ?? [])]
              .map((value) => normalizePatente(value))
              .filter(Boolean),
          ),
        ];
        if (!remateId || patentes.length === 0) {
          result = {
            ok: false,
            eventType: "remove-vehicle",
            error: "Faltan remateId o patentes.",
          };
          break;
        }
        result = await handleRemoveVehicle(remateId, patentes, updatedBy);
        break;
      }
      default: {
        result = {
          ok: false,
          eventType: "reconcile",
          error: "Tipo de evento no soportado.",
        };
      }
    }

    if (result.ok && event.idempotencyKey) {
      await markCatalogSyncOutboxDone(event.idempotencyKey);
    }
    if (!result.ok) {
      await enqueueCatalogSyncOutbox(event, result.error ?? "Falló sync", updatedBy);
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falló el evento de sync.";
    await enqueueCatalogSyncOutbox(event, message, updatedBy);
    void recordSharedSyncDlqEntries([message], { source: updatedBy, skippedCount: 1 });
    return {
      ok: false,
      eventType: event.type,
      error: message,
    };
  }
}
