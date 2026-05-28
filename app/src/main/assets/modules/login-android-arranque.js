/**
 * Android WebView: arranque login, sesión tras segundo plano, offline y alto contraste.
 * Se importa al inicio de app.js (antes del restore de sesión local).
 * made by leavera77
 */

import { getApp } from './gn-app-global-bridge.js';
import { offlinePedidos, OU_KEY } from '../offline.js';

const DRAFT_EM = 'gn_login_draft_em';
const DRAFT_PW = 'gn_login_draft_pw';
const PMG_LAST_ACTIVITY_TS_KEY = 'pmg_last_activity_ts';
const PMG_KEY = 'pmg';
const SESION_INACTIVIDAD_MAX_MS = 15 * 60 * 1000;
const GUARD_MS = 120000;

function esShellAndroidGestorNova() {
    try {
        if (typeof window.AndroidConfig !== 'undefined' && window.AndroidConfig != null) return true;
        const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '';
        return /GestorNova\//i.test(ua);
    } catch (_) {
        return false;
    }
}

function sesionLocalSuperaInactividadMaxima() {
    try {
        const raw = localStorage.getItem(PMG_LAST_ACTIVITY_TS_KEY);
        if (raw == null || String(raw).trim() === '') return false;
        const t = parseInt(raw, 10);
        if (!Number.isFinite(t) || t <= 0) return false;
        return Date.now() - t > SESION_INACTIVIDAD_MAX_MS;
    } catch (_) {
        return false;
    }
}

function leerPmgUsuario() {
    try {
        const raw = localStorage.getItem(PMG_KEY);
        if (!raw || !String(raw).trim()) return null;
        const u = JSON.parse(raw);
        return u && u.id != null ? u : null;
    } catch (_) {
        return null;
    }
}

function tieneCacheLoginOffline() {
    try {
        const lista = JSON.parse(localStorage.getItem(OU_KEY) || '[]');
        return Array.isArray(lista) && lista.length > 0;
    } catch (_) {
        return false;
    }
}

function asegurarPantallaPrincipalActiva() {
    const ls = document.getElementById('ls');
    const ms = document.getElementById('ms');
    if (!ls || !ms) return;
    ls.classList.remove('active');
    ms.classList.add('active');
    try {
        document.body.classList.add('gn-sesion-activa');
    } catch (_) {}
}

function marcarActividadSesionAhora() {
    try {
        localStorage.setItem(PMG_LAST_ACTIVITY_TS_KEY, String(Date.now()));
    } catch (_) {}
}

/** Rehidrata app.u y pantalla principal si hay pmg y no pasaron 15 min de inactividad. */
export function rehidratarSesionAndroidDesdePmg() {
    if (!esShellAndroidGestorNova()) return false;
    if (sesionLocalSuperaInactividadMaxima()) return false;

    const app = getApp();
    if (app?.u) {
        if (document.getElementById('ls')?.classList.contains('active')) {
            asegurarPantallaPrincipalActiva();
        }
        marcarActividadSesionAhora();
        return true;
    }

    const u = leerPmgUsuario();
    if (!u) return false;

    if (!app) return false;
    try {
        u.rol = typeof window.normalizarRolStr === 'function' ? window.normalizarRolStr(u.rol) : u.rol;
    } catch (_) {}
    app.u = u;
    asegurarPantallaPrincipalActiva();
    marcarActividadSesionAhora();

    setTimeout(() => {
        try {
            if (typeof window.cargarPedidos === 'function') {
                void window.cargarPedidos();
            } else if (typeof window.render === 'function') {
                try {
                    app.p = offlinePedidos();
                } catch (_) {
                    app.p = [];
                }
                window.render();
            }
        } catch (_) {}
    }, 250);

    return true;
}

