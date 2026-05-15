/**
 * Sincroniza el modal de detalle (#dm) con el pedido activo (dataset + referencia global).
 * made by leavera77
 */

/**
 * @param {{ id: unknown }} p
 * @returns {string}
 */
export function sincronizarPedidoDetalleModalActivo(p) {
    const pidKey = String(p.id);
    try {
        const dmRoot = document.getElementById('dm');
        if (dmRoot) dmRoot.dataset.detallePedidoId = pidKey;
    } catch (_) {}
    try {
        window.__gnDetallePedidoActivo = p;
    } catch (_) {}
    return pidKey;
}
