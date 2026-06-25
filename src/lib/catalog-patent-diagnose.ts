import {
  fetchAutoredRecordByPatent,
  fetchGlo3dRecordByPatent,
  fetchInventarioRowByPatent,
  fetchTasacionesRecordByPatent,
  type Glo3dInventoryEntry,
} from "@/lib/catalog";
import {
  assessTasacionesRecordCompleteness,
  buildGlo3dFromTasacionesRow,
} from "@/lib/catalog-tasaciones-import";
import { extractGlo3dInventoryImages } from "@/lib/glo3d-images";
import {
  extractAutoredImagesFromRecord,
  mergeVehicleImageSources,
} from "@/lib/catalog-sync-images";
import { autoredRecordHasIdentity } from "@/lib/vehicle-identity";

export type PatentSyncDiagnosis = {
  patente: string;
  tasaciones: {
    found: boolean;
    complete: boolean;
    missing: string[];
    view3dUrl?: string;
    imageCount: number;
    marca?: string;
    modelo?: string;
  };
  glo3d: {
    found: boolean;
    source: "tasaciones" | "api" | "none";
    view3dUrl?: string;
    imageCount: number;
    sampleImageUrls: string[];
    error?: string;
  };
  autored: {
    found: boolean;
    source: "tasaciones" | "api" | "none";
    hasIdentity: boolean;
    marca?: string;
    modelo?: string;
    ano?: string;
    imageCount: number;
    error?: string;
  };
  inventario: {
    found: boolean;
    thumbnail?: string;
    glo3dUrl?: string;
    hasGlo3dCampos: boolean;
    hasAutoredCampos: boolean;
  };
  merge: {
    thumbnailSource: "glo3d" | "autored" | "inventario" | "none";
    thumbnail?: string;
    totalImages: number;
  };
  warnings: string[];
  recommendation: string;
};

function pickString(row: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function normalizePatent(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "").replace(/-/g, "");
}

