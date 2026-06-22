import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/admin-session";
import {
  extractRemateNumberFromLabel,
  resolveCanonicalRemateIdForSync,
  type SharedRemateLookupRow,
} from "@/lib/catalog-shared-remate-id";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normalizePatent(value?: string | null): string {
  return String(value ?? "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "");
}

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const session = verifyAdminSessionToken(token);
  if (!session.valid) {
    return Response.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const patente = normalizePatent(searchParams.get("patente") ?? "VHWC96");
  const remateLabel = searchParams.get("remate") ?? "REMATE 1085";

  const supabase = getServerSupabase();
  if (!supabase) {
    return Response.json({
      ok: false,
      error: "Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Catálogo.",
    });
  }

  const { data: remates, error: rematesError } = await supabase
    .from("remates")
    .select("id, numero_remate, numero_correlativo, descripcion")
    .limit(2000);

  if (rematesError) {
    return Response.json({ ok: false, error: rematesError.message }, { status: 500 });
  }

  const remateRows = (remates ?? []) as SharedRemateLookupRow[];
  const numero = extractRemateNumberFromLabel(remateLabel);
  const matchingRemates = numero
    ? remateRows.filter((row) => {
        const desc = String(row.descripcion ?? "").toUpperCase();
        return (
          row.numero_correlativo === Number(numero) ||
          desc.includes(`REMATE ${numero}`) ||
          desc.includes(`REMATE${numero}`)
        );
      })
    : [];

  const catalogAuctionId =
    matchingRemates.find((row) => row.descripcion?.toUpperCase().includes("REMATE"))?.id ??
    matchingRemates[0]?.id ??
    "";
  const canonicalRemateId = catalogAuctionId
    ? resolveCanonicalRemateIdForSync(catalogAuctionId, remateLabel, remateRows)
    : null;

  const remateIds = [...new Set([...matchingRemates.map((row) => row.id), canonicalRemateId].filter(Boolean))];

  const [{ data: itemsByPatente }, { data: exclusions }] = await Promise.all([
    supabase.from("remates_items").select("id, remate_id, patente, extra_fields").ilike("patente", patente),
    remateIds.length
      ? supabase
          .from("remates_items_exclusiones")
          .select("remate_id, patente_norm")
          .eq("patente_norm", patente)
          .in("remate_id", remateIds)
      : Promise.resolve({ data: [] as Array<{ remate_id: string; patente_norm: string }>, error: null }),
  ]);

  const itemsForCanonical =
    canonicalRemateId && patente
      ? await supabase
          .from("remates_items")
          .select("id, remate_id, patente, extra_fields")
          .eq("remate_id", canonicalRemateId)
          .ilike("patente", patente)
      : { data: [] };

  return Response.json({
    ok: true,
    env: {
      supabaseUrlConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL),
      serviceRoleConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      peerSyncUrlConfigured: Boolean(
        process.env.CATALOG_SHARED_SYNC_BASE_URL ?? process.env.CATALOG_SOURCE_API_URL,
      ),
    },
    query: { patente, remateLabel, numero },
    matchingRemates,
    canonicalRemateId,
    remateIdWouldRemap: Boolean(catalogAuctionId && canonicalRemateId && catalogAuctionId !== canonicalRemateId),
    itemsByPatente: itemsByPatente ?? [],
    itemsForCanonicalRemate: itemsForCanonical.data ?? [],
    exclusions: exclusions ?? [],
    hint:
      (exclusions ?? []).length > 0
        ? "La patente está en remates_items_exclusiones: Supabase borra el insert automáticamente. Vuelve a guardar tras el fix que limpia exclusiones."
        : itemsForCanonical.data?.length
          ? "El ítem existe en remates_items para el remate canónico. Tasaciones debería verlo al refrescar."
          : "No hay fila en remates_items para este remate/patente. Revisa remate_id y variables de Supabase en Catálogo.",
  });
}
