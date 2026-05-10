/**
 * Unifica #mt, Tenant (login) y botón magic: mismo wizard de 3 pasos tras clave GESTORNOVA_TECHNICIAN_TENANT_KEY.
 * Si la clave ya se validó en esta sesión (hasta cerrar sesión), no se vuelve a pedir.
 */

const TECH_SESS_KEY = 'pmg_gn_tenant_tech_ok';

/** @type {{ apiSetupTechnicianFetchTenants: Function, abrirWizardMarcaEmpresaManualTrasPassword: Function } | null} */
let _deps = null;

/** @type {null | (key: string) => void | Promise<void>} */
let _onSuccess = null;

function el(id) {
    return document.getElementById(id);
}

export function clearGnTenantTechSession() {
    try {
        sessionStorage.removeItem(TECH_SESS_KEY);
    } catch (_) {}
}

function tieneTechSesion() {
    try {
        return sessionStorage.getItem(TECH_SESS_KEY) === '1';
    } catch (_) {
        return false;
    }
}

function marcarTechSesion() {
    try {
        sessionStorage.setItem(TECH_SESS_KEY, '1');
    } catch (_) {}
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

async function abrirWizardTrasClaveTecnica() {
    try {
        window.__GN_CONFIG_TENANT_SOLO_TECNICO_OK = true;
    } catch (_) {}
    if (_deps?.abrirWizardMarcaEmpresaManualTrasPassword) {
        await _deps.abrirWizardMarcaEmpresaManualTrasPassword();
    }
}

/**
 * Misma función para lista (#mt / admin), Tenant (login) y asistente (magic): wizard completo.
 */
async function gnAbrirWizardTenantUnificado() {
    if (tieneTechSesion()) {
        await abrirWizardTrasClaveTecnica();
        return;
    }
    _onSuccess = async () => {
        marcarTechSesion();
        await abrirWizardTrasClaveTecnica();
    };
    abrirModalAccesoTecnicoTenantUnificado();
}

export function initGnTenantAccesoTecnicoUnificado(deps) {
    _deps = deps;
    window.gnAbrirWizardTenantUnificado = gnAbrirWizardTenantUnificado;
    window.gnSolicitarAccesoTecnicoYAbrirWizardConfig = gnAbrirWizardTenantUnificado;
    window.gnAbrirFlujoTenantTecnicoLogin = gnAbrirWizardTenantUnificado;

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
    const modal = el('modal-gn-acceso-tecnico-tenant');
    if (!modal) {
        console.warn('[gn-tenant-acceso] falta #modal-gn-acceso-tecnico-tenant en index.html');
        return;
    }
    setErr('');
    const k = el('gn-acceso-tec-clave');
    if (k) k.value = '';
    modal.classList.add('active');
}
