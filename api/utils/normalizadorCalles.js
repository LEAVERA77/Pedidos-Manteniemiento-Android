/**
 * Similitud de texto para coincidir calles con errores de tipeo (Jaro-Winkler + Levenshtein).
 * @see https://en.wikipedia.org/wiki/Jaro%E2%80%93Winkler_distance
 *
 * made by leavera77
 */

/** Umbral mínimo de confianza (0–1) para aceptar una calle corregida vs. diccionario / OSM. */
export const UMBRAL_SIMILITUD_CALLE_JW = 0.8;

/**
 * Limpieza para comparación: NFD, minúsculas, sin puntuación redundante.
 */
export function normalizarTextoCalleComparacion(str) {
  return String(str || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.,;:·]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Quita tipo de vía al inicio (p. ej. "avenida") para comparar solo el nombre propio y evitar falsos positivos JW. */
const RE_TIPO_VIA_INICIO =
  /^(avenida|aven|av\.?|avda\.?|boulevard|boulevar|bulevar|bv\.?|bvar\.?|bvd\.?|blvd\.?|calle|pasaje|pje\.?|ruta|diag\.?|diagonal)\s+/gi;

/** Misma lista que `RE_TIPO_VIA_INICIO`, aplicada al texto original (insensible a mayúsculas) para armar `q` Nominatim. */
const RE_TIPO_VIA_PREFIX_STRIP =
  /^(?:avenida|aven|av\.?|avda\.?|boulevard|boulevar|bulevar|bv\.?|bvar\.?|bvd\.?|blvd\.?|calle|pasaje|pje\.?|ruta|diag\.?|diagonal)\s+/i;

/**
 * Calle sin prefijo de tipo de vía al inicio (p. ej. "Av. Mitre" → "Mitre") para búsqueda libre `q`.
 * Representación lógica del producto: segmento 1 de `calleSinPrefijos;numero;ciudad`.
 */
export function calleSinPrefijoTipoViaParaQuery(str) {
  let s = String(str || "")
    .replace(/\s+/g, " ")
    .trim();
  for (let i = 0; i < 6; i++) {
    const t = s.replace(RE_TIPO_VIA_PREFIX_STRIP, "").trim().replace(/\s+/g, " ");
    if (!t || t === s) break;
    s = t;
  }
  return s.trim();
}

/**
 * Núcleo del nombre de vía para similitud (sin prefijo de tipo).
 * Si al quedar prefijos queda vacío o menos de 2 caracteres, devuelve el texto ya normalizado completo.
 * @param {string} str
 * @returns {string}
 */
export function nucleoNombreViaParaSimilitud(str) {
  const full = normalizarTextoCalleComparacion(str);
  if (!full || full.length < 2) return full;
  let core = full;
  for (let i = 0; i < 6; i++) {
    const next = core.replace(RE_TIPO_VIA_INICIO, "").trim().replace(/\s+/g, " ");
    if (!next || next === core) break;
    core = next;
  }
  if (!core || core.length < 2) return full;
  return core;
}

/**
 * Distancia de Levenshtein (edición mínima).
 */
export function levenshteinDistance(a, b) {
  const s = String(a ?? "");
  const t = String(b ?? "");
  const an = s.length;
  const bn = t.length;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix = Array(bn + 1)
    .fill(null)
    .map(() => new Array(an + 1).fill(0));
  for (let i = 0; i <= an; i++) matrix[0][i] = i;
  for (let j = 0; j <= bn; j++) matrix[j][0] = j;
  for (let j = 1; j <= bn; j++) {
    for (let i = 1; i <= an; i++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(matrix[j][i - 1] + 1, matrix[j - 1][i] + 1, matrix[j - 1][i - 1] + cost);
    }
  }
  return matrix[bn][an];
}

/** Similitud Levenshtein en [0,1] (1 = idéntico). */
export function similitudLevenshtein(a, b) {
  const s = normalizarTextoCalleComparacion(a);
  const t = normalizarTextoCalleComparacion(b);
  if (!s.length && !t.length) return 1;
  const d = levenshteinDistance(s, t);
  const maxLen = Math.max(s.length, t.length, 1);
  return 1 - d / maxLen;
}

function jaro(s1, s2) {
  const a = String(s1);
  const b = String(s2);
  if (a === b) return 1;
  const len1 = a.length;
  const len2 = b.length;
  if (!len1 || !len2) return 0;
  const matchDistance = Math.floor(Math.max(len1, len2) / 2) - 1;
  const md = matchDistance < 0 ? 0 : matchDistance;
  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);
  let matches = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - md);
    const end = Math.min(i + md + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || a[i] !== b[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let t = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  t /= 2;
  return (matches / len1 + matches / len2 + (matches - t) / matches) / 3;
}

/**
 * Jaro-Winkler 0–1 (1 = idéntico). Prefijo común aumenta score (útil para calles con tipo de vía).
 * @param {number} [p] — scaling factor (default 0.1)
 * @param {number} [maxPrefix] — longitud máxima de prefijo considerado (default 4)
 */
export function jaroWinklerSimilarity(s1, s2, p = 0.1, maxPrefix = 4) {
  const a = normalizarTextoCalleComparacion(s1);
  const b = normalizarTextoCalleComparacion(s2);
  if (!a.length && !b.length) return 1;
  const j = jaro(a, b);
  let prefix = 0;
  const lim = Math.min(maxPrefix, a.length, b.length);
  for (let i = 0; i < lim; i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }
  return j + prefix * p * (1 - j);
}

/**
 * @param {string} input — calle ingresada
 * @param {Iterable<{ oficial: string, alias?: string[] }>} entradas — oficial + variantes opcionales
 * @param {{ minScore?: number, usarLevenshteinRespaldo?: boolean }} [opts]
 * @returns {{ oficial: string, confianza: number, metodo: string } | null}
 */
export function mejorCoincidenciaDiccionarioCalles(input, entradas, opts = {}) {
  const minScore = opts.minScore != null ? Number(opts.minScore) : UMBRAL_SIMILITUD_CALLE_JW;
  const usarLv = opts.usarLevenshteinRespaldo !== false;
  const inpFull = normalizarTextoCalleComparacion(input);
  if (inpFull.length < 2) return null;
  const leftCore = nucleoNombreViaParaSimilitud(input);
  const left = leftCore.length >= 2 ? leftCore : inpFull;

  let mejorOficial = null;
  let mejorScore = -1;
  let metodo = "jaro_winkler";

  for (const row of entradas) {
    const oficial = row.oficial;
    const alias = Array.isArray(row.alias) ? row.alias : [];
    const cands = [oficial, ...alias];
    for (const c of cands) {
      const raw = String(c || "").trim();
      if (raw.length < 2) continue;
      const rawNorm = normalizarTextoCalleComparacion(raw);
      const rightCore = nucleoNombreViaParaSimilitud(raw);
      const right = rightCore.length >= 2 ? rightCore : rawNorm;
      const jw = jaroWinklerSimilarity(left, right);
      if (jw > mejorScore) {
        mejorScore = jw;
        mejorOficial = oficial;
        metodo = "jaro_winkler";
      }
      if (usarLv) {
        const lv = similitudLevenshtein(left, right);
        if (lv > mejorScore) {
          mejorScore = lv;
          mejorOficial = oficial;
          metodo = "levenshtein";
        }
      }
    }
  }

  if (mejorOficial == null || mejorScore < minScore) return null;
  return { oficial: mejorOficial, confianza: Math.min(1, mejorScore), metodo };
}
