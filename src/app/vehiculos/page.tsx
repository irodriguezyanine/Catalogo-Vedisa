import type { Metadata } from "next";
import { CatalogVehiclesListClient } from "@/components/catalog-vehicles-list-client";
import { getCatalogFeed } from "@/lib/catalog";
import { getMergedEditorConfig } from "@/lib/editor-config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Vehículos disponibles | Catálogo VEDISA REMATES",
  description:
    "Listado completo de vehículos disponibles en Catálogo Vedisa con precio, venta directa, remate y estado de siniestro.",
};

export default async function VehiclesPage() {
  const [feed, editorConfigResult] = await Promise.all([getCatalogFeed(), getMergedEditorConfig()]);
  return <CatalogVehiclesListClient feed={feed} initialConfig={editorConfigResult.config} />;
}
