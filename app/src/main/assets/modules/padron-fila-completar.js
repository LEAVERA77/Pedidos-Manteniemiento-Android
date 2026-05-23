/**
 * Completa fila del padrón desde BD (delega en padron-fetch-socio-completo).
 * made by leavera77
 */

import { cargarFilaPadronCompletaDesdeBd } from './padron-fetch-socio-completo.js';

/**
 * @param {Parameters<typeof cargarFilaPadronCompletaDesdeBd>[0]} deps
 * @param {Record<string, unknown>} row
 */
export async function enriquecerFilaPadronDesdeBd(deps, row) {
    if (!row || typeof deps.sqlSimple !== 'function') return row;
    return cargarFilaPadronCompletaDesdeBd(deps, row);
}

/** @type {typeof enriquecerFilaPadronDesdeBd} */
export const completarFilaPadronDesdeBd = enriquecerFilaPadronDesdeBd;
