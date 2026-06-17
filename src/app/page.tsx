import { CatalogHomeClient } from "@/components/catalog-home-client";
import { getCachedCatalogFeed } from "@/lib/catalog-feed-cache";
import { getMergedEditorConfig } from "@/lib/editor-config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  const [feed, editorConfigResult] = await Promise.all([getCachedCatalogFeed(), getMergedEditorConfig()]);
  return <CatalogHomeClient feed={feed} initialConfig={editorConfigResult.config} />;
}
