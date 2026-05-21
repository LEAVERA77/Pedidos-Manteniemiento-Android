/**
 * Carga del listado al abrir pestaña Socios (evita mensaje estático colgado).
 * made by leavera77
 */
import { pintarErrorListaSociosAdmin } from './admin-socios-carga-tenant.js';

/**
 * Llamar desde adminTab('socios') — no agrandar app.js.
 */
export async function cargarListaSociosAdminAlAbrirTab() {
    const cargar =
        typeof window.cargarListaSociosAdmin === 'function'
            ? window.cargarListaSociosAdmin
            : null;
    if (!cargar) {
        const { ensureAdminSociosInitializedFast } = await import('./app-admin-panel-deferred.js');
        const getDeps =
            typeof window.__gnDepsAdminPanelDeferred === 'function'
                ? window.__gnDepsAdminPanelDeferred
                : null;
        if (getDeps) await ensureAdminSociosInitializedFast(getDeps);
        if (typeof window.cargarListaSociosAdmin === 'function') {
            try {
                await window.cargarListaSociosAdmin();
            } catch (e) {
                pintarErrorListaSociosAdmin(e);
            }
            return;
        }
        pintarErrorListaSociosAdmin(new Error('Módulo de socios no disponible. Recargá la página.'));
        return;
    }
    try {
        await cargar();
    } catch (e) {
        pintarErrorListaSociosAdmin(e);
    }
}

if (typeof window !== 'undefined') {
    window.cargarListaSociosAdminAlAbrirTab = cargarListaSociosAdminAlAbrirTab;
}
