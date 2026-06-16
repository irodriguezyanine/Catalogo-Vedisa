import type { Metadata } from "next";
import { CatalogHomeClient } from "@/components/catalog-home-client";
import { getCachedCatalogFeed } from "@/lib/catalog-feed-cache";
import { getPatentFromItem } from "@/lib/catalog-keys";
import { getVisibleCatalogItems } from "@/lib/catalog-public-inventory";
import { getMergedEditorConfig } from "@/lib/editor-config";
import { formatClpPrice } from "@/lib/format";

export const revalidate = 120;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://catalogo.vedisaremates.cl";

type PageProps = {
  params: Promise<{ patente: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { patente } = await params;
  const decoded = decodeURIComponent(patente).toUpperCase();
  const base = SITE_URL.replace(/\/$/, "");
  const canonical = `${base}/vehiculos/${encodeURIComponent(decoded)}`;

  try {
    const [feed, editor] = await Promise.all([getCachedCatalogFeed(), getMergedEditorConfig()]);
    const item = getVisibleCatalogItems(feed, editor.config).find(
      (entry) => getPatentFromItem(entry) === decoded.replace(/\s+/g, "").replace(/-/g, ""),
    );
    if (item) {
      const raw = item.raw as Record<string, unknown>;
      const price = formatClpPrice(
        typeof raw.precio === "number" ? raw.precio : undefined,
      );
      const description = `${item.title} · Patente ${decoded}. ${price}. Catálogo Vedisa Remates.`;
      const images = item.thumbnail?.startsWith("http") ? [{ url: item.thumbnail, alt: item.title }] : undefined;
      return {
        title: `${item.title} | ${decoded} | Catálogo VEDISA`,
        description,
        alternates: { canonical },
        openGraph: {
          title: item.title,
          description,
          url: canonical,
          images,
          type: "website",
          locale: "es_CL",
        },
        twitter: {
          card: images ? "summary_large_image" : "summary",
          title: item.title,
          description,
          images: images?.map((img) => img.url),
        },
      };
    }
  } catch {
    // metadata básica si falla el feed
  }

  return {
    title: `${decoded} | Vehículos disponibles | Catálogo VEDISA REMATES`,
    description: `Detalle del vehículo ${decoded} en Catálogo Vedisa.`,
    alternates: { canonical },
  };
}

export default async function VehicleDetailPage({ params }: PageProps) {
  const { patente } = await params;
  const vehicleKey = decodeURIComponent(patente);
  const [feed, editorConfigResult] = await Promise.all([getCachedCatalogFeed(), getMergedEditorConfig()]);

  return (
    <CatalogHomeClient
      feed={feed}
      initialConfig={editorConfigResult.config}
      standaloneVehicleKey={vehicleKey}
      standaloneBackHref="/vehiculos"
    />
  );
}
