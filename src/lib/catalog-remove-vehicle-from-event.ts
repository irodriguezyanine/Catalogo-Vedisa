import { DEFAULT_VENTA_DIRECTA_EVENT_ID } from "@/lib/catalog-shared-constants";
import { revertInventarioTrasQuitarDeEvento } from "@/lib/catalog-inventory-remate-sync";
import {
  deleteRemateItemsForRemovedAssignments,
  findRemovedVehicleAssignments,
} from "@/lib/catalog-shared-sync";
import { getEditorConfig, saveEditorConfig } from "@/lib/editor-config";
import type { EditorConfig } from "@/types/editor";

function normalizePatentKey(value?: string | null): string {
  return String(value ?? "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "");
}

function resolveVehicleKeysForPatent(config: EditorConfig, patenteNorm: string): string[] {
  const keys = new Set<string>();
  if (!patenteNorm) return [];

  keys.add(patenteNorm);

  for (const [vehicleKey, assignedAuctionId] of Object.entries(config.vehicleUpcomingAuctionIds ?? {})) {
    if (normalizePatentKey(vehicleKey) === patenteNorm) keys.add(vehicleKey);
    const detailPatente = normalizePatentKey(config.vehicleDetails?.[vehicleKey]?.patente);
    if (detailPatente === patenteNorm) keys.add(vehicleKey);
  }

  for (const sectionId of ["proximos-remates", "ventas-directas"] as const) {
    for (const vehicleKey of config.sectionVehicleIds?.[sectionId] ?? []) {
      if (normalizePatentKey(vehicleKey) === patenteNorm) keys.add(vehicleKey);
      const detailPatente = normalizePatentKey(config.vehicleDetails?.[vehicleKey]?.patente);
      if (detailPatente === patenteNorm) keys.add(vehicleKey);
    }
  }

  return [...keys];
}

function removePatentFromEditorConfig(
  config: EditorConfig,
  remateId: string,
  patenteNorm: string,
): EditorConfig {
  const vehicleKeys = resolveVehicleKeysForPatent(config, patenteNorm);
  const assignments = { ...(config.vehicleUpcomingAuctionIds ?? {}) };
  const sections = {
    ...config.sectionVehicleIds,
    "proximos-remates": [...(config.sectionVehicleIds?.["proximos-remates"] ?? [])],
    "ventas-directas": [...(config.sectionVehicleIds?.["ventas-directas"] ?? [])],
  };

  for (const vehicleKey of vehicleKeys) {
    if (assignments[vehicleKey] === remateId) delete assignments[vehicleKey];
    sections["proximos-remates"] = sections["proximos-remates"].filter((key) => key !== vehicleKey);
    sections["ventas-directas"] = sections["ventas-directas"].filter((key) => key !== vehicleKey);
  }

  return {
    ...config,
    vehicleUpcomingAuctionIds: assignments,
    sectionVehicleIds: sections,
  };
}

export async function removeVehicleFromCatalogEvent(
  remateId: string,
  patente: string,
  updatedBy = "tasaciones@vedisa",
): Promise<{ ok: boolean; removedKeys: string[]; error?: string }> {
  const patenteNorm = normalizePatentKey(patente);
  if (!remateId || !patenteNorm) {
    return { ok: false, removedKeys: [], error: "Remate o patente inválidos." };
  }

  const loaded = await getEditorConfig();
  const removedKeys = resolveVehicleKeysForPatent(loaded.config, patenteNorm);
  const previous = loaded.config;
  const next = removePatentFromEditorConfig(previous, remateId, patenteNorm);

  const saved = await saveEditorConfig(next, updatedBy);
  if (!saved.ok) {
    return { ok: false, removedKeys, error: saved.error ?? "No se pudo guardar la configuración." };
  }

  const removals = findRemovedVehicleAssignments(previous, saved.normalizedConfig ?? next);
  await deleteRemateItemsForRemovedAssignments(removals, saved.normalizedConfig ?? next);
  const eventType = remateId === DEFAULT_VENTA_DIRECTA_EVENT_ID ? "venta_directa" : "remate";
  await revertInventarioTrasQuitarDeEvento(patente, eventType);

  return { ok: true, removedKeys };
}
