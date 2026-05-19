/**
 * Evita recargas repetidas de materiales en pedidos cerrados (parpadeo / re-apertura modal).
 * made by leavera77
 */

const _inflight = new Map();

/**
 * @param {object} p pedido
 * @param {HTMLElement|null} body #materiales-detalle-body
 */
export function materialesDetalleDebeOmitirRecarga(p, body) {
    if (!p || !body) return true;
    const pid = String(p.id);
    if (p.es !== 'Cerrado') return false;
    const ya = body.dataset.stableMatPid === pid;
    const tabla = body.querySelector('table.mat-det-table');
    return !!(ya && tabla);
}

export function materialesDetalleMarcarEstable(body, pedidoId) {
    if (body) body.dataset.stableMatPid = String(pedidoId);
}

export function materialesDetalleLimpiarAlCerrarModal() {
    const body = document.getElementById('materiales-detalle-body');
    if (body) delete body.dataset.stableMatPid;
}

export function materialesDetalleIniciarCarga(pid) {
    const k = String(pid);
    if (_inflight.get(k)) return false;
    _inflight.set(k, Date.now());
    return true;
}

export function materialesDetalleFinCarga(pid) {
    _inflight.delete(String(pid));
}
