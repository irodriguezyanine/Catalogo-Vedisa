import { headers } from "next/headers";
import { CatalogHomeClient } from "@/components/catalog-home-client";
import { getCatalogFeed } from "@/lib/catalog";
import { getEditorConfig } from "@/lib/editor-config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  const feedPromise = getCatalogFeed();
  const editorConfigPromise = (async () => {
    try {
      const h = await headers();
      const host = h.get("x-forwarded-host") ?? h.get("host");
      if (!host) return getEditorConfig();
      const protocol = h.get("x-forwarded-proto") ?? "https";
      const res = await fetch(`${protocol}://${host}/api/admin/editor-config`, {
        cache: "no-store",
      });
      if (!res.ok) return getEditorConfig();
      const payload = (await res.json()) as { config?: unknown };
      if (!payload.config) return getEditorConfig();
      return { config: payload.config as Awaited<ReturnType<typeof getEditorConfig>>["config"], persisted: true };
    } catch {
      return getEditorConfig();
    }
  })();

  const [feed, editorConfigResult] = await Promise.all([feedPromise, editorConfigPromise]);
  return <CatalogHomeClient feed={feed} initialConfig={editorConfigResult.config} />;
}
