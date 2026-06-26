import { getAuctionCommercialEventType } from "@/lib/commercial-category-exclusivity";
import type { CommercialLane } from "@/lib/commercial-category-exclusivity";
import { normalizePatenteKey } from "@/lib/rainworx-to-editor";
import type { EditorConfig } from "@/types/editor";

function normalizePatent(value?: string | null): string {
  return normalizePatenteKey(value ?? "");
}

/** Patentes actualmente asignadas a un remate/venta directa concreta. */
export function collectPatentesAssignedToAuction(
  config: EditorConfig,
  auctionId: string,
): Set<string> {
  const patentes = new Set<string>();
  for (const [vehicleKey, assignedAuctionId] of Object.entries(config.vehicleUpcomingAuctionIds ?? {})) {
    if (assignedAuctionId !== auctionId) continue;
    const fromDetails = normalizePatent(config.vehicleDetails?.[vehicleKey]?.patente);
    if (fromDetails) patentes.add(fromDetails);
    const fromKey = normalizePatent(vehicleKey);
    if (/^[A-Z0-9]{5,10}$/.test(fromKey)) patentes.add(fromKey);
  }
  return patentes;
}

/** Claves de editor que pertenecen a una patente dentro de un remate específico. */
export function resolveVehicleKeysForAuctionPatente(
  config: EditorConfig,
  auctionId: string,
  patente: string,
): Set<string> {
  const patenteNorm = normalizePatent(patente);
  if (!patenteNorm) return new Set();

  const keys = new Set<string>();
  for (const [vehicleKey, assignedAuctionId] of Object.entries(config.vehicleUpcomingAuctionIds ?? {})) {
    if (assignedAuctionId !== auctionId) continue;
    if (normalizePatent(vehicleKey) === patenteNorm) keys.add(vehicleKey);
    const detailPatente = normalizePatent(config.vehicleDetails?.[vehicleKey]?.patente);
    if (detailPatente === patenteNorm) keys.add(vehicleKey);
  }
  if (keys.size === 0) keys.add(patenteNorm);
  return keys;
}

export function resolveCommercialLaneForAuction(
  config: EditorConfig,
  auctionId: string,
): CommercialLane {
  const auction = (config.upcomingAuctions ?? []).find((entry) => entry.id === auctionId);
  return getAuctionCommercialEventType(auction ?? { id: auctionId, name: "", date: "" }) ===
    "venta_directa"
    ? "ventas-directas"
    : "proximos-remates";
}

/**
 * Asigna patentes al remate/VD indicado con exclusividad comercial por patente.
 * No modifica otros eventos excepto reasignar la misma patente al target.
 */
export function assignPatentesToTargetAuction(
  prev: EditorConfig,
  patentes: string[],
  target: { lane: CommercialLane; auctionId: string },
): Pick<EditorConfig, "sectionVehicleIds" | "vehicleUpcomingAuctionIds"> {
  const proxSet = new Set(prev.sectionVehicleIds["proximos-remates"] ?? []);
  const vdSet = new Set(prev.sectionVehicleIds["ventas-directas"] ?? []);
  const nextAssignments = { ...prev.vehicleUpcomingAuctionIds };

  for (const rawPatente of patentes) {
    const patente = normalizePatent(rawPatente);
    if (!/^[A-Z0-9]{5,10}$/.test(patente)) continue;

    const keysForPatente = new Set<string>([patente]);
    for (const [vehicleKey, assignedAuctionId] of Object.entries(prev.vehicleUpcomingAuctionIds ?? {})) {
      const detailPatente = normalizePatent(prev.vehicleDetails?.[vehicleKey]?.patente);
      if (normalizePatent(vehicleKey) === patente || detailPatente === patente) {
        keysForPatente.add(vehicleKey);
        if (assignedAuctionId && assignedAuctionId !== target.auctionId) {
          delete nextAssignments[vehicleKey];
        }
      }
    }

    for (const vehicleKey of keysForPatente) {
      proxSet.delete(vehicleKey);
      vdSet.delete(vehicleKey);
      nextAssignments[vehicleKey] = target.auctionId;
      if (target.lane === "proximos-remates") proxSet.add(vehicleKey);
      else vdSet.add(vehicleKey);
    }
  }

  return {
    vehicleUpcomingAuctionIds: nextAssignments,
    sectionVehicleIds: {
      ...prev.sectionVehicleIds,
      "proximos-remates": [...proxSet],
      "ventas-directas": [...vdSet],
    },
  };
}
