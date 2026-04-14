import { createClient } from "@supabase/supabase-js";
import { DEFAULT_EDITOR_CONFIG, type EditorConfig } from "@/types/editor";

const EDITOR_TABLE = process.env.CATALOG_EDITOR_TABLE ?? "catalogo_editor_config";
const EDITOR_ROW_ID = "global";

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normalizeConfig(config?: Partial<EditorConfig> | null): EditorConfig {
  return {
    sectionVehicleIds: {
      "proximos-remates": config?.sectionVehicleIds?.["proximos-remates"] ?? [],
      "ventas-directas": config?.sectionVehicleIds?.["ventas-directas"] ?? [],
      novedades: config?.sectionVehicleIds?.novedades ?? [],
      catalogo: config?.sectionVehicleIds?.catalogo ?? [],
    },
    hiddenVehicleIds: config?.hiddenVehicleIds ?? [],
    vehiclePrices: config?.vehiclePrices ?? {},
  };
}

export async function getEditorConfig(): Promise<EditorConfig> {
  const supabase = getServerSupabase();
  if (!supabase) return DEFAULT_EDITOR_CONFIG;

  const { data, error } = await supabase
    .from(EDITOR_TABLE)
    .select("config")
    .eq("id", EDITOR_ROW_ID)
    .maybeSingle();

  if (error || !data) return DEFAULT_EDITOR_CONFIG;
  return normalizeConfig((data as { config?: Partial<EditorConfig> }).config ?? null);
}

export async function saveEditorConfig(config: EditorConfig, updatedBy: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = getServerSupabase();
  if (!supabase) {
    return { ok: false, error: "Falta SUPABASE_SERVICE_ROLE_KEY o URL para guardar configuración." };
  }

  const payload = {
    id: EDITOR_ROW_ID,
    config: normalizeConfig(config),
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from(EDITOR_TABLE).upsert(payload, { onConflict: "id" });
  if (!error) return { ok: true };

  return {
    ok: false,
    error:
      `No se pudo guardar la configuración en la tabla '${EDITOR_TABLE}'. ` +
      "Crea la tabla en Supabase (id text pk, config jsonb, updated_by text, updated_at timestamptz).",
  };
}
