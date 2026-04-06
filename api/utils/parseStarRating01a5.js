/** Normaliza texto para comparar palabras (es-AR). */
function normalizeLow(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[!?.¡¿…]+$/g, "")
    .trim();
}

function primeraLinea(text) {
  const s = String(text || "");
  const i = s.indexOf("\n");
  return (i === -1 ? s : s.slice(0, i)).trim();
}

/**
 * Interpreta calificación 1–5 (número, palabra o estrellas Unicode).
 * @returns {number|null}
 */
export function parseStarRating01a5(raw) {
  const t = primeraLinea(raw).trim();
  if (!t) return null;
  const low = normalizeLow(t);
  const digit = /^([1-5])$/.exec(t);
  if (digit) return parseInt(digit[1], 10);
  const map = { uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5 };
  if (map[low] != null) return map[low];
  const mStar = t.match(/[\u2B50\u2605\u272F]/g);
  if (mStar && mStar.length >= 1 && mStar.length <= 5) return mStar.length;
  const mNum = low.match(/\b([1-5])\b/);
  if (mNum) return parseInt(mNum[1], 10);
  return null;
}
