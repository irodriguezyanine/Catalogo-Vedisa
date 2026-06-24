import type { CatalogItem } from "@/types/catalog";
import type { EditorVehicleDetails } from "@/types/editor";
import { getPatentFromItem } from "@/lib/catalog-keys";
import { isPlaceholderVehicleIdentity } from "@/lib/vehicle-identity";

function normalizePatentToken(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "").replace(/-/g, "");
}

function isPlaceholderVehicleLabel(value?: string | null): boolean {
  if (!value?.trim()) return true;
  return isPlaceholderVehicleIdentity(value);
}

function isStaleEditorDraftValue(value: string | undefined, patente?: string): boolean {
  if (!value?.trim()) return true;
  if (isPlaceholderVehicleLabel(value)) return true;
  const normalizedPatente = normalizePatentToken(patente ?? "");
  if (normalizedPatente && normalizePatentToken(value) === normalizedPatente) return true;
  if (/^unidad\s+[a-z0-9]{5,10}$/i.test(value.trim())) return true;
  return false;
}

function resolveEditorDraftField(
  overrideValue: string | undefined,
  itemValue: string,
  patente?: string,
): string {
  if (overrideValue?.trim() && !isStaleEditorDraftValue(overrideValue, patente)) {
    return overrideValue.trim();
  }
  const cleaned = itemValue?.trim() ?? "";
  if (cleaned && !isStaleEditorDraftValue(cleaned, patente)) return cleaned;
  return "";
}

function resolveIdentityDraftField(
  overrideValue: string | undefined,
  itemValue: string,
  patente?: string,
): string {
  return resolveEditorDraftField(overrideValue, itemValue, patente);
}

function buildAutoVehicleTitle(details: EditorVehicleDetails): string {
  const parts = [details.brand, details.model, details.year, details.version].filter(
    (part) => part?.trim() && !isPlaceholderVehicleLabel(part),
  ) as string[];
  return parts.join(" ").trim();
}

function parseImagesCsv(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith("http"));
}

