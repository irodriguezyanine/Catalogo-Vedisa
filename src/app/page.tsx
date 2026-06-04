import { CatalogHomeClient } from "@/components/catalog-home-client";
import { getCatalogFeed } from "@/lib/catalog";
import { getMergedEditorConfig } from "@/lib/editor-config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  const [feed, editorConfigResult] = await Promise.all([getCatalogFeed(), getMergedEditorConfig()]);
  return <CatalogHomeClient feed={feed} initialConfig={editorConfigResult.config} />;
}
