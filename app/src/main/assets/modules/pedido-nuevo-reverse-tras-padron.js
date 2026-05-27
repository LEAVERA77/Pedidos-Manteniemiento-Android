/**
 * Tras elegir socio/NIS en pedido nuevo: re-reverse en el pin (CP/provincia) sin pisar calle/número del padrón.
 * made by leavera77
 */

import { getApp } from './gn-app-global-bridge.js';
import {
    invalidatePedidoNuevoReverseGeoKey,
    reverseNominatimNuevoPedidoCore,
} from './pedido-nuevo-reverse-geo.js';
import { aplicarProvinciaCpFallbackDesdePadron } from './pedido-nuevo-aplicar-padron.js';

/** @returns {{ lat: number, lng: number } | null} */
export function leerCoordenadasPinNuevoPedido() {
    try {
        const app = getApp();
        if (app?.sel) {
            const la = Number(app.sel.lat);
            const lo = Number(app.sel.lng);
            if (Number.isFinite(la) && Number.isFinite(lo)) return { lat: la, lng: lo };
        }
    } catch (_) {}
    const la = parseFloat(String(document.getElementById('li')?.value || '').replace(',', '.'));
    const lo = parseFloat(String(document.getElementById('gi')?.value || '').replace(',', '.'));
    if (Number.isFinite(la) && Number.isFinite(lo)) return { lat: la, lng: lo };
    return null;
}

/**
 * @param {Record<string, unknown>} [row]
 */
export function programarReverseTrasPadronNuevoPedido(row) {
    if (row && typeof row === 'object') aplicarProvinciaCpFallbackDesdePadron(row);
    const c = leerCoordenadasPinNuevoPedido();
    if (!c) return;
    invalidatePedidoNuevoReverseGeoKey();
    setTimeout(() => {
        void reverseNominatimNuevoPedidoCore(c.lat, c.lng);
    }, 0);
}
