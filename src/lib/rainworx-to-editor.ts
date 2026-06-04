import type { EditorVehicleDetails } from "@/types/editor";
import type { RainworxLotScraped } from "@/lib/rainworx-scrape";
import { cloudinaryRawPdfUrlForInlineDisplay } from "@/lib/cloudinary-delivery";

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

/** Texto comparable: minúsculas, sin tildes. */
function normTxt(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/**
 * Rainworx envía frases ("MOTOR ARRANCA") pero el editor solo acepta SI/NO.
 */
function mapPruebaMotorToSiNo(raw?: string): string | undefined {
  if (!raw?.trim()) return undefined;
  const coerced = coerceSiNoSpanish(raw);
  if (coerced) return coerced;
  const t = normTxt(raw);
  if (/no\s*arranca|motor\s*no|no\s*funciona|averia|averia\s*motor|reparaci[oó]n\s*mayor\s*motor/.test(t)) return "NO";
  if (/motor\s*arranca|\barranca\b|funcionando|operativo|ok\s*motor/.test(t)) return "SI";
  return undefined;
}

function mapPruebaDesplazamientoToSiNo(raw?: string): string | undefined {
  if (!raw?.trim()) return undefined;
  const coerced = coerceSiNoSpanish(raw);
  if (coerced) return coerced;
  const t = normTxt(raw);
  if (/no\s*se\s*desplaza|no\s*desplaza|no\s*mueve|inmovil|bloquead|en\s*panne/.test(t)) return "NO";
  if (/se\s*desplaza|\bdesplaza\b|se\s*mueve|rodar|en\s*movimiento/.test(t)) return "SI";
  return undefined;
}

/** Campos tipo SI/NO que a veces vienen "Si", "Sí", "true", etc. */
function coerceSiNoSpanish(raw?: string): string | undefined {
  if (!raw?.trim()) return undefined;
  const t = normTxt(raw);
  if (/^(si|s|yes|true|1)$/.test(t)) return "SI";
  if (/^(no|n|false|0)$/.test(t)) return "NO";
  return undefined;
}

const MES_3: Record<string, number> = {
  ENE: 1,
  FEB: 2,
  MAR: 3,
  ABR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AGO: 8,
  SEP: 9,
  SEPT: 9,
  OCT: 10,
  NOV: 11,
  DIC: 12,
  JAN: 1,
  APR: 4,
  AUG: 8,
  DEC: 12,
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Quita "FOTOCOPIA" y devuelve fecha DD/MM/YYYY válida para el editor, o undefined.
 */
export function normalizeRainworxVencimientoDate(raw?: string): string | undefined {
  if (!raw?.trim()) return undefined;
  let s = raw
    .replace(/\bFOTOCOP(IAS?|Y)?\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return undefined;

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [dd, mm, yyyy] = s.split("/").map(Number);
    const date = new Date(yyyy, mm - 1, dd);
    if (
      !Number.isNaN(date.getTime()) &&
      date.getFullYear() === yyyy &&
      date.getMonth() === mm - 1 &&
      date.getDate() === dd
    ) {
      return `${pad2(dd)}/${pad2(mm)}/${yyyy}`;
    }
    return undefined;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    if (
      !Number.isNaN(date.getTime()) &&
      date.getFullYear() === y &&
      date.getMonth() === m - 1 &&
      date.getDate() === d
    ) {
      return `${pad2(d)}/${pad2(m)}/${y}`;
    }
    return undefined;
  }

  const dmyShort = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2}|\d{4})$/);
  if (dmyShort) {
    const dd = Number(dmyShort[1]);
    const mm = Number(dmyShort[2]);
    let yyyy = Number(dmyShort[3]);
    if (yyyy < 100) yyyy += 2000;
    const date = new Date(yyyy, mm - 1, dd);
    if (
      !Number.isNaN(date.getTime()) &&
      date.getFullYear() === yyyy &&
      date.getMonth() === mm - 1 &&
      date.getDate() === dd
    ) {
      return `${pad2(dd)}/${pad2(mm)}/${yyyy}`;
    }
    return undefined;
  }

  const mesAnio = s.match(/^([A-ZÁÉÍÓÚÑ]{3,9})\s+(\d{2}|\d{4})$/i);
  if (mesAnio) {
    let mesTok = mesAnio[1].toUpperCase().normalize("NFD").replace(/\p{M}/gu, "");
    if (mesTok.length > 3) mesTok = mesTok.slice(0, 3);
    const month = MES_3[mesTok];
    if (!month) return undefined;
    let year = Number(mesAnio[2]);
    if (year < 100) year += 2000;
    return `${pad2(1)}/${pad2(month)}/${year}`;
  }

  const embeddedMes = s.match(
    /\b(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|SEPT|OCT|NOV|DIC|JAN|APR|AUG|DEC)\b\.?\s*(\d{2}|\d{4})\b/i,
  );
  if (embeddedMes) {
    let mesTok = embeddedMes[1].toUpperCase();
    if (mesTok === "SEPT") mesTok = "SEP";
    if (mesTok.length > 3) mesTok = mesTok.slice(0, 3);
    const month = MES_3[mesTok];
    if (month) {
      let year = Number(embeddedMes[2]);
      if (year < 100) year += 2000;
      return `${pad2(1)}/${pad2(month)}/${year}`;
    }
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
          `<li><a href="${escapeHtml(cloudinaryRawPdfUrlForInlineDisplay(d.url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(d.label)}</a></li>`,
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
    llaves: coerceSiNoSpanish(pickDetalle(scraped, "LLAVES")),
    aireAcondicionado: coerceSiNoSpanish(pickDetalle(scraped, "AIRE ACONDICIONADO")),
    unicoPropietario: coerceSiNoSpanish(pickDetalle(scraped, "UNICO PROPIETARIO")),
    condicionado: coerceSiNoSpanish(pickDetalle(scraped, "CONDICIONADO")),
    ubicacionFisica: pickDetalle(scraped, "UBICACION"),
    vencPermisoCirculacion: normalizeRainworxVencimientoDate(
      pickDetalle(scraped, "PERMISO DE CIRCULACION VENCE"),
    ),
    vencRevisionTecnica: normalizeRainworxVencimientoDate(
      pickDetalle(scraped, "REV TECNICA O HOMOLOGACION VENCE"),
    ),
    vencSeguroObligatorio: normalizeRainworxVencimientoDate(
      pickDetalle(scraped, "SEGURO OBLIGATORIO VENCE"),
    ),
    pruebaMotor: mapPruebaMotorToSiNo(pickDetalle(scraped, "PRUEBA BASICA MOTOR")),
    pruebaDesplazamiento: mapPruebaDesplazamientoToSiNo(
      pickDetalle(scraped, "PRUEBA BASICA DESPLAZAMIENTO"),
    ),
    estadoAirbags: pickDetalle(scraped, "ESTADO AIRBAGS"),
    lot: scraped.loteDisplay,
    description: scraped.subtitle ?? observaciones,
    ...(observaciones && /multa/i.test(observaciones) ? { multas: observaciones } : {}),
    extendedDescription,
    ...(scraped.documentos.length > 0
      ? { lotDocumentsJson: JSON.stringify(scraped.documentos) }
      : {}),
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
