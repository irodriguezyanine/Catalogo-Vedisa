import type { Metadata } from "next";
import { CatalogVehiclesListClient } from "@/components/catalog-vehicles-list-client";
import { getCachedCatalogFeed } from "@/lib/catalog-feed-cache";
import { getMergedEditorConfig } from "@/lib/editor-config";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Vehículos disponibles | Catálogo VEDISA REMATES",
  description:
    "Listado completo de vehículos disponibles en Catálogo Vedisa con precio, venta directa, remate y estado de siniestro.",
};

export default async function VehiclesPage() {
  const [feed, editorConfigResult] = await Promise.all([getCachedCatalogFeed(), getMergedEditorConfig()]);
  return <CatalogVehiclesListClient feed={feed} initialConfig={editorConfigResult.config} />;
}
