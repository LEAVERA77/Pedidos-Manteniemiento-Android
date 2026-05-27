/**
 * Login con huella en Android WebView (puente nativo AndroidBiometric).
 * Engancha {@code window.__gnEjecutarLogin} sin tocar app.js: tras login OK ofrece guardar con biométrica.
 * El acceso guardado queda ligado a tenant + línea de negocio; se purga en instalación/APK distinta.
 * made by leavera77
 */

import {
    gnBioScopeParaAccionBiometrica,
    gnSyncBiometricScopeSiSesionActiva,
} from './login-biometric-scope.js';

function _gnIsAndroidGestorNovaShell() {
    try {
        if (typeof window.AndroidConfig !== 'undefined' && window.AndroidConfig != null) return true;
        const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '';
        return /GestorNova\//i.test(ua);
    } catch (_) {
        return false;
    }
}

let _gnLoginWrapInstalled = false;
/** @type {ReturnType<typeof setTimeout> | null} */
let _gnBioOfferTimer = null;

function _gnScheduleOfferSaveBiometricAfterLogin(em0, pw0) {
    if (!_gnIsAndroidGestorNovaShell() || !em0 || !pw0) return;
    const offer = () => {
        try {
            if (!document.body?.classList.contains('gn-sesion-activa')) return;
            _gnOfferSaveBiometricIfNeeded(em0, pw0);
        } catch (_) {}
    };
    if (_gnBioOfferTimer) clearTimeout(_gnBioOfferTimer);
    _gnBioOfferTimer = setTimeout(() => {
        _gnBioOfferTimer = null;
        offer();
    }, 650);
    setTimeout(offer, 120);
    setTimeout(offer, 900);
}

function _gnWrapLoginHandler(fn) {
    if (typeof fn !== 'function' || fn._gnBioLoginWrap) return fn;
    const wrapped = async function (e) {
        const em0 = (document.getElementById('em')?.value || '').trim();
        const pw0 = document.getElementById('pw')?.value || '';
        try {
            return await fn.apply(this, arguments);
        } finally {
            _gnScheduleOfferSaveBiometricAfterLogin(em0, pw0);
        }
    };
    wrapped._gnBioLoginWrap = true;
    return wrapped;
}

function _gnInstallLoginSubmitWrap() {
    if (_gnLoginWrapInstalled) return;
    const fn = typeof window !== 'undefined' ? window.__gnEjecutarLogin : null;
    if (typeof fn !== 'function' || fn._gnBioLoginWrap) return;
    window.__gnEjecutarLogin = _gnWrapLoginHandler(fn);
    _gnLoginWrapInstalled = true;
}

/** Intercepta la asignación de __gnEjecutarLogin en app.js (primer arranque, antes del poll). */
function _gnInstallLoginHandlerTrap() {
    if (typeof window === 'undefined' || window.__gnLoginHandlerTrapInstalled) return;
    let current = window.__gnEjecutarLogin;
    try {
        Object.defineProperty(window, '__gnEjecutarLogin', {
            configurable: true,
            enumerable: true,
            get() {
                return current;
            },
            set(fn) {
                current = _gnWrapLoginHandler(fn);
                _gnLoginWrapInstalled = !!(current && current._gnBioLoginWrap);
            },
        });
        window.__gnLoginHandlerTrapInstalled = true;
        if (typeof current === 'function') {
            current = _gnWrapLoginHandler(current);
        }
    } catch (_) {
        _gnScheduleWrapPoll();
    }
}

function _gnUserDeclinedBiometricSave() {
    const B = window.AndroidBiometric;
    try {
        return typeof B?.hasUserDeclinedBiometricSave === 'function' && !!B.hasUserDeclinedBiometricSave();
    } catch (_) {
        return false;
    }
}

