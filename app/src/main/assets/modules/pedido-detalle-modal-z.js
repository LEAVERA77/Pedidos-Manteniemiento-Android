/**
 * Detalle de pedido (#dm): asegura stacking por encima de otros paneles.
 * made by leavera77
 */

/**
 * @param {HTMLElement | null} dmEl
 * @param {(el: HTMLElement) => void} gnForceModalZFront
 */
export function pedidoDetalleTraerModalAlFrente(dmEl, gnForceModalZFront) {
    try {
        if (dmEl && typeof gnForceModalZFront === 'function') gnForceModalZFront(dmEl);
    } catch (_) {}
}
