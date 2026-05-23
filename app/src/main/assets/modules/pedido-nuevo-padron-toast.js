/**
 * Toasts del flujo padrón / pedido nuevo: visibles sobre modales, duración moderada.
 * made by leavera77
 */

import { toast } from './ui-utils.js';

/**
 * @param {string} msg
 * @param {'info'|'success'|'error'|'warning'} [tipo]
 * @param {number} [durationMs]
 */
export function toastPedidoPadron(msg, tipo = 'info', durationMs) {
    const t = tipo || 'info';
    const def =
        t === 'error' ? 5200 : t === 'success' ? 3200 : t === 'warning' ? 4500 : 3800;
    toast(msg, t, durationMs != null ? durationMs : def);
}
