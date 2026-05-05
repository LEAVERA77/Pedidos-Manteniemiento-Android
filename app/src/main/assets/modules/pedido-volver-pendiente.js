/**
 * Admin: volver a Pendiente un pedido en «Derivado externo» (PUT /api/pedidos/:id).
 * Historial de derivación externa se conserva en BD y se muestra en el modal si aplica.
 * made by leavera77
 */

import { toast } from './ui-utils.js';
/** Registra observer + `window.injectPedidoVerImagenReclamo` (el wrapper de `detalle` aquí no reemplaza al global de app.js). */
import './pedido-ver-imagen.js';

/** @type {Map<string, { frp: string|null, urvid: number|null }>} */
const _reversionApiCache = new Map();

function escHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function nombreUsuarioCache(id) {
    if (id == null || id === '') return null;
    try {
        const u = window.app?.usuariosCache?.find((x) => String(x.id) === String(id));
        return u?.nombre ? String(u.nombre).trim() : null;
    } catch (_) {
        return null;
    }
}

function debeMostrarHistorialDerivacionRevertida(p) {
    if (!p || String(p.es || '') === 'Derivado externo') return false;
    if (p.dex === true || p.dex === 1 || p.dex === 't') return false;
    return !!p.fder;
}

/**
 * Campos no incluidos en `norm()`; GET /api/pedidos/:id los devuelve si existen columnas en Neon.
 */
async function enriquecerReversionDesdeApiSiFalta(p) {
    if (!p?.id || String(p.id).startsWith('off_')) return p;
    if (p.frp != null && p.frp !== '') return p;
    const idStr = String(p.id);
    if (_reversionApiCache.has(idStr)) {
        const c = _reversionApiCache.get(idStr);
        p.frp = c.frp;
        p.urvid = c.urvid;
        return p;
    }
    try {
        const tok = typeof window.getApiToken === 'function' ? window.getApiToken() : '';
        const apiUrlFn = typeof window.apiUrl === 'function' ? window.apiUrl : null;
        if (!tok || !apiUrlFn) return p;
        const r = await fetch(apiUrlFn(`/api/pedidos/${encodeURIComponent(idStr)}`), {
            headers: { Authorization: `Bearer ${tok}` },
        });
        if (!r.ok) return p;
        const row = await r.json();
        const frp = row.fecha_reversion_pendiente || null;
        const urvid =
            row.usuario_reversion_id != null ? parseInt(String(row.usuario_reversion_id), 10) : null;
        _reversionApiCache.set(idStr, {
            frp,
            urvid: Number.isFinite(urvid) ? urvid : null,
        });
        p.frp = frp;
        p.urvid = Number.isFinite(urvid) ? urvid : null;
    } catch (_) {}
    return p;
}

async function injectHistorialDerivacionRevertida(p) {
    const dm = document.getElementById('dm');
    if (!dm) return;
    dm.querySelector('#gn-historial-derivacion-revertida')?.remove();
    if (!debeMostrarHistorialDerivacionRevertida(p)) return;

    await enriquecerReversionDesdeApiSiFalta(p);

    const tz = { timeZone: 'America/Argentina/Buenos_Aires' };
    const fmt = (iso) =>
        iso
            ? new Date(iso).toLocaleString('es-AR', { ...tz, hour12: false })
            : '—';
    const empresa = escHtml(String(p.ddn || '').trim() || String(p.dda || '').trim() || '—');
    const fechaDer = fmt(p.fder);
    const porDer = escHtml(nombreUsuarioCache(p.uider) || (p.uider != null ? `Usuario #${p.uider}` : '—'));
    const fechaRev = fmt(p.frp);
    const porRev = escHtml(
        nombreUsuarioCache(p.urvid) || (p.urvid != null ? `Usuario #${p.urvid}` : '—')
    );

    const scroll = dm.querySelector('.gn-dm-detail-scroll');
    if (!scroll) return;

    const wrap = document.createElement('div');
    wrap.id = 'gn-historial-derivacion-revertida';
    wrap.innerHTML = `
<div class="ds" style="border-left:4px solid #94a3b8;opacity:.92;margin-bottom:.65rem">
    <details>
        <summary style="cursor:pointer;font-weight:600;list-style-position:outside">
            📋 Historial de derivación externa
        </summary>
        <p style="font-size:.78rem;margin:.45rem 0 .5rem;line-height:1.4;color:var(--tm)">
            Este reclamo fue derivado externamente y luego vuelto a <strong>Pendiente</strong> para continuar su atención internamente.
        </p>
        <div class="dr"><span class="dl">Empresa derivada</span><span class="dv">${empresa}</span></div>
        <div class="dr"><span class="dl">Fecha derivación</span><span class="dv">${escHtml(fechaDer)}</span></div>
        <div class="dr"><span class="dl">Derivado por</span><span class="dv">${porDer}</span></div>
        <div class="dr"><span class="dl">Vuelto a Pendiente</span><span class="dv">${escHtml(fechaRev)}</span></div>
        <div class="dr"><span class="dl">Reversión por</span><span class="dv">${porRev}</span></div>
    </details>
</div>`;
    scroll.insertBefore(wrap, scroll.firstChild);
}

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
    const origNorm = deps.norm;
    const origDetalle = deps.detalle;
    const normConReversion = (row) => {
        const n = origNorm(row);
        if (row && typeof row === 'object') {
            const frp = row.fecha_reversion_pendiente;
            if (frp != null && frp !== '') n.frp = frp;
            const ur = row.usuario_reversion_id;
            if (ur != null && ur !== '') {
                const uidRev = parseInt(String(ur), 10);
                if (Number.isFinite(uidRev)) n.urvid = uidRev;
            }
        }
        return n;
    };
    _deps = {
        ...deps,
        norm: normConReversion,
        detalle: async (p, opts) => {
            await origDetalle(p, opts);
            try {
                await injectHistorialDerivacionRevertida(p);
            } catch (_) {}
            /* Imagen del reclamo: `pedido-ver-imagen.js` usa MutationObserver en `#dmc` porque `detalle` global de app.js no pasa por este wrapper. */
        },
    };
}

export async function gnVolverPedidoAPendiente(pidStr) {
    const deps = _deps;
    if (!deps || !deps.esAdmin()) return;
    if (
        !confirm(
            '¿Volver este pedido a estado Pendiente?\n\n' +
                'Seguirá figurando el historial de la derivación externa en el detalle. ' +
                'Ya no se listará en «Derivados fuera».'
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
        _reversionApiCache.delete(String(pid));
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
        btn.title =
            'Pasa el pedido a Pendiente y lo saca de «Derivados fuera». El historial de derivación queda guardado en el detalle.';
        btn.addEventListener('click', () => {
            void gnVolverPedidoAPendiente(String(p.id));
        });
        da.insertBefore(btn, da.firstChild);
    } catch (_) {}
}

if (typeof window !== 'undefined') {
    window.gnVolverPedidoAPendiente = gnVolverPedidoAPendiente;
}
