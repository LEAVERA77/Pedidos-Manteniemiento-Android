/**
 * Intenta extraer calle, número y localidad desde texto libre típico en AR
 * (ej. "Doctor Haedo 365, Hasenkamp").
 * @param {string} cdir
 * @param {string|null|undefined} localidadFallback — si hay "calle número" sin localidad en el texto
 * @returns {{ calle: string, numero: string, localidad: string } | null}
 */
export function parseDomicilioLibreArgentina(cdir, localidadFallback = null) {
  const raw = String(cdir || "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,.;-]+|[\s,.;-]+$/g, "")
    .trim();
  if (!raw) return null;
  const fb =
    localidadFallback != null && String(localidadFallback).trim() ? String(localidadFallback).trim() : null;

  const mComa = raw.match(/^(.+?)\s+(\d{1,6})\s*[,;]\s*(.+)$/i);
  if (mComa) {
    return {
      calle: mComa[1].trim(),
      numero: mComa[2].trim(),
      localidad: mComa[3].trim(),
    };
  }

  const soloNum = raw.match(/^(.+?)\s+(\d{1,6})$/);
  if (soloNum && fb) {
    return {
      calle: soloNum[1].trim(),
      numero: soloNum[2].trim(),
      localidad: fb,
    };
  }

  const triple = raw.match(
    /^(.+?)\s+(\d{1,6})\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s\-.]{2,79})$/u
  );
  if (triple) {
    const locCand = triple[3].trim();
    if (!/^\d+$/.test(locCand) && locCand.length >= 3) {
      return {
        calle: triple[1].trim(),
        numero: triple[2].trim(),
        localidad: locCand,
      };
    }
  }

  return null;
}
