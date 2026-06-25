import {
  isGlo3dCatalogImageUrl,
  isTasacionesInventoryPhotoUrl,
} from "@/lib/catalog-sync-images";
import { isPlaceholderVehicleIdentity } from "@/lib/vehicle-identity";
import type { EditorVehicleDetails } from "@/types/editor";

export type RainworxEditorMergeMode = "rainworx_wins" | "fill_empty" | "merge_smart";

function parseImagesCsv(csv?: string): string[] {
  return (csv ?? "")
    .split(/[\n,;|]+/)
    .map((part) => part.trim())
    .filter((url) => url.startsWith("http"));
}

function isProtectedCatalogImageUrl(url: string): boolean {
  return isGlo3dCatalogImageUrl(url) || isTasacionesInventoryPhotoUrl(url);
}

function normalizeComparableText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function mergeExtendedDescriptionHtml(existing?: string, incoming?: string): string | undefined {
  const ex = existing?.trim() ?? "";
  const inc = incoming?.trim() ?? "";
  if (!inc) return ex || undefined;
  if (!ex) return inc;
  const normEx = normalizeComparableText(ex);
  const blocks = inc.split(/\n(?=<)/).map((b) => b.trim()).filter(Boolean);
  const toAppend: string[] = [];
  for (const block of blocks) {
    const normBlock = normalizeComparableText(block);
    if (normBlock.length < 12) continue;
    if (normEx.includes(normBlock)) continue;
    toAppend.push(block);
  }
  if (toAppend.length === 0) return ex;
  return `${ex}\n${toAppend.join("\n")}`;
}

function mergeLotDocumentsJson(existing?: string, incoming?: string): string | undefined {
  if (!incoming?.trim()) return existing?.trim() || undefined;
  if (!existing?.trim()) return incoming;
  try {
    const exDocs = JSON.parse(existing) as Array<{ url?: string; label?: string }>;
    const inDocs = JSON.parse(incoming) as Array<{ url?: string; label?: string }>;
    const urls = new Set(exDocs.map((d) => d.url).filter(Boolean));
    const merged = [...exDocs];
    for (const doc of inDocs) {
      if (doc.url && !urls.has(doc.url)) {
        merged.push(doc);
        urls.add(doc.url);
      }
    }
    return merged.length > 0 ? JSON.stringify(merged) : undefined;
  } catch {
    return incoming;
  }
}

function mergeImagesCsvSmart(existing?: string, incoming?: string): string | undefined {
  const ex = parseImagesCsv(existing);
  const inc = parseImagesCsv(incoming);
  const protectedFirst = ex.filter((url) => isProtectedCatalogImageUrl(url));
  if (protectedFirst.length > 0) {
    const merged = [...new Set([...protectedFirst, ...ex, ...inc])];
    return merged.length > 0 ? merged.join(", ") : undefined;
  }
  const merged = [...new Set([...ex, ...inc])];
  return merged.length > 0 ? merged.join(", ") : undefined;
}

function pickThumbnailSmart(
  existing?: string,
  incoming?: string,
  mergedImagesCsv?: string,
): string | undefined {
  const ex = existing?.trim();
  if (ex?.startsWith("http") && isProtectedCatalogImageUrl(ex)) return ex;
  const fromCsv = parseImagesCsv(mergedImagesCsv).find((url) => isProtectedCatalogImageUrl(url));
  if (fromCsv) return fromCsv;
  const inc = incoming?.trim();
  if (inc?.startsWith("http")) return inc;
  return ex || incoming?.trim() || undefined;
}

function shouldFillScalar(existing: unknown): boolean {
  if (existing === undefined || existing === null) return true;
  if (typeof existing === "string") {
    const t = existing.trim();
    if (!t) return true;
    if (isPlaceholderVehicleIdentity(t)) return true;
    return false;
  }
  return false;
}

const SMART_SCALAR_KEYS: Array<keyof EditorVehicleDetails> = [
  "title",
  "subtitle",
  "patente",
  "patenteVerifier",
  "brand",
  "model",
  "year",
  "version",
  "vin",
  "nChasis",
  "nMotor",
  "nSerie",
  "nSiniestro",
  "tipo",
  "tipoVehiculo",
  "category",
  "kilometraje",
  "color",
  "combustible",
  "transmision",
  "traccion",
  "aro",
  "cilindrada",
  "llaves",
  "aireAcondicionado",
  "unicoPropietario",
  "condicionado",
  "ubicacionFisica",
  "vencPermisoCirculacion",
  "vencRevisionTecnica",
  "vencSeguroObligatorio",
  "pruebaMotor",
  "pruebaDesplazamiento",
  "estadoAirbags",
  "lot",
  "description",
  "multas",
  "view3dUrl",
  "vehicleCondition",
  "status",
  "location",
  "auctionDate",
];

export type RainworxSmartMergeStats = {
  photosPreserved: boolean;
  descriptionAppended: boolean;
};

export function mergeEditorVehicleDetailsSmart(
  existing: EditorVehicleDetails | undefined,
  incoming: EditorVehicleDetails,
): { details: EditorVehicleDetails; stats: RainworxSmartMergeStats } {
  if (!existing) {
    return { details: { ...incoming }, stats: { photosPreserved: false, descriptionAppended: false } };
  }

  const mergedImagesCsv = mergeImagesCsvSmart(existing.imagesCsv, incoming.imagesCsv);
  const thumbnail = pickThumbnailSmart(existing.thumbnail, incoming.thumbnail, mergedImagesCsv);
  const photosPreserved = Boolean(
    existing.thumbnail?.trim() &&
      incoming.thumbnail?.trim() &&
      thumbnail === existing.thumbnail?.trim() &&
      isProtectedCatalogImageUrl(existing.thumbnail),
  );

  const extendedBefore = existing.extendedDescription?.trim() ?? "";
  const extendedDescription = mergeExtendedDescriptionHtml(
    existing.extendedDescription,
    incoming.extendedDescription,
  );
  const descriptionAppended = Boolean(
    extendedDescription && extendedDescription.length > extendedBefore.length,
  );

  const base: EditorVehicleDetails = {
    ...existing,
    extendedDescription,
    lotDocumentsJson: mergeLotDocumentsJson(existing.lotDocumentsJson, incoming.lotDocumentsJson),
    imagesCsv: mergedImagesCsv,
    thumbnail,
  };

  for (const key of SMART_SCALAR_KEYS) {
    const inc = incoming[key];
    if (inc === undefined) continue;
    if (typeof inc === "string" && !inc.trim()) continue;
    if (shouldFillScalar(existing[key])) {
      (base as Record<string, unknown>)[key as string] = inc;
    }
  }

  return { details: base, stats: { photosPreserved, descriptionAppended } };
}
