import type { EditorConfig } from "@/types/editor";

/**
 * Quita bloqueos de publicación (oculto / vendido) al re-asignar unidades a eventos o secciones activas.
 */
export function clearPublicationBlocksForVehicleKeys(
  config: Pick<EditorConfig, "hiddenVehicleIds" | "soldVehicleIds" | "soldVehicleHistory">,
  vehicleKeys: Iterable<string>,
): Pick<EditorConfig, "hiddenVehicleIds" | "soldVehicleIds" | "soldVehicleHistory"> {
  const blockedKeys = new Set<string>();
  for (const key of vehicleKeys) {
    const normalized = String(key ?? "").trim();
    if (normalized) blockedKeys.add(normalized);
  }

  if (blockedKeys.size === 0) {
    return {
      hiddenVehicleIds: config.hiddenVehicleIds ?? [],
      soldVehicleIds: config.soldVehicleIds ?? [],
      soldVehicleHistory: config.soldVehicleHistory ?? [],
    };
  }

  return {
    hiddenVehicleIds: (config.hiddenVehicleIds ?? []).filter((key) => !blockedKeys.has(key)),
    soldVehicleIds: (config.soldVehicleIds ?? []).filter((key) => !blockedKeys.has(key)),
    soldVehicleHistory: (config.soldVehicleHistory ?? []).filter(
      (entry) => !blockedKeys.has(entry.vehicleKey),
    ),
  };
}
