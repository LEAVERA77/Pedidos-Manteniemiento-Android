/**
 * Abrir detalle (#dm) sin cerrar panel admin ni lista de búsqueda.
 * made by leavera77
 */

import { gnForceModalZFront } from './gn-modal-z-index-stack.js';
import { toast } from './ui-utils.js';

function apiUrl(path) {
    return typeof window.apiUrl === 'function' ? window.apiUrl(path) : path;
}

function getTok() {
    return typeof window.getApiToken === 'function' ? window.getApiToken() : '';
}

async function cargarPedidoPorIdDesdeApi(id, opts) {
    if (opts.neonOk?.() && typeof opts.sqlSimple === 'function' && typeof opts.esc === 'function') {
        try {
            const r = await opts.sqlSimple(`SELECT * FROM pedidos WHERE id = ${opts.esc(id)} LIMIT 1`);
            const raw = r.rows?.[0];
            const norm =
                typeof window.gnNormPedidoDesdeApi === 'function' ? window.gnNormPedidoDesdeApi : null;
            if (raw && norm) return norm(raw);
        } catch (e) {
            console.warn('[abrirDetallePedidoPorId] sql', e?.message || e);
        }
    }
    const tok = getTok();
    const norm = typeof window.gnNormPedidoDesdeApi === 'function' ? window.gnNormPedidoDesdeApi : null;
    if (!tok || !norm) return null;
    try {
        if (typeof window.asegurarJwtApiRest === 'function') {
            await window.asegurarJwtApiRest();
        }
        const r = await fetch(apiUrl(`/api/pedidos/${encodeURIComponent(String(id))}`), {
            headers: { Authorization: `Bearer ${tok}` },
            cache: 'no-store',
        });
        const raw = await r.json().catch(() => ({}));
        if (!r.ok) {
            console.warn('[abrirDetallePedidoPorId] api', raw.error || r.status);
            return null;
        }
        const p = norm(raw);
        if (p && Array.isArray(window.app?.p)) {
            const idx = window.app.p.findIndex((x) => String(x.id) === String(id));
            if (idx >= 0) window.app.p[idx] = p;
            else window.app.p.push(p);
        }
        return p;
    } catch (e) {
        console.warn('[abrirDetallePedidoPorId] fetch', e?.message || e);
        return null;
    }
}

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

    if (!p) {
        p = await cargarPedidoPorIdDesdeApi(id, opts);
    }

    if (!p) {
        toast('Pedido no encontrado. Recargá pedidos o probá de nuevo.', 'warning');
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
