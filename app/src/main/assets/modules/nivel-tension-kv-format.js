/**
 * Formato kV Red Eléctrica: enteros sin punto (33, 132); decimal solo con flag.
 * made by leavera77
 */

/** @param {unknown} dbValue @param {boolean} [kvDecimal] */
export function formatNivelTensionKvFromDb(dbValue, kvDecimal = false) {
  const v = Number(dbValue);
  if (!Number.isFinite(v) || v <= 0) return '0';
  if (kvDecimal) {
    const kv = v / 10;
    const rounded = Math.round(kv * 10) / 10;
    if (Number.isInteger(rounded)) return String(rounded);
    return rounded.toFixed(1);
  }
  return String(Math.round(v));
}

/** @param {unknown} dbValue @param {boolean} [kvDecimal] */
export function etiquetaGrupoTensionKv(dbValue, kvDecimal = false) {
  const kv = formatNivelTensionKvFromDb(dbValue, kvDecimal);
  if (!kv || kv === '0') return 'Sin clasificar';
  return `${kv} kV`;
}
