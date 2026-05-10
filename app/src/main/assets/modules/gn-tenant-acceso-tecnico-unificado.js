/**
 * Unifica el acceso a configuración de tenant (marca / nombre / tipo): solo con clave GESTORNOVA_TECHNICIAN_TENANT_KEY.
 * Los botones #mt, Tenant (login) y asistente (magic) delegan aquí.
 */

/** @type {{ apiSetupTechnicianFetchTenants: Function } | null} */
let _deps = null;

/** @type {null | (key: string) => void | Promise<void>} */
let _onSuccess = null;

function el(id) {
    return document.getElementById(id);
}

function setErr(msg) {
    const e = el('gn-acceso-tec-err');
    if (!e) return;
    if (!msg) {
        e.style.display = 'none';
        e.textContent = '';
        return;
    }
    e.style.display = 'block';
    e.textContent = msg;
}

export function initGnTenantAccesoTecnicoUnificado(deps) {
    _deps = deps;
    window.gnSolicitarAccesoTecnicoYAbrirWizardConfig = function gnSolicitarAccesoTecnicoYAbrirWizardConfig() {
        _onSuccess = async (clave) => {
            try {
                window.__GN_CONFIG_TENANT_SOLO_TECNICO_OK = true;
            } catch (_) {}
            if (typeof deps.abrirWizardMarcaEmpresaManualTrasPassword === 'function') {
                await deps.abrirWizardMarcaEmpresaManualTrasPassword();
            }
        };
        abrirModalAccesoTecnicoTenantUnificado();
    };

    window.gnAbrirFlujoTenantTecnicoLogin = function gnAbrirFlujoTenantTecnicoLogin() {
        _onSuccess = async (clave) => {
            try {
                const inp = el('mtt-android-tech-key');
                if (inp) inp.value = clave;
            } catch (_) {}
            if (typeof window.abrirModalTenantTecnicoAndroid === 'function') {
                window.abrirModalTenantTecnicoAndroid();
            }
            const envWeb = typeof window.AndroidConfig === 'undefined';
            const envAndroid =
                typeof window.AndroidConfig !== 'undefined' ||
                (typeof window.esAndroidWebViewMapa === 'function' && window.esAndroidWebViewMapa());
            const envOk = envWeb || envAndroid;
            if (envOk && typeof window.abrirModalReabrirAsistenteAdmin === 'function') {
                setTimeout(() => {
                    try {
                        window.abrirModalReabrirAsistenteAdmin();
                    } catch (_) {}
                }, 380);
            }
        };
        abrirModalAccesoTecnicoTenantUnificado();
    };

    window._gnAccesoTecCancelar = function _gnAccesoTecCancelar() {
        const m = el('modal-gn-acceso-tecnico-tenant');
        if (m) m.classList.remove('active');
        _onSuccess = null;
        setErr('');
        const k = el('gn-acceso-tec-clave');
        if (k) k.value = '';
    };

    window._gnAccesoTecContinuar = async function _gnAccesoTecContinuar() {
        setErr('');
        const k = (el('gn-acceso-tec-clave')?.value || '').trim();
        if (!k) {
            setErr('Ingresá la clave técnica.');
            return;
        }
        if (!_deps?.apiSetupTechnicianFetchTenants) {
            setErr('Error interno: no hay validador de clave.');
            return;
        }
        try {
            await _deps.apiSetupTechnicianFetchTenants(null, k);
        } catch (e) {
            setErr(String(e?.message || e) || 'Clave incorrecta o servidor no disponible.');
            return;
        }
        const cb = _onSuccess;
        const m = el('modal-gn-acceso-tecnico-tenant');
        if (m) m.classList.remove('active');
        _onSuccess = null;
        const inp = el('gn-acceso-tec-clave');
        if (inp) inp.value = '';
        if (typeof cb === 'function') {
            try {
                await cb(k);
            } catch (err) {
                console.warn('[gn-tenant-acceso-tecnico]', err?.message || err);
            }
        }
    };
}

function abrirModalAccesoTecnicoTenantUnificado() {
    const m = el('modal-gn-acceso-tecnico-tenant');
    if (!m) {
        console.warn('[gn-tenant-acceso] falta #modal-gn-acceso-tecnico-tenant en index.html');
        return;
    }
    setErr('');
    const k = el('gn-acceso-tec-clave');
    if (k) k.value = '';
    m.classList.add('active');
}
