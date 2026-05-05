/**
 * Admin: volver a Pendiente un pedido en «Derivado externo» (PUT /api/pedidos/:id).
 * made by leavera77
 */

import { toast } from './ui-utils.js';

/** @type {null | {
 *   esAdmin: () => boolean,
 *   modoOffline: () => boolean,
 *   pedidoPutApi: (id: string|number, body: Record<string, unknown>) => Promise<Record<string, unknown>|null>,
 *   norm: (row: Record<string, unknown>) => Record<string, unknown>,
 *   app: () => { p: unknown[] },
 *   offlinePedidosSave: (p: unknown[]) => void,
 *   render: () => void,
 *   detalle: (p: Record<string, unknown>, opts?: Record<string, unknown>) => Promise<void>,
 * }} */
let _deps = null;

export function installPedidoVolverPendiente(deps) {
    _deps = deps;
}

export async function gnVolverPedidoAPendiente(pidStr) {
    const deps = _deps;
    if (!deps || !deps.esAdmin()) return;
    if (
        !confirm(
            '¿Volver este pedido a estado Pendiente? Se eliminará la derivación externa y volverá a la operativa normal del tenant.'
        )
    ) {
        return;
    }
    if (deps.modoOffline()) {
        toast('No disponible en modo sin conexión', 'error');
        return;
    }
    const pid = parseInt(pidStr, 10);
    if (!Number.isFinite(pid) || pid <= 0) return;
    try {
        const apiRow = await deps.pedidoPutApi(pid, { estado: 'Pendiente' });
        if (!apiRow) {
            toast('No se pudo actualizar el pedido (API o sesión).', 'error');
            return;
        }
        const merged = deps.norm(apiRow);
        const ix = deps.app().p.findIndex((x) => String(x.id) === String(pid));
        if (ix !== -1) deps.app().p[ix] = merged;
        try {
            deps.offlinePedidosSave(deps.app().p);
        } catch (_) {}
        deps.render();
        await deps.detalle(merged, { skipBackgroundRefetch: true });
        toast('✅ Pedido vuelto a Pendiente', 'success');
    } catch (e) {
        toast(String(e && e.message ? e.message : e), 'error');
    }
}

export function syncPedidoVolverPendienteButton(p) {
    if (!_deps || !p) return;
    try {
        const da = document.querySelector('#dm .gn-dm-actions-bar .da');
        if (!da) return;
        da.querySelector('button.btn-volver-pendiente')?.remove();
        if (
            !_deps.esAdmin() ||
            _deps.modoOffline() ||
            String(p.id || '').startsWith('off_') ||
            String(p.es || '') !== 'Derivado externo'
        ) {
            return;
        }
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ba2 btn-volver-pendiente';
        btn.innerHTML = '<i class="fas fa-undo"></i> 🔄 Volver a Pendiente';
        btn.title = 'Quita la derivación externa y restaura el pedido a Pendiente';
        btn.addEventListener('click', () => {
            void gnVolverPedidoAPendiente(String(p.id));
        });
        da.insertBefore(btn, da.firstChild);
    } catch (_) {}
}

if (typeof window !== 'undefined') {
    window.gnVolverPedidoAPendiente = gnVolverPedidoAPendiente;
}
