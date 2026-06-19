import { ImageResponse } from "next/og";
import { getCachedCatalogFeed } from "@/lib/catalog-feed-cache";
import { getPatentFromItem } from "@/lib/catalog-keys";
import { getVisibleCatalogItems } from "@/lib/catalog-public-inventory";
import { getCachedMergedEditorConfig } from "@/lib/editor-config-cache";

export const runtime = "edge";

export default async function Image({ params }: { params: Promise<{ patente: string }> }) {
  const { patente } = await params;
  const decoded = decodeURIComponent(patente).toUpperCase().replace(/\s+/g, "").replace(/-/g, "");

  let title = decoded;
  let subtitle = "Catálogo VEDISA REMATES";

  try {
    const [feed, editor] = await Promise.all([getCachedCatalogFeed(), getCachedMergedEditorConfig()]);
    const item = getVisibleCatalogItems(feed, editor.config).find(
      (entry) => getPatentFromItem(entry) === decoded,
    );
    if (item) {
      title = item.title;
      subtitle = decoded;
    }
  } catch {
    // fallback text
  }

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0e7490 0%, #164e63 100%)",
          color: "white",
          padding: "48px",
        }}
      >
        <div style={{ fontSize: 28, opacity: 0.9 }}>VEDISA REMATES</div>
        <div style={{ fontSize: 52, fontWeight: 700, marginTop: 16, lineHeight: 1.1 }}>{title}</div>
        <div style={{ fontSize: 28, marginTop: 20, opacity: 0.85 }}>{subtitle}</div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
