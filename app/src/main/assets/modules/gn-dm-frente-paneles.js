/**
 * Detalle #dm al frente con búsqueda Ctrl+K o panel #bp2 abiertos detrás (no se cierran).
 * made by leavera77
 */

import { busquedaGlobalEstaAbierta } from './gn-global-search-detalle-stack.js';

const CLASS_DM_FRONT = 'gn-dm-frente-paneles';
const CLASS_SEARCH = 'gn-global-search-con-detalle';

/** @type {MutationObserver | null} */
let _obsDm = null;

export function bp2PanelVisibleParaDetalle() {
    try {
        const bp2 = document.getElementById('bp2');
        return !!(bp2 && !bp2.classList.contains('bp2-fullhide'));
    } catch (_) {
        return false;
    }
}

function syncDmFrentePaneles() {
    const dm = document.getElementById('dm');
    const active = !!dm?.classList.contains('active');
    if (!active) {
        try {
            document.body.classList.remove(CLASS_DM_FRONT);
            document.body.classList.remove(CLASS_SEARCH);
        } catch (_) {}
        return;
    }
    const search = busquedaGlobalEstaAbierta();
    const bp2 = bp2PanelVisibleParaDetalle();
    try {
        if (search || bp2) document.body.classList.add(CLASS_DM_FRONT);
        else document.body.classList.remove(CLASS_DM_FRONT);
        if (search) document.body.classList.add(CLASS_SEARCH);
        else document.body.classList.remove(CLASS_SEARCH);
    } catch (_) {}
}

export function installGnDmFrentePaneles() {
    const dm = document.getElementById('dm');
    if (!dm || _obsDm) return;
    _obsDm = new MutationObserver(syncDmFrentePaneles);
    _obsDm.observe(dm, { attributes: true, attributeFilter: ['class'] });
    const bp2 = document.getElementById('bp2');
    if (bp2) {
        new MutationObserver(syncDmFrentePaneles).observe(bp2, {
            attributes: true,
            attributeFilter: ['class'],
        });
    }
    syncDmFrentePaneles();
}