function _gnOfferSaveBiometricIfNeeded(em, pw) {
    if (!em || !pw) return;
    const B = window.AndroidBiometric;
    if (!B || typeof B.isAvailable !== 'function' || !B.isAvailable()) return;
    gnSyncBiometricScopeSiSesionActiva();
    if (typeof B.hasSavedLogin === 'function' && B.hasSavedLogin()) return;
    if (_gnUserDeclinedBiometricSave()) return;
    if (typeof B.saveLoginWithBiometric !== 'function') return;
    const { tid, bt } = gnBioScopeParaAccionBiometrica();
    try {
        B.saveLoginWithBiometric(em, pw, tid, bt);
    } catch (e) {
        console.warn('[bio-login] save offer', e);
    }
}

function _gnMountLoginListenerForLsVisibility() {
    const ls = document.getElementById('ls');
    if (!ls || ls.dataset.gnBioLsObserved === '1') return;
    ls.dataset.gnBioLsObserved = '1';
    const refresh = () => {
        try {
            if (!ls.classList.contains('active')) return;
            if (typeof window.__gnRefreshLoginBiometricUi === 'function') {
                window.__gnRefreshLoginBiometricUi();
            }
        } catch (_) {}
    };
    try {
        const mo = new MutationObserver(() => refresh());
        mo.observe(ls, { attributes: true, attributeFilter: ['class'] });
    } catch (_) {}
    const gw = document.getElementById('gw');
    if (gw) {
        try {
            const moGw = new MutationObserver(() => refresh());
            moGw.observe(gw, { attributes: true, attributeFilter: ['class'] });
        } catch (_) {}
    }
    refresh();
}

function _gnScheduleWrapPoll() {
    if (typeof window === 'undefined') return;
    let n = 0;
    const t = setInterval(() => {
        _gnInstallLoginSubmitWrap();
        if (_gnLoginWrapInstalled || ++n > 200) clearInterval(t);
    }, 150);
}

function _gnSetBiometricFlowActive(on) {
    try {
        window.__gnBiometricLoginFlow = !!on;
    } catch (_) {}
}

function _gnBioUiClick(ev) {
    const t = ev.target;
    if (!t || !t.id) return;
    const B = window.AndroidBiometric;
    if (!B) return;
    if (t.id === 'gn-bio-login-btn') {
        if (typeof B.hasSavedLogin === 'function' && !B.hasSavedLogin()) {
            try {
                window.toast?.(
                    'Primero ingresá con usuario y contraseña y guardá el acceso con huella.',
                    'info'
                );
            } catch (_) {}
            return;
        }
        const { tid, bt } = gnBioScopeParaAccionBiometrica();
        _gnSetBiometricFlowActive(true);
        try {
            if (typeof B.loginWithBiometric === 'function') {
                B.loginWithBiometric(tid, bt);
            }
        } catch (e) {
            console.warn('[bio-login]', e);
        } finally {
            setTimeout(() => _gnSetBiometricFlowActive(false), 8000);
        }
        return;
    }
    if (t.id === 'gn-bio-save-btn') {
        const em = (document.getElementById('em')?.value || '').trim();
        const pw = document.getElementById('pw')?.value || '';
        if (!em || !pw) {
            try {
                window.toast?.(
                    'Completá usuario y contraseña e ingresá; después podés guardar para huella.',
                    'info'
                );
            } catch (_) {}
            return;
        }
        const { tid, bt } = gnBioScopeParaAccionBiometrica();
        gnSyncBiometricScopeSiSesionActiva();
        _gnSetBiometricFlowActive(true);
        try {
            if (typeof B.saveLoginWithBiometric === 'function') {
                B.saveLoginWithBiometric(em, pw, tid, bt);
            }
        } catch (e) {
            console.warn('[bio-save]', e);
        } finally {
            setTimeout(() => _gnSetBiometricFlowActive(false), 12000);
        }
        return;
    }
    if (t.id === 'gn-bio-decline-btn') {
        try {
            if (typeof B.declineSaveLoginBiometricOffer === 'function') B.declineSaveLoginBiometricOffer();
        } catch (e) {
            console.warn('[bio-decline]', e);
        }
    }
}

