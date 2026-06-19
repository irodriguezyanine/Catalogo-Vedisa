import type { MetadataRoute } from "next";
import { getCachedCatalogFeed } from "@/lib/catalog-feed-cache";
import { getPatentFromItem } from "@/lib/catalog-keys";
import { isCatalogPublishedVehicle } from "@/lib/catalog-publication-rules";
import { getCachedMergedEditorConfig } from "@/lib/editor-config-cache";
import { getVisibleCatalogItems } from "@/lib/catalog-public-inventory";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://catalogo.vedisaremates.cl";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE_URL.replace(/\/$/, "");
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, lastModified: new Date(), changeFrequency: "hourly", priority: 1 },
    { url: `${base}/vehiculos`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.9 },
  ];

  try {
    const [feed, editor] = await Promise.all([getCachedCatalogFeed(), getCachedMergedEditorConfig()]);
    const visible = getVisibleCatalogItems(feed, editor.config);
    const vehicleRoutes = visible
      .map((item) => {
        const patente = getPatentFromItem(item);
        if (!patente || patente === "—" || !isCatalogPublishedVehicle(item, editor.config)) return null;
        return {
          url: `${base}/vehiculos/${encodeURIComponent(patente)}`,
          lastModified: new Date(),
          changeFrequency: "daily" as const,
          priority: 0.7,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    return [...staticRoutes, ...vehicleRoutes];
  } catch {
    return staticRoutes;
  }
}
