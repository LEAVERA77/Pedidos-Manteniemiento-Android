/**
 * Abrir detalle (#dm) sin cerrar panel admin ni lista de búsqueda.
 * made by leavera77
 */

import { gnForceModalZFront } from './gn-modal-z-index-stack.js';
import { toast } from './ui-utils.js';

/**
 * @param {number|string} pid
 * @param {{ adminTab?: string|null, sqlSimple?: Function, esc?: Function, neonOk?: () => boolean }} [opts]
 */
export async function abrirDetallePedidoPorId(pid, opts = {}) {
    const id = Number(pid);
    if (!Number.isFinite(id) || id <= 0) return;

    const adminTab = opts.adminTab != null ? String(opts.adminTab) : 'socios';
    try {
        const ap = document.getElementById('admin-panel');
        if (ap && adminTab) {
            ap.classList.add('active');
            window.__gnAdminReopenTabTrasDetalle = adminTab;
        }
    } catch (_) {}

    let p = null;
    try {
        p = window.app?.p?.find((x) => String(x.id) === String(id)) || null;
    } catch (_) {}

    if (!p && opts.neonOk?.() && typeof opts.sqlSimple === 'function' && typeof opts.esc === 'function') {
        try {
            const r = await opts.sqlSimple(`SELECT * FROM pedidos WHERE id = ${opts.esc(id)} LIMIT 1`);
            const raw = r.rows?.[0];
            const norm =
                typeof window.gnNormPedidoDesdeApi === 'function' ? window.gnNormPedidoDesdeApi : null;
            if (raw && norm) p = norm(raw);
        } catch (e) {
            console.warn('[abrirDetallePedidoPorId]', e?.message || e);
        }
    }

    if (!p) {
        toast('Pedido no encontrado en la sesión. Recargá pedidos o probá de nuevo.', 'warning');
        return;
    }

    if (typeof window.detalle !== 'function') {
        toast('No se pudo abrir el detalle.', 'error');
        return;
    }
    await window.detalle(p);
    try {
        gnForceModalZFront(document.getElementById('dm'));
    } catch (_) {}
}