export async function diagnosePatentSync(rawPatente: string): Promise<PatentSyncDiagnosis> {
  const patente = normalizePatent(rawPatente);
  const warnings: string[] = [];

  const inventarioRow = await fetchInventarioRowByPatent(patente);
  const tasacionesFromApi = await fetchTasacionesRecordByPatent(patente);
  const tasacionesRow = (() => {
    if (tasacionesFromApi && inventarioRow) {
      return { ...inventarioRow, ...tasacionesFromApi };
    }
    return tasacionesFromApi ?? inventarioRow;
  })();
  const tasacionesCompleteness = assessTasacionesRecordCompleteness(tasacionesRow, patente);

  const tasacionesGlo3d = tasacionesRow ? buildGlo3dFromTasacionesRow(tasacionesRow) : null;
  const tasacionesGlo3dImages = tasacionesGlo3d
    ? extractGlo3dInventoryImages({
        raw: tasacionesGlo3d.raw,
        technicalFields: tasacionesGlo3d.technicalFields,
      })
    : [];
  const tasacionesAutoredImages = extractAutoredImagesFromRecord(tasacionesRow);

  let glo3dApi: Glo3dInventoryEntry | null = null;
  let glo3dApiError: string | undefined;
  if (!tasacionesCompleteness.complete) {
    try {
      glo3dApi = await fetchGlo3dRecordByPatent(patente, { forceRefresh: true });
    } catch (error) {
      glo3dApiError = error instanceof Error ? error.message : "Error consultando Glo3D API";
    }
  }

  let autoredApi: Record<string, unknown> | null = null;
  let autoredApiError: string | undefined;
  if (!tasacionesCompleteness.hasIdentity) {
    try {
      autoredApi = await fetchAutoredRecordByPatent(patente, { forceRefresh: true });
    } catch (error) {
      autoredApiError = error instanceof Error ? error.message : "Error consultando Autored API";
    }
  }

  const glo3d = tasacionesGlo3d ?? glo3dApi;
  const glo3dSource: PatentSyncDiagnosis["glo3d"]["source"] = tasacionesGlo3d
    ? "tasaciones"
    : glo3dApi
      ? "api"
      : "none";
  const autoredSource: PatentSyncDiagnosis["autored"]["source"] = tasacionesRow
    ? "tasaciones"
    : autoredApi
      ? "api"
      : "none";
  const autored = tasacionesRow ?? autoredApi;

  const glo3dImages = glo3d
    ? extractGlo3dInventoryImages({ raw: glo3d.raw, technicalFields: glo3d.technicalFields })
    : [];
  const autoredImages = extractAutoredImagesFromRecord(autored);
  const inventarioImages = inventarioRow
    ? [
        pickString(inventarioRow, ["thumbnail", "imagen_principal", "foto_portada"]),
        ...(Array.isArray(inventarioRow.imagenes) ? (inventarioRow.imagenes as string[]) : []),
      ].filter((url): url is string => typeof url === "string" && url.startsWith("http"))
    : [];

  const merged = mergeVehicleImageSources({
    glo3dImages: glo3dImages.length > 0 ? glo3dImages : tasacionesGlo3dImages,
    autoredImages: autoredImages.length > 0 ? autoredImages : tasacionesAutoredImages,
    inventarioImages,
  });

  if (!tasacionesRow) {
    warnings.push("Tasaciones: patente no encontrada en inventario compartido (TasacionesVedisa1).");
  } else if (!tasacionesCompleteness.complete) {
    warnings.push(`Tasaciones: ficha incompleta (${tasacionesCompleteness.missing.join(", ")}).`);
  }
  if (glo3dSource === "api" && !glo3dApi) {
    warnings.push(`Glo3D API (plan B): ${glo3dApiError ?? "no encontrada"}.`);
  }
  if (autoredSource === "api" && !autoredRecordHasIdentity(autoredApi, patente)) {
    warnings.push(`Autored API (plan B): ${autoredApiError ?? "sin identidad"}.`);
  }
  if (!merged.thumbnail) {
    warnings.push("Sin miniatura utilizable tras fusionar fuentes.");
  }

  let recommendation = "Ficha lista desde Tasaciones.";
  if (!tasacionesRow) {
    recommendation =
      "Verifica que la unidad exista en TasacionesVedisa1 con glo3d_campos y autored_campos.";
  } else if (!tasacionesCompleteness.complete) {
    recommendation =
      "Completa la ficha en Tasaciones (visor 3D + fotos). El catálogo usará plan B solo para lo que falte.";
  } else if (merged.thumbnailSource !== "glo3d" && tasacionesCompleteness.hasGlo3dViewer) {
    recommendation = "Tasaciones tiene visor pero miniatura no es Glo3D; revisa glo3d_campos en Tasaciones.";
  }

  return {
    patente,
    tasaciones: {
      found: Boolean(tasacionesRow),
      complete: tasacionesCompleteness.complete,
      missing: tasacionesCompleteness.missing,
      view3dUrl:
        tasacionesGlo3d?.view3dUrl ??
        pickString(tasacionesRow ?? {}, ["glo3d_url", "url_3d"]),
      imageCount: tasacionesGlo3dImages.length,
      marca: pickString(tasacionesRow ?? {}, ["marca", "brand"]),
      modelo: pickString(tasacionesRow ?? {}, ["modelo", "model"]),
    },
    glo3d: {
      found: Boolean(glo3d),
      source: glo3dSource,
      view3dUrl: glo3d?.view3dUrl,
      imageCount: glo3dImages.length || tasacionesGlo3dImages.length,
      sampleImageUrls: (glo3dImages.length > 0 ? glo3dImages : tasacionesGlo3dImages).slice(0, 5),
      error: glo3dApiError,
    },
    autored: {
      found: Boolean(autored),
      source: autoredSource,
      hasIdentity: autoredRecordHasIdentity(autored, patente),
      marca: pickString(autored ?? {}, ["marca", "brand"]),
      modelo: pickString(autored ?? {}, ["modelo", "model"]),
      ano: pickString(autored ?? {}, ["ano", "anio", "year"]),
      imageCount: autoredImages.length || tasacionesAutoredImages.length,
      error: autoredApiError,
    },
    inventario: {
      found: Boolean(inventarioRow),
      thumbnail: pickString(inventarioRow ?? {}, ["thumbnail", "imagen_principal"]),
      glo3dUrl: pickString(inventarioRow ?? {}, ["glo3d_url", "url_3d"]),
      hasGlo3dCampos: Boolean(inventarioRow?.glo3d_campos ?? inventarioRow?.glo3d),
      hasAutoredCampos: Boolean(inventarioRow?.autored_campos ?? inventarioRow?.autored),
    },
    merge: {
      thumbnailSource: merged.thumbnailSource,
      thumbnail: merged.thumbnail,
      totalImages: merged.images.length,
    },
    warnings,
    recommendation,
  };
}
