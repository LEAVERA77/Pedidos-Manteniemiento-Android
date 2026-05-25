/**
 * Formato kV para Red Eléctrica (BD guarda décimas: 13,2 → 132).
 * made by leavera77
 */

/** @param {unknown} dbValue */
export function formatNivelTensionKvFromDb(dbValue) {
  const v = Number(dbValue);
  if (!Number.isFinite(v) || v <= 0) return '0';
  const kv = v / 10;
  const rounded = Math.round(kv * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** @param {unknown} dbValue — etiqueta grupo en select #di2 */
export function etiquetaGrupoTensionKv(dbValue) {
  const kv = formatNivelTensionKvFromDb(dbValue);
  if (!kv || kv === '0') return 'Sin clasificar';
  return `${kv} kV`;
}
