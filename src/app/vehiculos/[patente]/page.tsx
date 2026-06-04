import type { Metadata } from "next";
import { CatalogHomeClient } from "@/components/catalog-home-client";
import { getCatalogFeed } from "@/lib/catalog";
import { getMergedEditorConfig } from "@/lib/editor-config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{ patente: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { patente } = await params;
  const decoded = decodeURIComponent(patente).toUpperCase();
  return {
    title: `${decoded} | Vehículos disponibles | Catálogo VEDISA REMATES`,
    description: `Detalle del vehículo ${decoded} en Catálogo Vedisa.`,
  };
}

export default async function VehicleDetailPage({ params }: PageProps) {
  const { patente } = await params;
  const vehicleKey = decodeURIComponent(patente);
  const [feed, editorConfigResult] = await Promise.all([getCatalogFeed(), getMergedEditorConfig()]);

  return (
    <CatalogHomeClient
      feed={feed}
      initialConfig={editorConfigResult.config}
      standaloneVehicleKey={vehicleKey}
      standaloneBackHref="/vehiculos"
    />
  );
}
