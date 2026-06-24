"use client";

import type { CatalogItem } from "@/types/catalog";
import type { EditorConfig } from "@/types/editor";
import {
  getCatalogItemModel,
  getCatalogItemPatent,
  resolveVehicleThumbnailSrc,
  vehicleNeedsQuickSync,
} from "@/lib/vehicle-sync-helpers";

export function VehicleSyncIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="currentColor" aria-hidden="true">
      <path d="M4.5 3A1.5 1.5 0 0 0 3 4.5v2.879a1 1 0 0 0 .293.707l2.122 2.122a1 1 0 0 0 1.414-1.414L5.414 7.5H7.5A1.5 1.5 0 0 0 9 6V4.5A1.5 1.5 0 0 0 7.5 3h-3ZM13 3A1.5 1.5 0 0 0 11.5 4.5V6a1.5 1.5 0 0 0 1.5 1.5h2.086l-1.415 1.415a1 1 0 1 0 1.414 1.414l2.122-2.122A1 1 0 0 0 17 7.379V4.5A1.5 1.5 0 0 0 15.5 3H13Zm-8 10A1.5 1.5 0 0 0 3.5 14.5V17a1.5 1.5 0 0 0 1.5 1.5h3A1.5 1.5 0 0 0 9 17v-1.5A1.5 1.5 0 0 0 7.5 14H5.414l1.415 1.415a1 1 0 0 1-1.414 1.414L3.293 14.707A1 1 0 0 1 3 14V11.5A1.5 1.5 0 0 1 4.5 10h.5v1.5A1.5 1.5 0 0 1 6.5 13H7v1.5A1.5 1.5 0 0 1 5.5 16h-2Zm11-1.5A1.5 1.5 0 0 0 15 14.5V17a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 17v-1.5a1.5 1.5 0 0 1 1.5-1.5h2.086l-1.415-1.415a1 1 0 1 1 1.414-1.414l2.122 2.122a1 1 0 0 1 .293.707V17a1.5 1.5 0 0 0 1.5 1.5h.5v-1.5A1.5 1.5 0 0 0 15.5 13H15v-1.5A1.5 1.5 0 0 0 13.5 10h2Z" />
    </svg>
  );
}

export function VehicleListThumbnailWithSync({
  item,
  vehicleKey,
  editorConfig,
  onSync,
  syncingVehicleKey,
  glo3dCooldownLabel,
  isStaleTitle,
  className = "relative mx-auto h-12 w-20 overflow-hidden rounded-md border border-slate-200 bg-slate-100",
}: {
  item: CatalogItem;
  vehicleKey: string;
  editorConfig: EditorConfig;
  onSync: (key: string) => void;
  syncingVehicleKey: string | null;
  glo3dCooldownLabel?: string;
  isStaleTitle?: (title: string, patente: string) => boolean;
  className?: string;
}) {
  const needsQuickSync = vehicleNeedsQuickSync(item, vehicleKey, editorConfig, isStaleTitle);
  const isSyncing = syncingVehicleKey === vehicleKey;
  const patente = getCatalogItemPatent(item);
  const syncTitle = "Sincronizar Glo3D + Autored";

  return (
    <div className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={resolveVehicleThumbnailSrc(item)}
        alt={`Miniatura ${getCatalogItemModel(item)}`}
        className="h-full w-full object-cover"
        loading="lazy"
        onError={(event) => {
          event.currentTarget.src = "/placeholder-car.svg";
        }}
      />
      {needsQuickSync ? (
        <button
          type="button"
          onClick={() => onSync(vehicleKey)}
          disabled={Boolean(syncingVehicleKey)}
          className="ui-focus absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-slate-900/50 text-white transition hover:bg-cyan-900/65 disabled:cursor-wait"
          aria-label={`Sincronizar ${patente} con Glo3D y Autored`}
          title={syncTitle}
        >
          {isSyncing ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <VehicleSyncIcon />
          )}
          <span className="text-[9px] font-semibold leading-none">
            {isSyncing ? "Sync…" : "Sync"}
          </span>
        </button>
      ) : null}
    </div>
  );
}

export function VehicleQuickSyncButton({
  item,
  vehicleKey,
  editorConfig,
  onSync,
  syncingVehicleKey,
  glo3dCooldownLabel,
  isStaleTitle,
  variant = "pill",
}: {
  item: CatalogItem;
  vehicleKey: string;
  editorConfig: EditorConfig;
  onSync: (key: string) => void;
  syncingVehicleKey: string | null;
  glo3dCooldownLabel?: string;
  isStaleTitle?: (title: string, patente: string) => boolean;
  variant?: "pill" | "icon";
}) {
  if (!vehicleNeedsQuickSync(item, vehicleKey, editorConfig, isStaleTitle)) return null;
  const isSyncing = syncingVehicleKey === vehicleKey;
  const patente = getCatalogItemPatent(item);
  const title = "Sincronizar Glo3D + Autored";

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={() => onSync(vehicleKey)}
        disabled={Boolean(syncingVehicleKey)}
        className="ui-focus inline-flex h-7 w-7 items-center justify-center rounded border border-amber-300 bg-amber-50 text-amber-700 transition hover:bg-amber-100 disabled:cursor-wait disabled:opacity-60"
        aria-label={`Sincronizar ${patente}`}
        title={title}
      >
        {isSyncing ? (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-300 border-t-amber-700" />
        ) : (
          <VehicleSyncIcon className="h-4 w-4" />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSync(vehicleKey)}
      disabled={Boolean(syncingVehicleKey)}
      className="ui-focus inline-flex items-center gap-1 rounded border border-cyan-300 bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-cyan-800 disabled:opacity-60"
      title={title}
    >
      {isSyncing ? "Sync…" : "Sync Glo3D"}
    </button>
  );
}
