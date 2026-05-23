/**
 * Toasts del flujo padrón / pedido nuevo: visibles sobre modales, duración moderada.
 * made by leavera77
 */

import { toast } from './ui-utils.js';

let _ultimaClave = '';
let _ultimaClaveAt = 0;

/**
 * @param {string} msg
 * @param {'info'|'success'|'error'|'warning'} [tipo]
 * @param {number} [durationMs]
 * @param {string} [claveDedupe] si se repite la misma clave en &lt;8s, no vuelve a mostrar
 */
export function toastPedidoPadron(msg, tipo = 'info', durationMs, claveDedupe) {
    if (claveDedupe) {
        const now = Date.now();
        if (_ultimaClave === claveDedupe && now - _ultimaClaveAt < 8000) return;
        _ultimaClave = claveDedupe;
        _ultimaClaveAt = now;
    }
    const t = tipo || 'info';
    const def =
        t === 'error' ? 5200 : t === 'success' ? 3200 : t === 'warning' ? 4500 : 3800;
    toast(msg, t, durationMs != null ? durationMs : def);
}

export function resetToastPedidoPadronDedupe() {
    _ultimaClave = '';
    _ultimaClaveAt = 0;
}
