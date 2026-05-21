/**
 * Recarga del listado admin de socios tras cambio de tenant / invalidación de caché.
 * made by leavera77
 */
import { resetSociosCatalogoSchemaCache } from './socios-catalogo-schema-cache.js';

/**
 * Placeholder en #lista-socios-admin (no confundir con "sin filas en SQL").
 */
export function marcarListaSociosPendienteRecarga() {
    try {
        resetSociosCatalogoSchemaCache();
    } catch (_) {}
    const ls = document.getElementById('lista-socios-admin');
    if (!ls) return;
    const tid =
        typeof window._gnTenantId === 'function'
            ? window._gnTenantId()
            : window.app?.u?.tenant_id ?? window.app?.u?.tenantId ?? '—';
    ls.innerHTML = `<div class="ll2" style="padding:.75rem;color:var(--tm)"><i class="fas fa-circle-notch fa-spin"></i> Cargando catálogo del tenant <strong>${String(tid)}</strong>…</div>`;
}

/** @returns {boolean} */
export function adminSociosTabEstaActiva() {
    return !!document.getElementById('admin-socios')?.classList.contains('active');
}

/**
 * Mensaje cuando el usuario no es admin (no se auto-carga el catálogo).
 */
export function marcarListaSociosSoloAdmin() {
    const ls = document.getElementById('lista-socios-admin');
    if (!ls) return;
    ls.innerHTML =
        '<div class="ll2" style="padding:.75rem;color:var(--tm)">El catálogo de socios se carga al abrir <strong>Admin → Socios / NIS</strong> (cuenta administrador).</div>';
}

/**
 * @param {unknown} err
 */
export function pintarErrorListaSociosAdmin(err) {
    const ls = document.getElementById('lista-socios-admin');
    if (!ls) return;
    const msg = String(err && err.message ? err.message : err || 'Error al cargar socios');
    ls.innerHTML = `<p style="color:var(--re);font-size:.85rem;padding:.75rem">${msg.replace(/</g, '&lt;')}</p>`;
}

/**
 * Tras invalidar multitenant: solo recarga pesada si la pestaña Socios está visible.
 */
export async function recargarSociosAdminTrasCambioTenant() {
    if (!window.app?.u) return;
    if (typeof window.modoOffline !== 'undefined' && window.modoOffline) return;
    const esAdminFn = typeof window.esAdmin === 'function' ? window.esAdmin : null;
    if (!esAdminFn || !esAdminFn()) {
        marcarListaSociosSoloAdmin();
        return;
    }
    if (!adminSociosTabEstaActiva()) {
        marcarListaSociosPendienteRecarga();
        return;
    }
    marcarListaSociosPendienteRecarga();
    if (typeof window.cargarListaSociosAdmin === 'function') {
        try {
            await window.cargarListaSociosAdmin();
        } catch (e) {
            pintarErrorListaSociosAdmin(e);
        }
        return;
    }
    const getDeps =
        typeof window.__gnDepsAdminPanelDeferred === 'function'
            ? window.__gnDepsAdminPanelDeferred
            : null;
    if (getDeps) {
        try {
            const { ensureAdminSociosInitialized } = await import('./app-admin-panel-deferred.js');
            await ensureAdminSociosInitialized(getDeps);
        } catch (e) {
            pintarErrorListaSociosAdmin(e);
            return;
        }
    }
    pintarErrorListaSociosAdmin(new Error('Módulo de socios no disponible. Recargá la página.'));
}
