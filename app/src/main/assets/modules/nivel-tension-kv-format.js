/**
 * Formato kV Red Eléctrica: mismo valor que Neon/Excel (33 → 33, 132 → 132, 13.2 → 13.2).
 * made by leavera77
 */

/** @param {unknown} dbValue */
export function formatNivelTensionKvFromDb(dbValue) {
  const v = Number(dbValue);
  if (!Number.isFinite(v) || v <= 0) return '0';
  const rounded = Math.round(v * 1000) / 1000;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-9) {
    return String(Math.round(rounded));
  }
  let s = rounded.toFixed(2);
  s = s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  return s;
}

/** @param {unknown} dbValue */
export function etiquetaGrupoTensionKv(dbValue) {
  const kv = formatNivelTensionKvFromDb(dbValue);
  if (!kv || kv === '0') return 'Sin clasificar';
  return `${kv} kV`;
}
