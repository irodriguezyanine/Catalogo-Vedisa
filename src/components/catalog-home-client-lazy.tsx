import nextDynamic from "next/dynamic";
import { CatalogLoadingShell } from "@/components/catalog-loading-shell";

export const CatalogHomeClientLazy = nextDynamic(
  () => import("@/components/catalog-home-client").then((module) => module.CatalogHomeClient),
  {
    loading: () => <CatalogLoadingShell />,
  },
);
