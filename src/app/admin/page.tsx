import type { Metadata } from "next";
import nextDynamic from "next/dynamic";
import { getCachedCatalogFeed } from "@/lib/catalog-feed-cache";
import { hydrateCatalogItemsWithEditorConfig } from "@/lib/catalog-feed-hydrate";
import { getCachedMergedEditorConfig } from "@/lib/editor-config-cache";

const CatalogHomeClient = nextDynamic(
  () => import("@/components/catalog-home-client").then((module) => module.CatalogHomeClient),
  {
    loading: () => (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm font-medium text-slate-600">Cargando editor del catálogo…</p>
      </div>
    ),
  },
);

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Editor del catálogo | VEDISA REMATES",
  description: "Panel de edición del catálogo Vedisa.",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const [feed, editorConfigResult] = await Promise.all([
    getCachedCatalogFeed(),
    getCachedMergedEditorConfig(),
  ]);

  const hydratedFeed = {
    ...feed,
    items: hydrateCatalogItemsWithEditorConfig(feed.items, editorConfigResult.config),
  };

  return (
    <CatalogHomeClient
      feed={hydratedFeed}
      initialConfig={editorConfigResult.config}
      initialAdminView="editor"
      openLoginIfGuest
    />
  );
}
