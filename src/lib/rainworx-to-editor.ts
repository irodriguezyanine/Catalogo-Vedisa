import type { EditorVehicleDetails } from "@/types/editor";
import type { RainworxLotScraped } from "@/lib/rainworx-scrape";

/** Igual que `getVehicleKey` del cliente: patente normalizada o vacío si no hay. */
export function normalizePatenteKey(patente: string | undefined): string {
  if (!patente?.trim()) return "";
  return patente.toUpperCase().replace(/\s+/g, "").replace(/-/g, "");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pickDetalle(scraped: RainworxLotScraped, ...labels: string[]): string | undefined {
  for (const label of labels) {
    const v = scraped.detalles[label];
    if (v?.trim()) return v.trim();
  }
  return undefined;
}

function extractYearFromTitle(title?: string): string | undefined {
  if (!title) return undefined;
  const m = title.match(/\b(20\d{2}|19\d{2})\b/);
  return m?.[1];
}

function inferCategoryFromRainworx(tipoVehiculo?: string, tipo?: string): string | undefined {
  const blob = `${tipoVehiculo ?? ""} ${tipo ?? ""}`.toLowerCase();
  if (!blob.trim()) return undefined;
  if (/chatarra|desarme/.test(blob)) return "chatarra";
  if (/maquinaria|excavad|retro|bulldo|motos?niveladora/.test(blob)) return "maquinaria";
  if (/(camion\b|bus\b|tracto|pesad|tolva|semi\b|roller|compactadora)/.test(blob)) return "vehiculo_pesado";
  return "vehiculo_liviano";
}

export function buildRainworxExtendedDescription(scraped: RainworxLotScraped): string {
  const parts: string[] = [];
  parts.push(
    `<p><strong>Información importada desde Rainworx</strong> · <a href="${escapeHtml(scraped.sourceUrl)}" target="_blank" rel="noopener noreferrer">Ver ficha original</a></p>`,
  );
  if (scraped.descripcionHtml?.trim()) {
    parts.push(scraped.descripcionHtml.trim());
  }
  const obs = pickDetalle(scraped, "OBSERVACIONES");
  if (obs) {
    parts.push(`<p><strong>Observaciones (detalle técnico):</strong> ${escapeHtml(obs)}</p>`);
  }
  if (scraped.documentos.length > 0) {
    const lis = scraped.documentos
      .map(
        (d) =>
          `<li><a href="${escapeHtml(d.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(d.label)}</a></li>`,
      )
      .join("");
    parts.push(`<h4>Documentos adicionales</h4><ul>${lis}</ul>`);
  }
  return parts.join("\n");
}

function definedEntries(details: EditorVehicleDetails): Partial<EditorVehicleDetails> {
  const out: Partial<EditorVehicleDetails> = {};
  for (const [k, v] of Object.entries(details) as [keyof EditorVehicleDetails, string | boolean | undefined][]) {
    if (v === undefined) continue;
    if (typeof v === "string" && !v.trim()) continue;
    (out as Record<string, unknown>)[k as string] = v;
  }
  return out;
}

/**
 * Mapea una ficha Rainworx a los campos del editor (identificación, clasificación, técnicos, observaciones HTML).
 */
export function rainworxToEditorVehicleDetails(scraped: RainworxLotScraped): EditorVehicleDetails {
  const tipo = pickDetalle(scraped, "TIPO");
  const tipoVehiculo = pickDetalle(scraped, "TIPO DE VEHICULO");
  const extendedDescription = buildRainworxExtendedDescription(scraped);
  const imagesCsv = scraped.imagenes.filter((u) => u.startsWith("http")).join(", ");
  const observaciones = pickDetalle(scraped, "OBSERVACIONES");

  const draft: EditorVehicleDetails = {
    title: scraped.title,
    subtitle: scraped.subtitle,
    patente: pickDetalle(scraped, "PATENTE"),
    patenteVerifier: pickDetalle(scraped, "Patente Verifier"),
    vin: pickDetalle(scraped, "NRO VIN"),
    nChasis: pickDetalle(scraped, "NRO CHASIS"),
    nMotor: pickDetalle(scraped, "NRO MOTOR"),
    version: pickDetalle(scraped, "VERSION"),
    tipo,
    tipoVehiculo,
    brand: pickDetalle(scraped, "MARCA"),
    model: pickDetalle(scraped, "MODELO"),
    year: extractYearFromTitle(scraped.title) ?? pickDetalle(scraped, "AÑO", "ANO"),
    category: inferCategoryFromRainworx(tipoVehiculo, tipo),
    kilometraje: pickDetalle(scraped, "KILOMETRAJE"),
    color: pickDetalle(scraped, "COLOR"),
    combustible: pickDetalle(scraped, "COMBUSTIBLE"),
    transmision: pickDetalle(scraped, "TRANSMISION"),
    traccion: pickDetalle(scraped, "TRACCION"),
    aro: pickDetalle(scraped, "ARO"),
    cilindrada: pickDetalle(scraped, "CILINDRADA"),
    llaves: pickDetalle(scraped, "LLAVES"),
    aireAcondicionado: pickDetalle(scraped, "AIRE ACONDICIONADO"),
    unicoPropietario: pickDetalle(scraped, "UNICO PROPIETARIO"),
    condicionado: pickDetalle(scraped, "CONDICIONADO"),
    ubicacionFisica: pickDetalle(scraped, "UBICACION"),
    vencPermisoCirculacion: pickDetalle(scraped, "PERMISO DE CIRCULACION VENCE"),
    vencRevisionTecnica: pickDetalle(scraped, "REV TECNICA O HOMOLOGACION VENCE"),
    vencSeguroObligatorio: pickDetalle(scraped, "SEGURO OBLIGATORIO VENCE"),
    pruebaMotor: pickDetalle(scraped, "PRUEBA BASICA MOTOR"),
    pruebaDesplazamiento: pickDetalle(scraped, "PRUEBA BASICA DESPLAZAMIENTO"),
    estadoAirbags: pickDetalle(scraped, "ESTADO AIRBAGS"),
    lot: scraped.loteDisplay,
    description: scraped.subtitle ?? observaciones,
    ...(observaciones && /multa/i.test(observaciones) ? { multas: observaciones } : {}),
    extendedDescription,
    thumbnail: scraped.imagenPrincipal,
    imagesCsv,
  };

  return definedEntries(draft) as EditorVehicleDetails;
}

export function formatClpString(amount: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function mergeEditorVehicleDetails(
  existing: EditorVehicleDetails | undefined,
  incoming: EditorVehicleDetails,
  mode: "rainworx_wins" | "fill_empty",
): EditorVehicleDetails {
  if (mode === "rainworx_wins" || !existing) {
    return { ...(existing ?? {}), ...incoming } as EditorVehicleDetails;
  }
  const base = { ...existing };
  for (const [key, value] of Object.entries(incoming) as [keyof EditorVehicleDetails, string | boolean | undefined][]) {
    if (value === undefined) continue;
    if (typeof value === "string" && !value.trim()) continue;
    const current = base[key];
    const curStr = current === undefined || current === null ? "" : String(current).trim();
    if (!curStr) {
      (base as Record<string, unknown>)[key as string] = value;
    }
  }
  return base;
}
