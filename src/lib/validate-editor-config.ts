import type { EditorConfig } from "@/types/editor";

const MAX_CONFIG_BYTES = 4_000_000;

export function validateEditorConfigPayload(config: unknown): { ok: true } | { ok: false; error: string } {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return { ok: false, error: "Configuración inválida." };
  }
  const record = config as Record<string, unknown>;
  if (!record.sectionVehicleIds || typeof record.sectionVehicleIds !== "object") {
    return { ok: false, error: "Falta sectionVehicleIds en la configuración." };
  }
  if (!record.homeLayout || typeof record.homeLayout !== "object") {
    return { ok: false, error: "Falta homeLayout en la configuración." };
  }
  try {
    const size = new TextEncoder().encode(JSON.stringify(config)).byteLength;
    if (size > MAX_CONFIG_BYTES) {
      return { ok: false, error: "La configuración supera el tamaño máximo permitido." };
    }
  } catch {
    return { ok: false, error: "No se pudo serializar la configuración." };
  }
  return { ok: true };
}

export function assertProductionSecrets(): void {
  if (process.env.NODE_ENV !== "production") return;
  const usingDefaultPassword =
    !process.env.ADMIN_EDITOR_PASSWORD?.trim() || !process.env.ADMIN_EDITOR_EMAIL?.trim();
  const weakSession =
    !process.env.ADMIN_EDITOR_SESSION_SECRET?.trim() ||
    process.env.ADMIN_EDITOR_SESSION_SECRET === "vedisa-editor-secret";
  if (usingDefaultPassword) {
    console.warn("[catalog] ADMIN_EDITOR_EMAIL/PASSWORD no configurados en producción.");
  }
  if (weakSession) {
    console.warn("[catalog] ADMIN_EDITOR_SESSION_SECRET débil o ausente en producción.");
  }
}

export type { EditorConfig };
