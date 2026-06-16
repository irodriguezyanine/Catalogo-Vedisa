import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { getCachedCatalogFeed } from "@/lib/catalog-feed-cache";
import { getMergedEditorConfig } from "@/lib/editor-config";

const CatalogHomeClient = dynamic(
  () => import("@/components/catalog-home-client").then((module) => module.CatalogHomeClient),
  {
    loading: () => (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm font-medium text-slate-600">Cargando editor del catálogo…</p>
      </div>
    ),
  },
);

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
