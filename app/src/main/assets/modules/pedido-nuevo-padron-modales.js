/**
 * Modales de pedido nuevo (#pm mapa, #pm-oficina): mismo formulario #pf.
 * made by leavera77
 */

/** @returns {HTMLElement[]} */
export function modalesPedidoNuevo() {
    const ids = ['pm', 'pm-oficina'];
    /** @type {HTMLElement[]} */
    const out = [];
    for (const id of ids) {
        const el = document.getElementById(id);
        if (el) out.push(el);
    }
    return out;
}

/**
 * @param {(modal: HTMLElement) => void} fn
 */
export function forEachModalPedidoNuevo(fn) {
    for (const m of modalesPedidoNuevo()) {
        try {
            fn(m);
        } catch (_) {}
    }
}
