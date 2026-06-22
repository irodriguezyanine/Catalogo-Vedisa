import type { EditorConfig, UpcomingAuction } from "@/types/editor";

export type CommercialLane = "proximos-remates" | "ventas-directas";

function detectCommercialEventType(value?: string | null): "remate" | "venta_directa" {
  const normalized = String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
  if (
    normalized.includes("ventadirecta") ||
    normalized.includes("vtadirecta") ||
    normalized.includes("vtdirecta") ||
    normalized.includes("ventadir")
  ) {
    return "venta_directa";
  }
  return "remate";
}

export function getAuctionCommercialEventType(
  auction: Pick<UpcomingAuction, "id" | "name" | "date" | "eventType"> | undefined,
): "remate" | "venta_directa" {
  if (auction?.eventType === "venta_directa" || auction?.eventType === "remate") {
    return auction.eventType;
  }
  return detectCommercialEventType(auction?.name);
}

function normalizeInventoryEstado(value?: string | null): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function resolveVehicleCommercialLane(
  vehicleKey: string,
  config: EditorConfig,
  inventoryEstadoRetiro?: string,
): CommercialLane | null {
  const assignedId = config.vehicleUpcomingAuctionIds?.[vehicleKey];
  if (assignedId) {
    const auction = (config.upcomingAuctions ?? []).find((entry) => entry.id === assignedId);
    return getAuctionCommercialEventType(auction ?? { id: assignedId, name: "", date: "" }) ===
      "venta_directa"
      ? "ventas-directas"
      : "proximos-remates";
  }

  const inRemate = (config.sectionVehicleIds?.["proximos-remates"] ?? []).includes(vehicleKey);
  const inVenta = (config.sectionVehicleIds?.["ventas-directas"] ?? []).includes(vehicleKey);
  if (inRemate && inVenta) {
    const estado = normalizeInventoryEstado(inventoryEstadoRetiro);
    return estado === "en_bodega_a_venta_directa" ? "ventas-directas" : "proximos-remates";
  }
  if (inVenta) return "ventas-directas";
  if (inRemate) return "proximos-remates";

  return null;
}

export function stripVehicleFromCommercialLane(
  sectionVehicleIds: EditorConfig["sectionVehicleIds"],
  vehicleKey: string,
  lane: CommercialLane,
): EditorConfig["sectionVehicleIds"] {
  const opposite: CommercialLane =
    lane === "proximos-remates" ? "ventas-directas" : "proximos-remates";
  return {
    ...sectionVehicleIds,
    [lane]: (sectionVehicleIds[lane] ?? []).filter((key) => key !== vehicleKey),
    [opposite]: (sectionVehicleIds[opposite] ?? []).filter((key) => key !== vehicleKey),
  };
}

export function applyExclusiveCommercialAssignment(
  prev: EditorConfig,
  vehicleKeys: string[],
  target: { lane: CommercialLane; auctionId?: string },
  auctions: UpcomingAuction[],
): Pick<EditorConfig, "sectionVehicleIds" | "vehicleUpcomingAuctionIds"> {
  const proxSet = new Set(prev.sectionVehicleIds["proximos-remates"] ?? []);
  const vdSet = new Set(prev.sectionVehicleIds["ventas-directas"] ?? []);
  const nextAssignments = { ...prev.vehicleUpcomingAuctionIds };

  for (const vehicleKey of vehicleKeys) {
    proxSet.delete(vehicleKey);
    vdSet.delete(vehicleKey);
    delete nextAssignments[vehicleKey];

    if (target.lane === "proximos-remates" && target.auctionId) {
      nextAssignments[vehicleKey] = target.auctionId;
      proxSet.add(vehicleKey);
      continue;
    }

    if (target.lane === "ventas-directas" && target.auctionId) {
      const auction = auctions.find((entry) => entry.id === target.auctionId);
      if (getAuctionCommercialEventType(auction ?? { id: target.auctionId, name: "", date: "" }) === "venta_directa") {
        nextAssignments[vehicleKey] = target.auctionId;
        vdSet.add(vehicleKey);
        continue;
      }
    }

    if (target.lane === "ventas-directas") {
      vdSet.add(vehicleKey);
    } else {
      proxSet.add(vehicleKey);
    }
  }

  return {
    vehicleUpcomingAuctionIds: nextAssignments,
    sectionVehicleIds: {
      ...prev.sectionVehicleIds,
      "proximos-remates": Array.from(proxSet),
      "ventas-directas": Array.from(vdSet),
    },
  };
}

export function enforceCommercialExclusivityInConfig(config: EditorConfig): EditorConfig {
  const proxSet = new Set(config.sectionVehicleIds["proximos-remates"] ?? []);
  const vdSet = new Set(config.sectionVehicleIds["ventas-directas"] ?? []);
  const nextAssignments = { ...config.vehicleUpcomingAuctionIds };

  const allKeys = new Set<string>([
    ...proxSet,
    ...vdSet,
    ...Object.keys(nextAssignments),
  ]);

  const nextProx = new Set<string>();
  const nextVd = new Set<string>();

  for (const key of allKeys) {
    const lane = resolveVehicleCommercialLane(key, {
      ...config,
      sectionVehicleIds: {
        ...config.sectionVehicleIds,
        "proximos-remates": Array.from(proxSet),
        "ventas-directas": Array.from(vdSet),
      },
      vehicleUpcomingAuctionIds: nextAssignments,
    });
    if (lane === "proximos-remates") {
      nextProx.add(key);
    } else if (lane === "ventas-directas") {
      nextVd.add(key);
    } else {
      delete nextAssignments[key];
    }
  }

  return {
    ...config,
    sectionVehicleIds: {
      ...config.sectionVehicleIds,
      "proximos-remates": Array.from(nextProx),
      "ventas-directas": Array.from(nextVd),
    },
    vehicleUpcomingAuctionIds: nextAssignments,
  };
}
