import { CatalogHomeClientLazy } from "@/components/catalog-home-client-lazy";
import { getCachedCatalogFeed } from "@/lib/catalog-feed-cache";
import { getCachedMergedEditorConfig } from "@/lib/editor-config-cache";

export const revalidate = 120;

export default async function Home() {
  const [feed, editorConfigResult] = await Promise.all([
    getCachedCatalogFeed(),
    getCachedMergedEditorConfig(),
  ]);
  return <CatalogHomeClientLazy feed={feed} initialConfig={editorConfigResult.config} />;
}
