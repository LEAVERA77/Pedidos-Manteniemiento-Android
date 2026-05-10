/**
 * Botón asistente (fa-magic en #gw): mismo wizard de tenant que #mt y Tenant (gnAbrirWizardTenantUnificado).
 */

export function gnAbrirAsistenteDesdeWizardOLogin() {
    try {
        const ms = document.getElementById('ms');
        if (ms?.classList.contains('active')) {
            if (typeof window.gnAbrirWizardTenantUnificado === 'function') {
                void window.gnAbrirWizardTenantUnificado();
            } else if (typeof window.abrirWizardMarcaEmpresaManual === 'function') {
                void window.abrirWizardMarcaEmpresaManual();
            }
            return;
        }

        const gw = document.getElementById('gw');
        if (gw?.classList.contains('active') && typeof window.cerrarVistaWizardMostrarLogin === 'function') {
            window.cerrarVistaWizardMostrarLogin();
        }

        const tokenOk =
            typeof window.sesionCompletaParaMarcaLogin === 'function' && window.sesionCompletaParaMarcaLogin();
        if (tokenOk) {
            if (typeof window.gnAbrirWizardTenantUnificado === 'function') {
                void window.gnAbrirWizardTenantUnificado();
            } else if (typeof window.abrirWizardMarcaEmpresaManual === 'function') {
                void window.abrirWizardMarcaEmpresaManual();
            }
            return;
        }

        if (typeof window.gnAbrirWizardTenantUnificado === 'function') {
            void window.gnAbrirWizardTenantUnificado();
        }
    } catch (e) {
        console.warn('[gn-asistente-paridad-magic-mt]', e?.message || e);
    }
}
