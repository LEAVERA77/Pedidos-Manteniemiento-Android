/**
 * Botón asistente (fa-magic en #gw): misma validación técnica que #mt y Tenant (clave GESTORNOVA_TECHNICIAN_TENANT_KEY).
 */

function esAndroidWebViewMapaUa() {
    try {
        return (
            /GestorNova\//i.test(navigator.userAgent) ||
            /Nexxo\//i.test(navigator.userAgent) ||
            window.location.protocol === 'file:'
        );
    } catch (_) {
        return false;
    }
}

function esEntornoAndroidGestorNovaLoginLocal() {
    try {
        return typeof window.AndroidConfig !== 'undefined' || esAndroidWebViewMapaUa();
    } catch (_) {
        return false;
    }
}

export function gnAbrirAsistenteDesdeWizardOLogin() {
    try {
        const ms = document.getElementById('ms');
        if (ms?.classList.contains('active')) {
            if (typeof window.gnSolicitarAccesoTecnicoYAbrirWizardConfig === 'function') {
                window.gnSolicitarAccesoTecnicoYAbrirWizardConfig();
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
            if (typeof window.gnSolicitarAccesoTecnicoYAbrirWizardConfig === 'function') {
                window.gnSolicitarAccesoTecnicoYAbrirWizardConfig();
            } else if (typeof window.abrirWizardMarcaEmpresaManual === 'function') {
                void window.abrirWizardMarcaEmpresaManual();
            }
            return;
        }

        if (typeof window.gnAbrirFlujoTenantTecnicoLogin === 'function') {
            window.gnAbrirFlujoTenantTecnicoLogin();
            return;
        }

        if (typeof window.abrirModalTenantTecnicoAndroid === 'function') {
            window.abrirModalTenantTecnicoAndroid();
        }

        const envOk = typeof window.AndroidConfig === 'undefined' || esEntornoAndroidGestorNovaLoginLocal();
        if (envOk && typeof window.abrirModalReabrirAsistenteAdmin === 'function') {
            setTimeout(() => {
                try {
                    window.abrirModalReabrirAsistenteAdmin();
                } catch (_) {}
            }, 380);
        }
    } catch (e) {
        console.warn('[gn-asistente-paridad-magic-mt]', e?.message || e);
    }
}