function _gnMountLoginBiometricUi() {
    const wrap = document.getElementById('gn-login-bio-android');
    const B = typeof window !== 'undefined' ? window.AndroidBiometric : null;
    if (!wrap || !B || typeof B.isAvailable !== 'function' || !B.isAvailable()) {
        if (wrap) wrap.style.display = 'none';
        return;
    }
    wrap.style.display = 'flex';
    const declined = _gnUserDeclinedBiometricSave();
    if (wrap.dataset.gnBioUiBuilt !== '1') {
        wrap.dataset.gnBioUiBuilt = '1';
        wrap.innerHTML = `
      <button type="button" class="btn-sm primary" id="gn-bio-login-btn" style="max-width:18rem">Entrar con huella</button>
      <span id="gn-bio-hint" style="font-size:.68rem;color:rgba(255,255,255,.82);line-height:1.35"></span>
      <button type="button" class="btn-sm" id="gn-bio-save-btn" style="max-width:18rem;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.35);color:#e2e8f0">Guardar acceso para huella</button>
      <button type="button" class="btn-sm" id="gn-bio-decline-btn" style="max-width:18rem;background:transparent;border:1px solid rgba(255,255,255,.28);color:rgba(255,255,255,.88)">No quiero guardar huella en este dispositivo</button>`;
        wrap.addEventListener('click', _gnBioUiClick);
    }
    const hint = document.getElementById('gn-bio-hint');
    if (hint) {
        hint.textContent = declined
            ? 'Podés guardar el acceso con huella cuando quieras con el botón de abajo, o seguir sin guardar.'
            : 'Tras un ingreso correcto te pedimos huella o rostro para guardar el acceso. Si falla o cancelás, podés reintentar hasta lograrlo o elegir «No quiero guardar».';
    }
    const has =
        typeof B.hasSavedLogin === 'function' &&
        (() => {
            try {
                return !!B.hasSavedLogin();
            } catch (_) {
                return false;
            }
        })();
    const loginBtn = document.getElementById('gn-bio-login-btn');
    const saveBtn = document.getElementById('gn-bio-save-btn');
    const declineBtn = document.getElementById('gn-bio-decline-btn');
    if (loginBtn) loginBtn.style.display = has ? '' : 'none';
    if (saveBtn) saveBtn.style.display = '';
    if (declineBtn) {
        declineBtn.style.display = has ? 'none' : '';
        declineBtn.disabled = declined;
        if (declined) declineBtn.style.opacity = '0.55';
        else declineBtn.style.opacity = '';
    }
}

/** Purga explícita (cambio de credenciales, olvidar acceso). No usar en logout normal. */
function _gnPurgarHuellaGuardadaExplicitamente() {
    const B = window.AndroidBiometric;
    if (!B || typeof B.clearSavedLogin !== 'function') return;
    try {
        B.clearSavedLogin();
    } catch (_) {}
}

if (typeof window !== 'undefined') {
    window.__gnRefreshLoginBiometricUi = _gnMountLoginBiometricUi;
    window.__gnPurgarHuellaGuardadaExplicitamente = _gnPurgarHuellaGuardadaExplicitamente;
    window.__gnPurgarHuellaAlCerrarSesion = _gnPurgarHuellaGuardadaExplicitamente;
    try {
        window.addEventListener('gestornova-app-ready', () => gnSyncBiometricScopeSiSesionActiva());
    } catch (_) {}
    _gnInstallLoginHandlerTrap();
    _gnScheduleWrapPoll();
    _gnMountLoginListenerForLsVisibility();
    const boot = () => {
        _gnInstallLoginSubmitWrap();
        _gnMountLoginBiometricUi();
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => boot(), { once: true });
    } else {
        boot();
    }
}
