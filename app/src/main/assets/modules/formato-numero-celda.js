/**
 * Formato numérico para celdas <td> (un decimal).
 * made by leavera77
 */

/** Valor numérico en tabla: siempre un decimal; texto no numérico sin cambiar. */
export function formatearValorNumeroTablaUnDecimal(v) {
    if (v == null || v === '') return '—';
    const n = Number(typeof v === 'string' ? String(v).trim().replace(',', '.') : v);
    if (!Number.isFinite(n)) return String(v);
    return (Math.round(n * 10) / 10).toFixed(1);
}

/** Si el texto parece número, aplica un decimal; si no, devuelve el texto. */
export function formatearCeldaTextoSiNumero(v) {
    if (v == null || v === '') return '—';
    const s = String(v).trim();
    if (!s) return '—';
    const n = Number(s.replace(',', '.'));
    if (Number.isFinite(n) && /^-?\d+([.,]\d+)?$/.test(s.replace(/\s/g, ''))) {
        return formatearValorNumeroTablaUnDecimal(n);
    }
    return s;
}
