/** Contrato compartido Tasaciones ↔ Catálogo (mantener alineado con TasacionesVedisa-1). */

export type CatalogSyncEventType = "reconcile" | "remove-vehicle" | "visibility-changed";

export type CatalogSyncEvent =
  | { type: "reconcile"; source?: string; idempotencyKey?: string }
  | {
      type: "remove-vehicle";
      remateId: string;
      patente?: string;
      patentes?: string[];
      idempotencyKey?: string;
    }
  | {
      type: "visibility-changed";
      remateId: string;
      visible: boolean;
      source?: string;
      idempotencyKey?: string;
    };

export type CatalogSyncEventResult = {
  ok: boolean;
  eventType: CatalogSyncEventType;
  error?: string;
  revalidated?: boolean;
  configVersion?: number;
  details?: Record<string, unknown>;
};
