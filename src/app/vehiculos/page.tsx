import type { Metadata } from "next";
import { headers } from "next/headers";
import { CatalogVehiclesListClient } from "@/components/catalog-vehicles-list-client";
import { getCatalogFeed } from "@/lib/catalog";
import { getEditorConfig } from "@/lib/editor-config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Vehículos disponibles | Catálogo VEDISA REMATES",
  description:
    "Listado completo de vehículos disponibles en Catálogo Vedisa con precio, venta directa, remate y estado de siniestro.",
};

async function loadEditorConfig() {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (!host) return getEditorConfig();
    const protocol = h.get("x-forwarded-proto") ?? "https";
    const res = await fetch(`${protocol}://${host}/api/admin/editor-config`, {
      cache: "no-store",
    });
    if (!res.ok) return getEditorConfig();
    const payload = (await res.json()) as { config?: unknown };
    if (!payload.config) return getEditorConfig();
    return { config: payload.config as Awaited<ReturnType<typeof getEditorConfig>>["config"], persisted: true };
  } catch {
    return getEditorConfig();
  }
}

export default async function VehiclesPage() {
  const [feed, editorConfigResult] = await Promise.all([getCatalogFeed(), loadEditorConfig()]);
  return <CatalogVehiclesListClient feed={feed} initialConfig={editorConfigResult.config} />;
}