function prepararLoginOfflineAndroid() {
    if (!esShellAndroidGestorNova()) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        try {
            window.__gnNeonFastOfflineAndroid = true;
        } catch (_) {}
    }
    const dbs = document.getElementById('dbs');
    const lb = document.getElementById('lb');
    const offlinePosible = tieneCacheLoginOffline() || !!leerPmgUsuario();
    if (dbs && offlinePosible) {
        dbs.className = 'dbs er';
        dbs.innerHTML =
            '<i class="fas fa-wifi-slash"></i> Sin conexión — podés ingresar offline';
    }
    if (lb) {
        lb.disabled = false;
        try {
            lb.removeAttribute('disabled');
        } catch (_) {}
    }
    void rehidratarSesionAndroidDesdePmg();
}

function instalarHooksSesionAndroid() {
    if (!esShellAndroidGestorNova()) return;
    try {
        window.gnRehidratarSesionAndroid = rehidratarSesionAndroidDesdePmg;
    } catch (_) {}

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        setTimeout(() => {
            void rehidratarSesionAndroidDesdePmg();
        }, 80);
    });

    window.addEventListener('pageshow', () => {
        setTimeout(() => {
            void rehidratarSesionAndroidDesdePmg();
        }, 80);
    });

    window.addEventListener('gestornova-app-ready', () => {
        prepararLoginOfflineAndroid();
        setTimeout(() => void rehidratarSesionAndroidDesdePmg(), 120);
        setTimeout(() => void rehidratarSesionAndroidDesdePmg(), 600);
    });

    if (typeof navigator !== 'undefined') {
        window.addEventListener('offline', () => {
            try {
                window.__gnNeonFastOfflineAndroid = true;
            } catch (_) {}
            prepararLoginOfflineAndroid();
        });
        window.addEventListener('online', () => {
            try {
                window.__gnNeonFastOfflineAndroid = false;
            } catch (_) {}
        });
    }
}

/**
 * Antes de que app.js restaure `pmg`: si la sesión guardada ya expiró por inactividad, limpiar storage
 * sin pasar por ejecutarCerrarSesion (evita toast + vaciar campos de login).
 */
export function prepararStorageSesionObsoletaArranqueAndroid() {
    if (!esShellAndroidGestorNova()) return;
    try {
        localStorage.removeItem('gestornova_saved_login');
    } catch (_) {}
    let pmg = null;
    try {
        pmg = localStorage.getItem('pmg');
    } catch (_) {}
    if (!pmg || !String(pmg).trim()) {
        try {
            localStorage.removeItem(PMG_LAST_ACTIVITY_TS_KEY);
            localStorage.removeItem('pmg_api_token');
        } catch (_) {}
        return;
    }
    if (sesionLocalSuperaInactividadMaxima()) {
        try {
            localStorage.removeItem('pmg');
            localStorage.removeItem('pmg_api_token');
            localStorage.removeItem(PMG_LAST_ACTIVITY_TS_KEY);
        } catch (_) {}
        try {
            window.__gnSesionObsoletaPurgaArranque = true;
        } catch (_) {}
    }
}

function guardarBorradorLogin() {
    const em = document.getElementById('em');
    const pw = document.getElementById('pw');
    if (!em || !pw) return;
    try {
        sessionStorage.setItem(DRAFT_EM, em.value);
        sessionStorage.setItem(DRAFT_PW, pw.value);
    } catch (_) {}
}

function restaurarBorradorLoginSiVacio() {
    const ls = document.getElementById('ls');
    if (!ls?.classList.contains('active')) return;
    const em = document.getElementById('em');
    const pw = document.getElementById('pw');
    if (!em || !pw) return;
    try {
        const dem = sessionStorage.getItem(DRAFT_EM);
        const dpw = sessionStorage.getItem(DRAFT_PW);
        if (dem != null && dem !== '' && em.value === '') em.value = dem;
        if (dpw != null && pw.value === '') pw.value = dpw;
    } catch (_) {}
}

