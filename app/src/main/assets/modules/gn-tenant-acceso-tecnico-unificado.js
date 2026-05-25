/**
 * Unifica #mt, Tenant (login) y botón magic: mismo wizard de 3 pasos tras clave GESTORNOVA_TECHNICIAN_TENANT_KEY.
 * made by leavera77
 */

import { toast } from './ui-utils.js';
import { apiSetupTechnicianFetchTenants } from './setup-technician-api.js';

const TECH_SESS_KEY = 'pmg_gn_tenant_tech_ok';
const TECH_KEY_SESS_KEY = 'pmg_gn_tenant_tech_key';

/** @type {{ abrirWizardMarcaEmpresaManualTrasPassword?: () => void | Promise<void> } | null} */
let _deps = null;

/** @type {null | ((key: string) => void | Promise<void>)} */
let _onSuccess = null;

let _wired = false;

function el(id) {
    return document.getElementById(id);
}

export function clearGnTenantTechSession() {
    try {
        sessionStorage.removeItem(TECH_SESS_KEY);
        sessionStorage.removeItem(TECH_KEY_SESS_KEY);
    } catch (_) {}
}

export function getGnStoredTechnicianKey() {
    try {
        return String(sessionStorage.getItem(TECH_KEY_SESS_KEY) || '').trim();
    } catch (_) {
        return '';
    }
}

function storeGnTechnicianKey(k) {
    const s = String(k || '').trim();
    if (!s) return;
    try {
        sessionStorage.setItem(TECH_KEY_SESS_KEY, s);
    } catch (_) {}
}

export function persistGnTechnicianKeyForSession(k) {
    storeGnTechnicianKey(k);
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

function setContinuarBusy(busy) {
    const btn = el('gn-acceso-tec-btn-continuar');
    if (!btn) return;
    btn.disabled = !!busy;
    if (busy) {
        if (!btn.dataset.gnPrevHtml) btn.dataset.gnPrevHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Validando…';
    } else if (btn.dataset.gnPrevHtml) {
        btn.innerHTML = btn.dataset.gnPrevHtml;
        delete btn.dataset.gnPrevHtml;
    }
}

async function abrirWizardTrasClaveTecnica() {
    try {
        window.__GN_CONFIG_TENANT_SOLO_TECNICO_OK = true;
    } catch (_) {}
    const open =
        _deps?.abrirWizardMarcaEmpresaManualTrasPassword ||
        (typeof window.abrirWizardMarcaEmpresaManualTrasPassword === 'function'
            ? window.abrirWizardMarcaEmpresaManualTrasPassword
            : null);
    if (open) {
        await open();
        return;
    }
    throw new Error('La aplicación aún está cargando. Esperá unos segundos y probá de nuevo.');
}

async function gnAbrirWizardTenantUnificado() {
    if (tieneTechSesion()) {
        try {
            await abrirWizardTrasClaveTecnica();
        } catch (e) {
            const msg = String(e?.message || e) || 'No se pudo abrir el asistente.';
            toast(msg, 'error');
        }
        return;
    }
    _onSuccess = async (keyValidated) => {
        marcarTechSesion();
        storeGnTechnicianKey(keyValidated);
        await abrirWizardTrasClaveTecnica();
    };
    abrirModalAccesoTecnicoTenantUnificado();
}

function onCancelar() {
    const m = el('modal-gn-acceso-tecnico-tenant');
    if (m) m.classList.remove('active');
    _onSuccess = null;
    setErr('');
    setContinuarBusy(false);
    const k = el('gn-acceso-tec-clave');
    if (k) k.value = '';
}

async function onContinuar() {
    setErr('');
    const k = (el('gn-acceso-tec-clave')?.value || '').trim();
    if (!k) {
        setErr('Ingresá la clave técnica.');
        toast('Ingresá la clave técnica.', 'error');
        return;
    }
    const cb = _onSuccess;
    if (typeof cb !== 'function') {
        const msg = 'Abrí de nuevo desde el botón Tenant e ingresá la clave.';
        setErr(msg);
        toast(msg, 'error');
        return;
    }
    setContinuarBusy(true);
    try {
        await apiSetupTechnicianFetchTenants(null, k);
    } catch (e) {
        const msg = String(e?.message || e) || 'Clave incorrecta o servidor no disponible.';
        setErr(msg);
        toast(msg, 'error');
        return;
    } finally {
        setContinuarBusy(false);
    }
    const m = el('modal-gn-acceso-tecnico-tenant');
    if (m) m.classList.remove('active');
    const inp = el('gn-acceso-tec-clave');
    if (inp) inp.value = '';
    _onSuccess = null;
    try {
        await cb(k);
    } catch (err) {
        const msg = String(err?.message || err) || 'No se pudo abrir el asistente de configuración.';
        console.warn('[gn-tenant-acceso-tecnico]', err);
        setErr(msg);
        toast(msg, 'error');
        _onSuccess = cb;
        abrirModalAccesoTecnicoTenantUnificado();
    }
}

function abrirModalAccesoTecnicoTenantUnificado() {
    const modal = el('modal-gn-acceso-tecnico-tenant');
    if (!modal) {
        console.warn('[gn-tenant-acceso] falta #modal-gn-acceso-tecnico-tenant en index.html');
        toast('Falta el modal de acceso técnico en la página.', 'error');
        return;
    }
    setErr('');
    setContinuarBusy(false);
    const k = el('gn-acceso-tec-clave');
    if (k) k.value = '';
    modal.classList.add('active');
    try {
        k?.focus();
    } catch (_) {}
}

function wireAccesoTecnicoModal() {
    if (_wired) return;
    _wired = true;
    el('gn-acceso-tec-btn-cancelar')?.addEventListener('click', onCancelar);
    el('gn-acceso-tec-btn-continuar')?.addEventListener('click', () => void onContinuar());
    el('gn-acceso-tec-clave')?.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
            ev.preventDefault();
            void onContinuar();
        }
    });
}

function registerGlobalsEarly() {
    window._gnAccesoTecCancelar = onCancelar;
    window._gnAccesoTecContinuar = () => void onContinuar();
    window.gnAbrirWizardTenantUnificado = () => void gnAbrirWizardTenantUnificado();
    window.gnSolicitarAccesoTecnicoYAbrirWizardConfig = window.gnAbrirWizardTenantUnificado;
    window.gnAbrirFlujoTenantTecnicoLogin = window.gnAbrirWizardTenantUnificado;
}

registerGlobalsEarly();

function bootWire() {
    wireAccesoTecnicoModal();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootWire);
} else {
    bootWire();
}

export function initGnTenantAccesoTecnicoUnificado(deps) {
    _deps = deps || null;
    registerGlobalsEarly();
    wireAccesoTecnicoModal();
}
