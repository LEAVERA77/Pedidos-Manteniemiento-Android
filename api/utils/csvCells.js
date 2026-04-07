/**
 * Escapa un valor para una celda CSV (RFC 4180 simplificado).
 * @param {unknown} val
 * @returns {string}
 */
export function escapeCsvCell(val) {
  const s = String(val ?? "");
  if (/[\r\n",]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
