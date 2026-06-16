import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://catalogo.vedisaremates.cl";

export default function robots(): MetadataRoute.Robots {
  const base = SITE_URL.replace(/\/$/, "");
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/vehiculos", "/vehiculos/"],
      disallow: ["/api/admin/"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
