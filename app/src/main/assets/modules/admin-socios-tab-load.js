/**
 * Carga del listado al abrir pestaña Socios (evita mensaje estático colgado).
 * made by leavera77
 */
import { pintarErrorListaSociosAdmin } from './admin-socios-carga-tenant.js';

/**
 * Llamar desde adminTab('socios') — no agrandar app.js.
 */
export async function cargarListaSociosAdminAlAbrirTab() {
    const getDeps =
        typeof window.__gnDepsAdminPanelDeferred === 'function'
            ? window.__gnDepsAdminPanelDeferred
            : null;
    if (!getDeps) {
        pintarErrorListaSociosAdmin(new Error('Panel admin no listo. Recargá la página.'));
        return;
    }
    try {
        const { ensureAdminSociosInitializedFast } = await import('./app-admin-panel-deferred.js');
        await ensureAdminSociosInitializedFast(getDeps);
    } catch (e) {
        pintarErrorListaSociosAdmin(e);
        return;
    }
    const cargar =
        typeof window.cargarListaSociosAdmin === 'function'
            ? window.cargarListaSociosAdmin
            : null;
    if (!cargar) {
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
