/**
 * Login con huella en Android WebView (puente nativo AndroidBiometric).
 * Engancha {@code window.__gnEjecutarLogin} sin tocar app.js: tras login OK ofrece guardar con biométrica.
 * made by leavera77
 */

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

function _gnInstallLoginSubmitWrap() {
    if (_gnLoginWrapInstalled) return;
    const fn = typeof window !== 'undefined' ? window.__gnEjecutarLogin : null;
    if (typeof fn !== 'function' || fn._gnBioLoginWrap) return;
    const wrapped = async function (e) {
        const em0 = (document.getElementById('em')?.value || '').trim();
        const pw0 = document.getElementById('pw')?.value || '';
        try {
            return await fn.apply(this, arguments);
        } finally {
            queueMicrotask(() => {
                try {
                    if (!_gnIsAndroidGestorNovaShell()) return;
                    if (!document.body?.classList.contains('gn-sesion-activa')) return;
                    _gnOfferSaveBiometricIfNeeded(em0, pw0);
                } catch (_) {}
            });
        }
    };
    wrapped._gnBioLoginWrap = true;
    window.__gnEjecutarLogin = wrapped;
    _gnLoginWrapInstalled = true;
}

function _gnOfferSaveBiometricIfNeeded(em, pw) {
    if (!em || !pw) return;
    const B = window.AndroidBiometric;
    if (!B || typeof B.isAvailable !== 'function' || !B.isAvailable()) return;
    if (typeof B.hasSavedLogin === 'function' && B.hasSavedLogin()) return;
    if (typeof B.saveLoginWithBiometric !== 'function') return;
    try {
        B.saveLoginWithBiometric(em, pw);
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

function _gnMountLoginBiometricUi() {
    const wrap = document.getElementById('gn-login-bio-android');
    const B = typeof window !== 'undefined' ? window.AndroidBiometric : null;
    if (!wrap || !B || typeof B.isAvailable !== 'function' || !B.isAvailable()) {
        if (wrap) wrap.style.display = 'none';
        return;
    }
    wrap.style.display = 'flex';
    wrap.innerHTML = `
      <button type="button" class="btn-sm primary" id="gn-bio-login-btn" style="max-width:18rem">Entrar con huella</button>
      <span style="font-size:.68rem;color:rgba(255,255,255,.82);line-height:1.35">Tras un ingreso correcto te pedimos huella o rostro para guardar el acceso en este dispositivo (podés cancelar).</span>
      <button type="button" class="btn-sm" id="gn-bio-save-btn" style="max-width:18rem;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.35);color:#e2e8f0">Guardar acceso para huella</button>`;
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
    if (loginBtn) loginBtn.style.display = has ? '' : 'none';
    if (saveBtn) saveBtn.style.display = '';
    loginBtn?.addEventListener('click', () => {
        try {
            if (typeof B.loginWithBiometric === 'function') B.loginWithBiometric();
        } catch (e) {
            console.warn('[bio-login]', e);
        }
    });
    saveBtn?.addEventListener('click', () => {
        const em = (document.getElementById('em')?.value || '').trim();
        const pw = document.getElementById('pw')?.value || '';
        if (!em || !pw) {
            try {
                window.toast?.('Completá usuario y contraseña e ingresá; después podés guardar para huella.', 'info');
            } catch (_) {}
            return;
        }
        try {
            if (typeof B.saveLoginWithBiometric === 'function') B.saveLoginWithBiometric(em, pw);
        } catch (e) {
            console.warn('[bio-save]', e);
        }
    });
}

if (typeof window !== 'undefined') {
    window.__gnRefreshLoginBiometricUi = _gnMountLoginBiometricUi;
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
