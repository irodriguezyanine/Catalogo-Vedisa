import { createClient } from "@supabase/supabase-js";
import { migrateEditorAuctionIds } from "@/lib/auction-id";
import {
  resolveCatalogHeroDescription,
  resolveCatalogHeroKicker,
  resolveCatalogHeroTitle,
} from "@/lib/catalog-hero-copy";
import { DEFAULT_EDITOR_CONFIG, type EditorConfig } from "@/types/editor";

const EDITOR_TABLE = process.env.CATALOG_EDITOR_TABLE ?? "catalogo_editor_config";
const EDITOR_ROW_ID = "global";

function normalizeEventTypeFromName(value?: string | null): "remate" | "venta_directa" {
  const normalized = String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
  if (
    normalized.includes("ventadirecta") ||
    normalized.includes("vtadirecta") ||
    normalized.includes("vtdirecta") ||
    normalized.includes("ventadir")
  ) {
    return "venta_directa";
  }
  return "remate";
}

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normalizeConfig(config?: Partial<EditorConfig> | null): EditorConfig {
  const migrated = migrateEditorAuctionIds(config);
  const defaults = DEFAULT_EDITOR_CONFIG;
  const normalizedHeroTitle = resolveCatalogHeroTitle(migrated?.homeLayout?.heroTitle);
  const normalizedHeroDescription = resolveCatalogHeroDescription(migrated?.homeLayout?.heroDescription);
  const normalizedHeroKicker = resolveCatalogHeroKicker(migrated?.homeLayout?.heroKicker);
  const incomingPrimaryCta = migrated?.homeLayout?.heroPrimaryCtaLabel?.trim();
  const normalizedPrimaryCta =
    !incomingPrimaryCta || incomingPrimaryCta === "Ver catálogo completo"
      ? defaults.homeLayout.heroPrimaryCtaLabel
      : migrated?.homeLayout?.heroPrimaryCtaLabel ?? defaults.homeLayout.heroPrimaryCtaLabel;
  const incomingSecondaryCta = migrated?.homeLayout?.heroSecondaryCtaLabel?.trim();
  const normalizedSecondaryCta =
    !incomingSecondaryCta || incomingSecondaryCta === "Explorar secciones"
      ? defaults.homeLayout.heroSecondaryCtaLabel
      : migrated?.homeLayout?.heroSecondaryCtaLabel ?? defaults.homeLayout.heroSecondaryCtaLabel;
  const incomingSecondaryHref = migrated?.homeLayout?.heroSecondaryCtaHref?.trim();
  const normalizedSecondaryHref =
    !incomingSecondaryHref || incomingSecondaryHref === "#proximos-remates"
      ? "#como-participar"
      : migrated?.homeLayout?.heroSecondaryCtaHref ?? defaults.homeLayout.heroSecondaryCtaHref;
  return {
    sectionVehicleIds: {
      "proximos-remates":
        migrated?.sectionVehicleIds?.["proximos-remates"] ??
        defaults.sectionVehicleIds["proximos-remates"],
      "ventas-directas":
        migrated?.sectionVehicleIds?.["ventas-directas"] ??
        defaults.sectionVehicleIds["ventas-directas"],
      novedades: migrated?.sectionVehicleIds?.novedades ?? defaults.sectionVehicleIds.novedades,
      catalogo: migrated?.sectionVehicleIds?.catalogo ?? defaults.sectionVehicleIds.catalogo,
    },
    hiddenVehicleIds: migrated?.hiddenVehicleIds ?? defaults.hiddenVehicleIds,
    hiddenCategoryIds: migrated?.hiddenCategoryIds ?? defaults.hiddenCategoryIds,
    soldVehicleIds: migrated?.soldVehicleIds ?? defaults.soldVehicleIds,
    soldVehicleHistory: migrated?.soldVehicleHistory ?? defaults.soldVehicleHistory,
    vehiclePrices: migrated?.vehiclePrices ?? defaults.vehiclePrices,
    vehicleDetails: migrated?.vehicleDetails ?? defaults.vehicleDetails,
    upcomingAuctions: (migrated?.upcomingAuctions ?? defaults.upcomingAuctions).map((auction) => ({
      ...auction,
      eventType:
        auction.eventType === "venta_directa" || auction.eventType === "remate"
          ? auction.eventType
          : normalizeEventTypeFromName(auction.name),
    })),
    vehicleUpcomingAuctionIds:
      migrated?.vehicleUpcomingAuctionIds ?? defaults.vehicleUpcomingAuctionIds,
    sectionTexts: {
      "proximos-remates":
        migrated?.sectionTexts?.["proximos-remates"] ?? defaults.sectionTexts["proximos-remates"],
      "ventas-directas":
        migrated?.sectionTexts?.["ventas-directas"] ?? defaults.sectionTexts["ventas-directas"],
      novedades: migrated?.sectionTexts?.novedades ?? defaults.sectionTexts.novedades,
      catalogo: migrated?.sectionTexts?.catalogo ?? defaults.sectionTexts.catalogo,
    },
    homeLayout: {
      heroKicker: normalizedHeroKicker,
      heroTitle: normalizedHeroTitle,
      heroDescription: normalizedHeroDescription,
      heroPrimaryCtaLabel: normalizedPrimaryCta,
      heroPrimaryCtaHref:
        migrated?.homeLayout?.heroPrimaryCtaHref ?? defaults.homeLayout.heroPrimaryCtaHref,
      heroSecondaryCtaLabel: normalizedSecondaryCta,
      heroSecondaryCtaHref: normalizedSecondaryHref,
      heroAlignment: migrated?.homeLayout?.heroAlignment ?? defaults.homeLayout.heroAlignment,
      heroTheme: migrated?.homeLayout?.heroTheme ?? defaults.homeLayout.heroTheme,
      heroMaxWidth: migrated?.homeLayout?.heroMaxWidth ?? defaults.homeLayout.heroMaxWidth,
      showHeroChips: migrated?.homeLayout?.showHeroChips ?? defaults.homeLayout.showHeroChips,
      showHeroCtas: migrated?.homeLayout?.showHeroCtas ?? defaults.homeLayout.showHeroCtas,
      showFeaturedStrip:
        migrated?.homeLayout?.showFeaturedStrip ?? defaults.homeLayout.showFeaturedStrip,
      showRecentPublications:
        migrated?.homeLayout?.showRecentPublications ??
        defaults.homeLayout.showRecentPublications,
      showFavoritesSection: false,
      showHowToSection:
        (migrated?.homeLayout?.showHowToSection ?? defaults.homeLayout.showHowToSection) ||
        normalizedSecondaryHref === "#como-participar",
      showSearchBar: migrated?.homeLayout?.showSearchBar ?? defaults.homeLayout.showSearchBar,
      showQuickFilters:
        migrated?.homeLayout?.showQuickFilters ?? defaults.homeLayout.showQuickFilters,
      showSortSelector:
        migrated?.homeLayout?.showSortSelector ?? defaults.homeLayout.showSortSelector,
      showStickySearchBar:
        migrated?.homeLayout?.showStickySearchBar ?? defaults.homeLayout.showStickySearchBar,
      showCommercialPanel:
        migrated?.homeLayout?.showCommercialPanel ?? defaults.homeLayout.showCommercialPanel,
      defaultCardDensity:
        migrated?.homeLayout?.defaultCardDensity ?? defaults.homeLayout.defaultCardDensity,
      sectionSpacing: migrated?.homeLayout?.sectionSpacing ?? defaults.homeLayout.sectionSpacing,
      sectionOrder: migrated?.homeLayout?.sectionOrder ?? defaults.homeLayout.sectionOrder,
    },
    manualPublications: migrated?.manualPublications ?? defaults.manualPublications,
    managedCategories: migrated?.managedCategories ?? defaults.managedCategories,
  };
}

