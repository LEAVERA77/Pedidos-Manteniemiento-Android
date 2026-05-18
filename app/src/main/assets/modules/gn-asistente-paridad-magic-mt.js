/**
 * Botón asistente (fa-magic en #gw): deshabilitado para tenant; solo onboarding → login.
 */

export function gnAbrirAsistenteDesdeWizardOLogin() {
    try {
        const gw = document.getElementById('gw');
        if (gw?.classList.contains('active') && typeof window.cerrarVistaWizardMostrarLogin === 'function') {
            window.cerrarVistaWizardMostrarLogin();
            return;
        }
        if (typeof window.toast === 'function') {
            window.toast('El cambio de tenant es solo para usuarios técnico de soporte (botón Tenant o lista con clave).', 'info');
        }
    } catch (e) {
        console.warn('[gn-asistente-paridad-magic-mt]', e?.message || e);
    }
}
