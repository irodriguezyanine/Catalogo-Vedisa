/** Normaliza respuestas Glo3D/Rainworx (frases o SI/NO) al formato del editor. */

function normTxt(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function coerceSiNoSpanish(raw?: string): "SI" | "NO" | undefined {
  if (!raw?.trim()) return undefined;
  const t = normTxt(raw);
  if (/^(si|s|yes|true|1)$/.test(t)) return "SI";
  if (/^(no|n|false|0)$/.test(t)) return "NO";
  return undefined;
}

/**
 * Glo3D suele devolver "Motor arranca", "SI" o variantes negativas.
 * Vacío → sin valor; afirmativo → SI; cualquier otro texto con contenido → NO.
 */
export function mapPruebaMotorToSiNo(raw?: string): "SI" | "NO" | undefined {
  if (!raw?.trim()) return undefined;
  const coerced = coerceSiNoSpanish(raw);
  if (coerced) return coerced;
  const t = normTxt(raw);
  if (/no\s*arranca|motor\s*no|no\s*funciona|no\s*enciende|averia|aver[ií]a/.test(t)) return "NO";
  if (/motor\s*arranca|\barranca\b|funcionando|operativo|ok\s*motor/.test(t)) return "SI";
  return "NO";
}

/**
 * Glo3D suele devolver "Se desplaza", "SI" o variantes negativas.
 */
export function mapPruebaDesplazamientoToSiNo(raw?: string): "SI" | "NO" | undefined {
  if (!raw?.trim()) return undefined;
  const coerced = coerceSiNoSpanish(raw);
  if (coerced) return coerced;
  const t = normTxt(raw);
  if (/no\s*se\s*desplaza|no\s*desplaza|no\s*mueve|inmovil|bloquead|en\s*panne/.test(t)) return "NO";
  if (/se\s*desplaza|\bdesplaza\b|se\s*mueve|rodar|en\s*movimiento/.test(t)) return "SI";
  return "NO";
}

export const PRUEBA_MOTOR_LOOKUP_KEYS = [
  "prueba_motor",
  "prueba_motor_arranca",
  "pdm",
  "motor_arranca",
  "motor arranca",
] as const;

export const PRUEBA_DESPLAZAMIENTO_LOOKUP_KEYS = [
  "prueba_desplazamiento",
  "prueba_desplazamiento_mueve",
  "pdd",
  "se_desplaza",
  "se desplaza",
] as const;

export function resolvePruebaMotorSiNo(...candidates: Array<string | undefined>): string {
  for (const raw of candidates) {
    const mapped = mapPruebaMotorToSiNo(raw);
    if (mapped) return mapped;
  }
  return "";
}

export function resolvePruebaDesplazamientoSiNo(...candidates: Array<string | undefined>): string {
  for (const raw of candidates) {
    const mapped = mapPruebaDesplazamientoToSiNo(raw);
    if (mapped) return mapped;
  }
  return "";
}
