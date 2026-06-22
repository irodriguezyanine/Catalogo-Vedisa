import { createClient } from "@supabase/supabase-js";

const INVENTARIO_TABLE = process.env.CATALOG_SYNC_INVENTARIO_TABLE ?? "inventario";

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function normalizePatenteInventario(value?: string | null): string {
  return String(value ?? "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "");
}

/** Al quitar un vehículo de un remate, deja de estar en bodega-a-remate en inventario compartido. */
export async function revertInventarioTrasQuitarDeRemate(
  patente: string,
): Promise<{ updated: number; error?: string }> {
  const supabase = getServerSupabase();
  const patenteNorm = normalizePatenteInventario(patente);
  if (!supabase || !patenteNorm) {
    return { updated: 0, error: "Sin conexión o patente inválida." };
  }

  const { data: rows, error: readError } = await supabase
    .from(INVENTARIO_TABLE)
    .select("id, patente, estado_retiro")
    .ilike("patente", patenteNorm);

  if (readError) {
    return { updated: 0, error: readError.message };
  }

  const ids = (rows ?? [])
    .filter((row) => normalizePatenteInventario(row.patente) === patenteNorm)
    .filter((row) => String(row.estado_retiro ?? "").toLowerCase() === "en_bodega_a_remate")
    .map((row) => String(row.id));

  if (!ids.length) return { updated: 0 };

  const { error: updateError } = await supabase
    .from(INVENTARIO_TABLE)
    .update({ estado_retiro: "en_bodega" })
    .in("id", ids);

  if (updateError) {
    return { updated: 0, error: updateError.message };
  }

  return { updated: ids.length };
}
