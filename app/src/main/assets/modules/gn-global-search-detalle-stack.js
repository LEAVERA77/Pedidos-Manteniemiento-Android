/**
 * Búsqueda global abierta + detalle #dm: el detalle va al frente; la búsqueda sigue activa detrás.
 * made by leavera77
 */

const BODY_CLASS = 'gn-global-search-con-detalle';
const MODAL_ID = 'gn-global-search-modal';

/** @type {MutationObserver | null} */
let _obsDm = null;

export function busquedaGlobalEstaAbierta() {
    try {
        return document.getElementById(MODAL_ID)?.classList.contains('active') === true;
    } catch (_) {
        return false;
    }
}

export function marcarBusquedaGlobalConDetalle() {
    try {
        document.body.classList.add(BODY_CLASS);
    } catch (_) {}
}

export function desmarcarBusquedaGlobalConDetalle() {
    try {
        document.body.classList.remove(BODY_CLASS);
    } catch (_) {}
}

function syncStackDesdeDm() {
    const dm = document.getElementById('dm');
    if (!dm) return;
    if (dm.classList.contains('active') && busquedaGlobalEstaAbierta()) {
        marcarBusquedaGlobalConDetalle();
    } else {
        desmarcarBusquedaGlobalConDetalle();
    }
}

export function installGnGlobalSearchDetalleStack() {
    const dm = document.getElementById('dm');
    if (!dm || _obsDm) return;
    _obsDm = new MutationObserver(syncStackDesdeDm);
    _obsDm.observe(dm, { attributes: true, attributeFilter: ['class'] });
    syncStackDesdeDm();
}
