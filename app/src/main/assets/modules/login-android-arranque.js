/**
 * Android WebView: arranque login sin toast de inactividad espuria ni borrado del usuario al conectar Neon.
 * Se importa al inicio de app.js (antes del restore de sesión local).
 * made by leavera77
 */

const DRAFT_EM = 'gn_login_draft_em';
const DRAFT_PW = 'gn_login_draft_pw';
const PMG_LAST_ACTIVITY_TS_KEY = 'pmg_last_activity_ts';
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
        return Date.now() - t > 15 * 60 * 1000;
    } catch (_) {
        return false;
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
        const mo = new MutationObserver(() => {
            if (document.body?.classList.contains('gn-sesion-activa')) {
                sessionStorage.removeItem(DRAFT_EM);
                sessionStorage.removeItem(DRAFT_PW);
            }
        });
        mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
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
suprimirToastInactividadArranque();

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => instalarPreservacionCamposLogin(), { once: true });
    } else {
        instalarPreservacionCamposLogin();
    }
}
