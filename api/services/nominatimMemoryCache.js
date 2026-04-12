/**
 * Caché en memoria (proceso) para respuestas de búsqueda Nominatim idénticas — reduce carga a la instancia propia.
 * Desactivar: NOMINATIM_ENABLE_CACHE=false
 * TTL: NOMINATIM_CACHE_TTL_MS o NOMINATIM_CACHE_TTL_DAYS (default 7 días)
 * made by leavera77
 */

const cache = new Map();

function cacheTtlMs() {
  const msRaw = process.env.NOMINATIM_CACHE_TTL_MS;
  if (msRaw != null && String(msRaw).trim()) {
    const n = Number(msRaw);
    if (Number.isFinite(n) && n >= 60_000 && n <= 365 * 86400 * 1000) return n;
  }
  const days = Number(process.env.NOMINATIM_CACHE_TTL_DAYS ?? 7);
  const d = Number.isFinite(days) && days > 0 && days <= 365 ? days : 7;
  return d * 86400 * 1000;
}

export function nominatimMemoryCacheEnabled() {
  return process.env.NOMINATIM_ENABLE_CACHE !== "0" && process.env.NOMINATIM_ENABLE_CACHE !== "false";
}

/**
 * @param {string} key
 * @returns {object[] | null}
 */
export function nominatimMemoryCacheGet(key) {
  if (!nominatimMemoryCacheEnabled() || !key) return null;
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.t > cacheTtlMs()) {
    cache.delete(key);
    return null;
  }
  return e.rows;
}

/**
 * @param {string} key
 * @param {object[]} rows
 */
export function nominatimMemoryCacheSet(key, rows) {
  if (!nominatimMemoryCacheEnabled() || !key || !Array.isArray(rows)) return;
  if (cache.size > 5000) {
    const first = cache.keys().next();
    if (!first.done) cache.delete(first.value);
  }
  cache.set(key, { t: Date.now(), rows });
}

/**
 * @param {string} q
 * @param {{ limit?: number, omitCountryCodes?: boolean }} o
 */
export function nominatimMemoryCacheKeyFreeForm(q, o = {}) {
  const s = String(q || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return `ff:${s}:l${o.limit ?? 8}:omit${o.omitCountryCodes ? 1 : 0}`;
}
