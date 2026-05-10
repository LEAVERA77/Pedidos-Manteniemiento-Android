/**
 * Botón asistente (fa-magic en #gw): mismo entry que #mt y Tenant → gnAbrirWizardTenantUnificado.
 */

export function gnAbrirAsistenteDesdeWizardOLogin() {
    try {
        const ms = document.getElementById('ms');
        if (ms?.classList.contains('active')) {
            if (typeof window.gnAbrirWizardTenantUnificado === 'function') {
                void window.gnAbrirWizardTenantUnificado();
            }
            return;
        }

        const gw = document.getElementById('gw');
        if (gw?.classList.contains('active') && typeof window.cerrarVistaWizardMostrarLogin === 'function') {
            window.cerrarVistaWizardMostrarLogin();
        }

        if (typeof window.gnAbrirWizardTenantUnificado === 'function') {
            void window.gnAbrirWizardTenantUnificado();
            return;
        }
        if (typeof window.abrirWizardMarcaEmpresaManual === 'function') {
            void window.abrirWizardMarcaEmpresaManual();
        }
    } catch (e) {
        console.warn('[gn-asistente-paridad-magic-mt]', e?.message || e);
    }
}
