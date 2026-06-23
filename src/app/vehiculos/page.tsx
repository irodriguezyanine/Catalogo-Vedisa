import type { Metadata } from "next";
import { Suspense } from "react";
import { CatalogVehiclesListClient } from "@/components/catalog-vehicles-list-client";
import { getCachedCatalogFeed } from "@/lib/catalog-feed-cache";
import { getCachedMergedEditorConfig } from "@/lib/editor-config-cache";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Vehículos disponibles | Catálogo VEDISA REMATES",
  description:
    "Listado completo de vehículos disponibles en Catálogo Vedisa con precio, venta directa, remate y estado de siniestro.",
};

export default async function VehiclesPage() {
  const [feed, editorConfigResult] = await Promise.all([getCachedCatalogFeed(), getCachedMergedEditorConfig()]);
  return (
    <Suspense
      fallback={
        <div className="catalog-bg flex min-h-screen items-center justify-center text-sm text-slate-600">
          Cargando vehículos...
        </div>
      }
    >
      <CatalogVehiclesListClient feed={feed} initialConfig={editorConfigResult.config} />
    </Suspense>
  );
}
