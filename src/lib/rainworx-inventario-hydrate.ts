import {
  importVehicleByPatent,
  preloadTasacionesMapForImport,
  type ImportPatentResult,
} from "@/lib/catalog-import-patent";
import { Glo3dRateLimitError } from "@/lib/catalog";
import { mergeEditorVehicleDetailsSmart } from "@/lib/rainworx-merge-smart";
import {
  editorDetailsToInventarioSeed,
} from "@/lib/rainworx-inventario-seed";
import { normalizePatenteKey } from "@/lib/rainworx-to-editor";
import type { EditorVehicleDetails } from "@/types/editor";

export type RainworxInventarioHydrateEntry = {
  patente: string;
  rainworxDetails: EditorVehicleDetails;
};

export type RainworxInventarioHydrateResult = {
  imported: string[];
  enriched: string[];
  rainworxOnly: string[];
  failed: Array<{ patente: string; error: string }>;
  rateLimited: boolean;
  mergedVehicleDetails: Record<string, EditorVehicleDetails>;
  importResults: ImportPatentResult[];
};

export type RainworxInventarioHydrateOptions = {
  estadoRetiro?: string;
  /** Si true, intenta Glo3D/Autored para patentes ausentes en Tasaciones. */
  allowExternalApisForNew?: boolean;
};

/**
 * Importa patentes del evento Rainworx al inventario compartido (TasacionesVedisa1),
 * complementando con Glo3D/Autored cuando existan y fusionando de vuelta con la ficha Rainworx.
 */
export async function hydrateRainworxPatentsInInventario(
  entries: RainworxInventarioHydrateEntry[],
  options?: RainworxInventarioHydrateOptions,
): Promise<RainworxInventarioHydrateResult> {
  const uniqueEntries = new Map<string, RainworxInventarioHydrateEntry>();
  for (const entry of entries) {
    const patente = normalizePatenteKey(entry.patente);
    if (!patente || !/^[A-Z0-9]{5,10}$/.test(patente)) continue;
    uniqueEntries.set(patente, { ...entry, patente });
  }

  const patentes = [...uniqueEntries.keys()];
  const mergedVehicleDetails: Record<string, EditorVehicleDetails> = {};
  const imported: string[] = [];
  const enriched: string[] = [];
  const rainworxOnly: string[] = [];
  const failed: Array<{ patente: string; error: string }> = [];
  const importResults: ImportPatentResult[] = [];

  if (patentes.length === 0) {
    return {
      imported,
      enriched,
      rainworxOnly,
      failed,
      rateLimited: false,
      mergedVehicleDetails,
      importResults,
    };
  }

  const tasacionesMap = await preloadTasacionesMapForImport().catch(() => new Map());
  let rateLimited = false;

  for (const [patente, entry] of uniqueEntries) {
    try {
      const result = await importVehicleByPatent(patente, {
        estadoRetiro: options?.estadoRetiro,
        forceRefresh: true,
        syncMode: "tasaciones-first",
        isNewUnit: true,
        allowRainworxSeedFallback: true,
        tasacionesMap,
        seedInventarioRow: editorDetailsToInventarioSeed(patente, entry.rainworxDetails),
      });
      importResults.push(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido";
      if (error instanceof Glo3dRateLimitError) rateLimited = true;
      failed.push({ patente, error: message });
      continue;
    }
  }

  for (const result of importResults) {
    const entry = uniqueEntries.get(result.patente);
    if (!entry) continue;

    const { details } = mergeEditorVehicleDetailsSmart(result.vehicleDetails, entry.rainworxDetails);
    mergedVehicleDetails[result.patente] = details;

    if (result.created) imported.push(result.patente);
    else enriched.push(result.patente);

    if (result.source === "tasaciones" || result.source === "tasaciones+glo3d") {
      // already counted as imported/enriched
    } else if (!result.syncDiagnostics?.tasacionesFound) {
      rainworxOnly.push(result.patente);
    }
  }

  return {
    imported,
    enriched,
    rainworxOnly,
    failed,
    rateLimited,
    mergedVehicleDetails,
    importResults,
  };
}
