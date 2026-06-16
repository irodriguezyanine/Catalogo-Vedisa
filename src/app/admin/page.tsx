import type { Metadata } from "next";
import { CatalogHomeClient } from "@/components/catalog-home-client";
import { getCachedCatalogFeed } from "@/lib/catalog-feed-cache";
import { getMergedEditorConfig } from "@/lib/editor-config";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Editor del catálogo | VEDISA REMATES",
  description: "Panel de edición del catálogo Vedisa.",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const [feed, editorConfigResult] = await Promise.all([
    getCachedCatalogFeed(),
    getMergedEditorConfig(),
  ]);

  return (
    <CatalogHomeClient
      feed={feed}
      initialConfig={editorConfigResult.config}
      initialAdminView="editor"
      openLoginIfGuest
    />
  );
}