function instalarPreservacionCamposLogin() {
    const em = document.getElementById('em');
    const pw = document.getElementById('pw');
    if (!em || !pw || em.dataset.gnDraftGuard === '1') return;
    em.dataset.gnDraftGuard = '1';
    pw.dataset.gnDraftGuard = '1';
    const onEdit = () => guardarBorradorLogin();
    ['input', 'keydown', 'paste', 'cut'].forEach((ev) => {
        em.addEventListener(ev, onEdit, { passive: true });
        pw.addEventListener(ev, onEdit, { passive: true });
    });
    const hasta = Date.now() + GUARD_MS;
    const tick = () => {
        if (Date.now() > hasta) return;
        restaurarBorradorLoginSiVacio();
    };
    const iv = setInterval(() => {
        tick();
        if (Date.now() > hasta) clearInterval(iv);
    }, 200);
    const dbs = document.getElementById('dbs');
    if (dbs) {
        try {
            const mo = new MutationObserver(() => {
                tick();
                restaurarBorradorLoginSiVacio();
            });
            mo.observe(dbs, { childList: true, subtree: true, characterData: true });
        } catch (_) {}
    }
    try {
        window.addEventListener('gestornova-app-ready', () => {
            setTimeout(restaurarBorradorLoginSiVacio, 0);
            setTimeout(restaurarBorradorLoginSiVacio, 400);
        });
    } catch (_) {}
    try {
        let teniaSesion = document.body?.classList.contains('gn-sesion-activa');
        const mo = new MutationObserver(() => {
            const activa = document.body?.classList.contains('gn-sesion-activa');
            if (activa) {
                sessionStorage.removeItem(DRAFT_EM);
                sessionStorage.removeItem(DRAFT_PW);
            } else if (teniaSesion && !window.__gnBiometricLoginFlow) {
                try {
                    sessionStorage.removeItem(DRAFT_EM);
                    sessionStorage.removeItem(DRAFT_PW);
                    const emEl = document.getElementById('em');
                    const pwEl = document.getElementById('pw');
                    if (emEl) emEl.value = '';
                    if (pwEl) pwEl.value = '';
                } catch (_) {}
                try {
                    const refreshBio = () => {
                        if (typeof window.__gnRefreshLoginBiometricUi === 'function') {
                            window.__gnRefreshLoginBiometricUi();
                        }
                    };
                    refreshBio();
                    setTimeout(refreshBio, 0);
                    setTimeout(refreshBio, 350);
                } catch (_) {}
            }
            teniaSesion = activa;
        });
        mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    } catch (_) {}
}

/** Nueva APK / reinstalación: el puente nativo ya purga; esto refuerza tras actualizar WebView. */
function purgarHuellaSiCambioVersionApk() {
    if (!esShellAndroidGestorNova()) return;
    const B = window.AndroidBiometric;
    if (!B || typeof B.clearSavedLogin !== 'function') return;
    try {
        if (typeof window.AndroidConfig?.getVersionCode !== 'function') return;
        const vc = String(window.AndroidConfig.getVersionCode());
        const key = 'pmg_bio_bound_vc';
        const prev = localStorage.getItem(key);
        if (prev != null && prev !== '' && prev !== vc) {
            B.clearSavedLogin();
        }
        localStorage.setItem(key, vc);
    } catch (_) {}
}

/** Suprime toast de inactividad solo en los primeros segundos tras abrir la app (respaldo). */
function suprimirToastInactividadArranque() {
    if (!esShellAndroidGestorNova()) return;
    const orig = typeof window.toast === 'function' ? window.toast : null;
    if (!orig || orig._gnSuprimirInactArranque) return;
    const hasta = Date.now() + 14000;
    const wrapped = function (msg, tipo) {
        if (Date.now() < hasta && /inactividad/i.test(String(msg || ''))) return;
        return orig.apply(this, arguments);
    };
    wrapped._gnSuprimirInactArranque = true;
    window.toast = wrapped;
}

prepararStorageSesionObsoletaArranqueAndroid();
purgarHuellaSiCambioVersionApk();
suprimirToastInactividadArranque();
instalarHooksSesionAndroid();

if (typeof document !== 'undefined') {
    const bootAndroidLogin = () => {
        instalarPreservacionCamposLogin();
        prepararLoginOfflineAndroid();
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootAndroidLogin, { once: true });
    } else {
        bootAndroidLogin();
    }
}
