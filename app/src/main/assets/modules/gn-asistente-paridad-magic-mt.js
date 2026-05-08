/**
 * Botón asistente (fa-magic en #gw): paridad con #mt cuando la pantalla principal está activa;
 * sin sesión API: cerrar bienvenida si aplica, modal tenant (técnico) y acceso a reabrir asistente (admin).
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

function esGestorNovaWebPublicoLocal() {
    return typeof window.AndroidConfig === 'undefined';
}

export function gnAbrirAsistenteDesdeWizardOLogin() {
    try {
        const ms = document.getElementById('ms');
        if (ms?.classList.contains('active')) {
            if (typeof window.abrirWizardMarcaEmpresaManual === 'function') {
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
            if (typeof window.abrirWizardMarcaEmpresaManual === 'function') {
                void window.abrirWizardMarcaEmpresaManual();
            }
            return;
        }

        if (typeof window.abrirModalTenantTecnicoAndroid === 'function') {
            window.abrirModalTenantTecnicoAndroid();
        }

        const envOk = esGestorNovaWebPublicoLocal() || esEntornoAndroidGestorNovaLoginLocal();
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