/** Aplica overrides del editor (sync Glo3D/Autored) sobre un ítem del feed — usado en admin y público. */
export function applyCatalogDetailsOverride(
  item: CatalogItem,
  override?: EditorVehicleDetails,
): CatalogItem {
  if (!override) return item;
  const patente = getPatentFromItem(item);
  const overrideCopy = { ...override };
  for (const key of ["brand", "model", "title", "year", "subtitle"] as const) {
    if (isStaleEditorDraftValue(overrideCopy[key], patente)) {
      delete overrideCopy[key];
    }
  }
  const imagesFromCsv = parseImagesCsv(overrideCopy.imagesCsv);
  const syncedThumbnail = overrideCopy.thumbnail?.trim();
  const hasSyncedThumbnail = Boolean(
    syncedThumbnail?.startsWith("http") && !syncedThumbnail.includes("placeholder"),
  );
  const mergedImages = [
    ...new Set([
      ...imagesFromCsv,
      ...(hasSyncedThumbnail && syncedThumbnail ? [syncedThumbnail] : []),
      ...item.images.filter((url) => url.startsWith("http") && !url.includes("placeholder")),
    ]),
  ];
  const thumbnail =
    (hasSyncedThumbnail ? syncedThumbnail : undefined) ?? mergedImages[0] ?? item.thumbnail;
  const raw = item.raw as Record<string, unknown>;
  const resolvedTitle =
    resolveIdentityDraftField(overrideCopy.title, item.title, patente) ||
    buildAutoVehicleTitle({
      ...overrideCopy,
      brand: resolveIdentityDraftField(
        overrideCopy.brand,
        String(raw.marca ?? raw.brand ?? ""),
        patente,
      ),
      model: resolveIdentityDraftField(
        overrideCopy.model,
        String(raw.modelo ?? raw.model ?? ""),
        patente,
      ),
      year: resolveIdentityDraftField(
        overrideCopy.year,
        String(raw.ano ?? raw.anio ?? raw.year ?? ""),
        patente,
      ),
      patente,
    }) ||
    item.title;
  const resolvedModel = resolveIdentityDraftField(
    overrideCopy.model,
    String(raw.modelo ?? raw.model ?? ""),
    patente,
  );
  const resolvedBrand = resolveIdentityDraftField(
    overrideCopy.brand,
    String(raw.marca ?? raw.brand ?? ""),
    patente,
  );
  return {
    ...item,
    title: resolvedTitle,
    subtitle: overrideCopy.subtitle ?? item.subtitle,
    status: overrideCopy.status ?? item.status,
    location: overrideCopy.location ?? item.location,
    lot: overrideCopy.lot ?? item.lot,
    auctionDate: overrideCopy.auctionDate ?? item.auctionDate,
    thumbnail,
    view3dUrl: overrideCopy.view3dUrl ?? item.view3dUrl,
    images: mergedImages.length > 0 ? mergedImages : item.images,
    raw: {
      ...raw,
      ...(overrideCopy.patente ? { patente: overrideCopy.patente, PPU: overrideCopy.patente } : {}),
      ...(overrideCopy.patenteVerifier
        ? { patente_verifier: overrideCopy.patenteVerifier, ppu_dv: overrideCopy.patenteVerifier, dv: overrideCopy.patenteVerifier }
        : {}),
      ...(overrideCopy.vin ? { vin: overrideCopy.vin } : {}),
      ...(overrideCopy.nChasis
        ? { n_de_chasis: overrideCopy.nChasis, numero_chasis: overrideCopy.nChasis, nro_chasis: overrideCopy.nChasis, chasis: overrideCopy.nChasis }
        : {}),
      ...(overrideCopy.nMotor
        ? { n_de_motor: overrideCopy.nMotor, numero_motor: overrideCopy.nMotor, ndm: overrideCopy.nMotor }
        : {}),
      ...(overrideCopy.nSerie
        ? { n_de_serie: overrideCopy.nSerie, numero_serie: overrideCopy.nSerie, nds: overrideCopy.nSerie }
        : {}),
      ...(overrideCopy.nSiniestro
        ? { n_de_siniestro: overrideCopy.nSiniestro, numero_siniestro: overrideCopy.nSiniestro, n_s: overrideCopy.nSiniestro, ns: overrideCopy.nSiniestro }
        : {}),
      ...(overrideCopy.version ? { version: overrideCopy.version, ver: overrideCopy.version, trim: overrideCopy.version } : {}),
      ...(overrideCopy.tipo ? { tipo: overrideCopy.tipo, type: overrideCopy.tipo } : {}),
      ...(overrideCopy.tipoVehiculo
        ? { tipo_de_vehiculo: overrideCopy.tipoVehiculo, tipo_vehiculo: overrideCopy.tipoVehiculo, vehicle_type: overrideCopy.tipoVehiculo }
        : {}),
      ...(overrideCopy.vehicleCondition
        ? { condicion: overrideCopy.vehicleCondition, condicion_vehiculo: overrideCopy.vehicleCondition, estado_vehiculo: overrideCopy.vehicleCondition }
        : {}),
      ...(overrideCopy.description ? { descripcion: overrideCopy.description, description: overrideCopy.description } : {}),
      ...(overrideCopy.extendedDescription
        ? { descripcion_ampliada: overrideCopy.extendedDescription, observaciones: overrideCopy.extendedDescription }
        : {}),
      ...(resolvedBrand ? { marca: resolvedBrand, brand: resolvedBrand } : {}),
      ...(resolvedModel ? { modelo: resolvedModel, model: resolvedModel } : {}),
      ...(overrideCopy.year ? { ano: overrideCopy.year, anio: overrideCopy.year, year: overrideCopy.year } : {}),
      ...(overrideCopy.category ? { categoria: overrideCopy.category } : {}),
      ...(overrideCopy.kilometraje ? { kilometraje: overrideCopy.kilometraje, km: overrideCopy.kilometraje } : {}),
      ...(overrideCopy.color ? { color: overrideCopy.color } : {}),
      ...(overrideCopy.combustible ? { combustible: overrideCopy.combustible } : {}),
      ...(overrideCopy.transmision ? { transmision: overrideCopy.transmision, caja: overrideCopy.transmision } : {}),
      ...(overrideCopy.traccion ? { traccion: overrideCopy.traccion } : {}),
      ...(overrideCopy.aro ? { aro: overrideCopy.aro } : {}),
      ...(overrideCopy.cilindrada ? { cilindrada: overrideCopy.cilindrada } : {}),
      ...(overrideCopy.location ? { ubicacion: overrideCopy.location } : {}),
      ...(overrideCopy.ubicacionFisica ? { ubicacion_fisica: overrideCopy.ubicacionFisica, ubi: overrideCopy.ubicacionFisica } : {}),
      ...(overrideCopy.transportista ? { transportista: overrideCopy.transportista, tra: overrideCopy.transportista } : {}),
      ...(overrideCopy.taller ? { taller: overrideCopy.taller, tal: overrideCopy.taller } : {}),
      ...(overrideCopy.llaves ? { llaves: overrideCopy.llaves } : {}),
      ...(overrideCopy.aireAcondicionado ? { aire_acondicionado: overrideCopy.aireAcondicionado } : {}),
      ...(overrideCopy.unicoPropietario ? { unico_propietario: overrideCopy.unicoPropietario } : {}),
      ...(overrideCopy.condicionado ? { condicionado: overrideCopy.condicionado } : {}),
      ...(overrideCopy.multas ? { multas: overrideCopy.multas, mul: overrideCopy.multas } : {}),
      ...(overrideCopy.tag ? { tag: overrideCopy.tag } : {}),
      ...(overrideCopy.vencRevisionTecnica
        ? { vencimiento_revision_tecnica: overrideCopy.vencRevisionTecnica, vrt: overrideCopy.vencRevisionTecnica }
        : {}),
      ...(overrideCopy.vencPermisoCirculacion
        ? { vencimiento_permiso_circulacion: overrideCopy.vencPermisoCirculacion, vpc: overrideCopy.vencPermisoCirculacion }
        : {}),
      ...(overrideCopy.vencSeguroObligatorio
        ? { vencimiento_seguro_obligatorio: overrideCopy.vencSeguroObligatorio, vso: overrideCopy.vencSeguroObligatorio }
        : {}),
      ...(overrideCopy.pruebaMotor ? { prueba_motor: overrideCopy.pruebaMotor, pdm: overrideCopy.pruebaMotor } : {}),
      ...(overrideCopy.pruebaDesplazamiento
        ? { prueba_desplazamiento: overrideCopy.pruebaDesplazamiento, pdd: overrideCopy.pruebaDesplazamiento }
        : {}),
      ...(overrideCopy.estadoAirbags ? { estado_airbags: overrideCopy.estadoAirbags, eda: overrideCopy.estadoAirbags } : {}),
      ...(overrideCopy.lotDocumentsJson
        ? { documentos_lote_json: overrideCopy.lotDocumentsJson, lot_documents_json: overrideCopy.lotDocumentsJson }
        : {}),
      ...(override.nombrePropietarioAnterior
        ? { nombre_propietario_anterior: override.nombrePropietarioAnterior, npa: override.nombrePropietarioAnterior }
        : {}),
      ...(override.rutPropietarioAnterior
        ? { rut_propietario_anterior: override.rutPropietarioAnterior, rpa: override.rutPropietarioAnterior }
        : {}),
      ...(override.rutVerificador
        ? { rut_verificador: override.rutVerificador, verifier_rut: override.rutVerificador }
        : {}),
      ...(mergedImages.length > 0
        ? {
            imagenes: mergedImages,
            fotos_urls: mergedImages,
            fotos: mergedImages,
            thumbnail,
            imagen_principal: thumbnail,
            foto_portada: thumbnail,
          }
        : {}),
    },
  };
}

export { isStaleEditorDraftValue };
