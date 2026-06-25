import { createClient } from "@supabase/supabase-js";
import { getEditorConfig, saveEditorConfig } from "@/lib/editor-config";
import { isGlo3dCatalogImageUrl } from "@/lib/catalog-sync-images";
import type { EditorConfig, EditorVehicleDetails } from "@/types/editor";

const INVENTARIO_TABLE = process.env.CATALOG_SUPABASE_TABLE ?? "inventario";

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normalizePatent(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "").replace(/-/g, "");
}

function vehicleDetailKeys(patente: string, vehicleKey?: string, itemId?: string): string[] {
  const keys = new Set<string>();
  const pat = normalizePatent(patente);
  if (pat) keys.add(pat);
  if (vehicleKey?.trim()) keys.add(vehicleKey.trim());
  if (itemId?.trim()) keys.add(itemId.trim());
  return Array.from(keys);
}

export function patchEditorConfigVehicleDetails(
  config: EditorConfig,
  patente: string,
  details: EditorVehicleDetails,
  opts?: { vehicleKey?: string; itemId?: string },
): EditorConfig {
  const keys = vehicleDetailKeys(patente, opts?.vehicleKey, opts?.itemId);
  const nextDetails = { ...(config.vehicleDetails ?? {}) };
  for (const key of keys) {
    const existing = nextDetails[key];
    nextDetails[key] = existing
      ? {
          ...existing,
          ...details,
          thumbnail:
            details.thumbnail?.startsWith("http") &&
            (isGlo3dCatalogImageUrl(details.thumbnail) ||
              !existing.thumbnail?.startsWith("http") ||
              !isGlo3dCatalogImageUrl(existing.thumbnail))
              ? details.thumbnail
              : existing.thumbnail ?? details.thumbnail,
          view3dUrl: details.view3dUrl?.includes("glo3d")
            ? details.view3dUrl
            : existing.view3dUrl ?? details.view3dUrl,
        }
      : details;
  }
  return { ...config, vehicleDetails: nextDetails };
}

async function persistInventarioMediaFromSync(
  patente: string,
  details: EditorVehicleDetails,
): Promise<boolean> {
  const supabase = getServerSupabase();
  if (!supabase) return false;

  const pat = normalizePatent(patente);
  if (!pat) return false;

  const patch: Record<string, unknown> = {};
  const thumb = details.thumbnail?.trim();
  if (thumb?.startsWith("http")) {
    patch.imagenes = [thumb];
    patch.thumbnail = thumb;
  }
  if (details.view3dUrl?.includes("glo3d")) {
    patch.glo3d_url = details.view3dUrl;
    patch.url_3d = details.view3dUrl;
  }
  if (Object.keys(patch).length === 0) return false;

  const { error } = await supabase.from(INVENTARIO_TABLE).update(patch).eq("patente", pat);
  return !error;
}

export type PersistVehicleSyncSnapshotResult = {
  ok: boolean;
  error?: string;
  persistedAt?: string;
  inventarioUpdated?: boolean;
};

/** Guarda atómicamente la ficha sincronizada de un vehículo (read-merge-write en Supabase). */
export async function persistVehicleSyncSnapshot(opts: {
  patente: string;
  vehicleDetails: EditorVehicleDetails;
  vehicleKey?: string;
  itemId?: string;
  updatedBy: string;
  baseConfig?: EditorConfig;
}): Promise<PersistVehicleSyncSnapshotResult> {
  const patente = normalizePatent(opts.patente);
  if (!patente) {
    return { ok: false, error: "Patente inválida." };
  }

  const loaded = opts.baseConfig
    ? { config: opts.baseConfig, persisted: true }
    : await getEditorConfig();

  const nextConfig = patchEditorConfigVehicleDetails(loaded.config, patente, opts.vehicleDetails, {
    vehicleKey: opts.vehicleKey,
    itemId: opts.itemId,
  });

  const saved = await saveEditorConfig(nextConfig, opts.updatedBy);
  if (!saved.ok) {
    return { ok: false, error: saved.error ?? "No se pudo guardar vehicleDetails." };
  }

  const inventarioUpdated = await persistInventarioMediaFromSync(patente, opts.vehicleDetails);
  const persistedAt = new Date().toISOString();

  return { ok: true, persistedAt, inventarioUpdated };
}

/** Lectura directa de vehicleDetails por patente (diagnóstico). */
export async function readVehicleDetailsFromStore(
  patente: string,
): Promise<EditorVehicleDetails | null> {
  const pat = normalizePatent(patente);
  if (!pat) return null;
  const { config } = await getEditorConfig();
  return config.vehicleDetails?.[pat] ?? null;
}
