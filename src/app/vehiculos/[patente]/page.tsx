import type { Metadata } from "next";
import { headers } from "next/headers";
import { CatalogHomeClient } from "@/components/catalog-home-client";
import { getCatalogFeed } from "@/lib/catalog";
import { getEditorConfig } from "@/lib/editor-config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{ patente: string }>;
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
  const [feed, editorConfigResult] = await Promise.all([getCatalogFeed(), loadEditorConfig()]);

  return (
    <CatalogHomeClient
      feed={feed}
      initialConfig={editorConfigResult.config}
      standaloneVehicleKey={vehicleKey}
      standaloneBackHref="/vehiculos"
    />
  );
}