export type EditorConfigLoadResult = {
  config: EditorConfig;
  persisted: boolean;
};

export async function getEditorConfig(): Promise<EditorConfigLoadResult> {
  const supabase = getServerSupabase();
  if (!supabase) return { config: DEFAULT_EDITOR_CONFIG, persisted: false };

  const { data, error } = await supabase
    .from(EDITOR_TABLE)
    .select("config")
    .eq("id", EDITOR_ROW_ID)
    .maybeSingle();

  if (error || !data) return { config: DEFAULT_EDITOR_CONFIG, persisted: false };
  return {
    config: normalizeConfig((data as { config?: Partial<EditorConfig> }).config ?? null),
    persisted: true,
  };
}

export async function saveEditorConfig(
  config: EditorConfig,
  updatedBy: string,
): Promise<{ ok: boolean; error?: string; normalizedConfig?: EditorConfig }> {
  const supabase = getServerSupabase();
  if (!supabase) {
    return { ok: false, error: "Falta SUPABASE_SERVICE_ROLE_KEY o URL para guardar configuración." };
  }

  const normalizedConfig = normalizeConfig(config);
  const payloadWithAudit = {
    id: EDITOR_ROW_ID,
    config: normalizedConfig,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  };

  const fullSave = await supabase.from(EDITOR_TABLE).upsert(payloadWithAudit, { onConflict: "id" });
  if (!fullSave.error) return { ok: true, normalizedConfig };

  // Compatibilidad: algunas instalaciones antiguas tienen solo (id, config).
  const payloadMinimal = {
    id: EDITOR_ROW_ID,
    config: normalizedConfig,
  };
  const fallbackSave = await supabase.from(EDITOR_TABLE).upsert(payloadMinimal, { onConflict: "id" });
  if (!fallbackSave.error) return { ok: true, normalizedConfig };

  return {
    ok: false,
    error:
      `No se pudo guardar la configuración en la tabla '${EDITOR_TABLE}'. ` +
      "Verifica que exista la tabla y al menos las columnas: id (pk) y config (jsonb).",
  };
}
