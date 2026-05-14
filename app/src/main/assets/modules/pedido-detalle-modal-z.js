/**
 * Detalle de pedido (#dm): asegura stacking por encima de otros paneles.
 * made by leavera77
 */

import { gnHaySuboverlaySobreDetallePedido } from './gn-modal-z-index-stack.js';

/**
 * @param {HTMLElement | null} dmEl
 * @param {(el: HTMLElement) => void} gnForceModalZFront
 */
export function pedidoDetalleTraerModalAlFrente(dmEl, gnForceModalZFront) {
    try {
        if (!dmEl || typeof gnForceModalZFront !== 'function') return;
        if (gnHaySuboverlaySobreDetallePedido()) return;
        gnForceModalZFront(dmEl);
    } catch (_) {}
}
