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

/** Antes de abrir #dm desde Ctrl+K: mantener búsqueda visible detrás del detalle. */
export function marcarBusquedaGlobalConDetalle() {
    try {
        if (!busquedaGlobalEstaAbierta()) return;
        document.body.classList.add('gn-global-search-con-detalle');
        document.body.classList.add('gn-dm-frente-paneles');
    } catch (_) {}
}

export { installGnDmFrentePaneles as installGnGlobalSearchDetalleStack } from './gn-dm-frente-paneles.js';
