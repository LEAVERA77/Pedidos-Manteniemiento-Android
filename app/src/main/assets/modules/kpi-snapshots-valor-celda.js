/**
 * Formato valor_numero en listado KPI (evita inflar app.js).
 * made by leavera77
 */

import { formatearValorNumeroTablaUnDecimal } from './formato-numero-celda.js';

/** @param {unknown} v */
export function formatearKpiValorNumeroCelda(v) {
    return formatearValorNumeroTablaUnDecimal(v);
}

if (typeof window !== 'undefined') {
    window.gnFormatearKpiValorNumeroCelda = formatearKpiValorNumeroCelda;
}
