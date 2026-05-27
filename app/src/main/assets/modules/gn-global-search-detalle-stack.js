/**
 * Búsqueda global abierta + detalle #dm (reexporta stack unificado en gn-dm-frente-paneles).
 * made by leavera77
 */

const MODAL_ID = 'gn-global-search-modal';

export function busquedaGlobalEstaAbierta() {
    try {
        return document.getElementById(MODAL_ID)?.classList.contains('active') === true;
    } catch (_) {
        return false;
    }
}

export { installGnDmFrentePaneles as installGnGlobalSearchDetalleStack } from './gn-dm-frente-paneles.js';
