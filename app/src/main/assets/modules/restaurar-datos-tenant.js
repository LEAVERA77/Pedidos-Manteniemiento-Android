import {
    recargarSociosAdminTrasCambioTenant,
    adminSociosTabEstaActiva,
} from './admin-socios-carga-tenant.js';

/**
 * Tras cambiar el tenant operativo (misma sesión): recarga config empresa, formulario admin,
 * socios y usuarios — complementa invalidarCaches + refrescarEmpresa sin duplicar lógica en app.js.
 *
 * @param {{ silent?: boolean }} [opts] — si silent, no toast (p. ej. cuando el caller ya avisó).
 */
export async function restaurarDatosCompletosTrasCambioTenant(opts = {}) {
    const silent = !!opts.silent;
    try {
        if (typeof window.cargarConfigEmpresa === 'function') {
            await window.cargarConfigEmpresa();
        }
        if (typeof window.cargarFormEmpresa === 'function') {
            await window.cargarFormEmpresa();
        }
        if (typeof window.esAdmin === 'function' && window.esAdmin() && adminSociosTabEstaActiva()) {
            await recargarSociosAdminTrasCambioTenant();
            if (typeof window.cargarListaUsuarios === 'function') {
                try {
                    await window.cargarListaUsuarios();
                } catch (_) {}
            }
        }
        if (!silent && typeof window.toast === 'function') {
            window.toast('Datos del tenant actualizados', 'success');
        }
    } catch (e) {
        console.warn('[restaurar-datos-tenant]', e?.message || e);
    }
}
