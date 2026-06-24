import {
  fetchAutoredRecordByPatent,
  fetchGlo3dRecordByPatent,
  fetchInventarioRowByPatent,
  type Glo3dInventoryEntry,
} from "@/lib/catalog";
import { extractGlo3dInventoryImages } from "@/lib/glo3d-images";
import {
  extractAutoredImagesFromRecord,
  mergeVehicleImageSources,
} from "@/lib/catalog-sync-images";
import { autoredRecordHasIdentity } from "@/lib/vehicle-identity";

export type PatentSyncDiagnosis = {
  patente: string;
  glo3d: {
    found: boolean;
    view3dUrl?: string;
    imageCount: number;
    sampleImageUrls: string[];
    rawTopLevelKeys: string[];
    stockNumber?: string;
    error?: string;
  };
  autored: {
    found: boolean;
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

  let glo3d: Glo3dInventoryEntry | null = null;
  let glo3dError: string | undefined;
  try {
    glo3d = await fetchGlo3dRecordByPatent(patente, { forceRefresh: true });
  } catch (error) {
    glo3dError = error instanceof Error ? error.message : "Error consultando Glo3D";
    warnings.push(`Glo3D API: ${glo3dError}`);
  }

  let autored: Record<string, unknown> | null = null;
  let autoredError: string | undefined;
  try {
    autored = await fetchAutoredRecordByPatent(patente, { forceRefresh: true });
  } catch (error) {
    autoredError = error instanceof Error ? error.message : "Error consultando Autored";
    warnings.push(`Autored API: ${autoredError}`);
  }

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
    glo3dImages,
    autoredImages,
    inventarioImages,
  });

  if (!glo3d) {
    warnings.push("Glo3D: patente no encontrada en inventario Glo3D (búsqueda + paginación).");
  } else if (!glo3d.view3dUrl) {
    warnings.push("Glo3D: registro encontrado pero sin URL de visor 3D.");
  }
  if (glo3d && glo3dImages.length === 0) {
    warnings.push(
      "Glo3D: sin miniaturas extraíbles. Revisa frames/main_frame en glo3d_campos o captura en la app Glo3D.",
    );
  }
  if (merged.thumbnailSource === "autored" && glo3d) {
    warnings.push(
      "La miniatura actual vendría de Autored porque Glo3D no entregó imagen HTTP. El catálogo prioriza Glo3D cuando existe.",
    );
  }
  if (!autoredRecordHasIdentity(autored, patente)) {
    warnings.push("Autored/Tasaciones: sin marca/modelo útiles para esta patente.");
  }

  let recommendation = "Sync completado correctamente.";
  if (!glo3d) {
    recommendation =
      "Verifica que la patente en Glo3D coincida exactamente con el stock number (ej. TSTZ49).";
  } else if (glo3dImages.length === 0) {
    recommendation =
      "Abre la unidad en Glo3D, confirma que tenga captura publicada, y vuelve a sincronizar con forceRefresh.";
  } else if (merged.thumbnailSource !== "glo3d") {
    recommendation = "Re-sincroniza; si persiste, revisa el diagnóstico en /api/admin/diagnose-patent.";
  }

  return {
    patente,
    glo3d: {
      found: Boolean(glo3d),
      view3dUrl: glo3d?.view3dUrl,
      imageCount: glo3dImages.length,
      sampleImageUrls: glo3dImages.slice(0, 5),
      rawTopLevelKeys: glo3d ? Object.keys(glo3d.raw).slice(0, 40) : [],
      stockNumber: pickString(glo3d?.raw ?? {}, ["stock_number", "stock", "PPU", "patente"]),
      error: glo3dError,
    },
    autored: {
      found: Boolean(autored),
      hasIdentity: autoredRecordHasIdentity(autored, patente),
      marca: pickString(autored ?? {}, ["marca", "brand"]),
      modelo: pickString(autored ?? {}, ["modelo", "model"]),
      ano: pickString(autored ?? {}, ["ano", "anio", "year"]),
      imageCount: autoredImages.length,
      error: autoredError,
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
