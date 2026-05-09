/**
 * Login con huella en Android WebView (puente nativo AndroidBiometric).
 * made by leavera77
 */

function _gnBioEsc(s) {
    return String(s ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\r|\n/g, ' ');
}

function _gnMountLoginBiometricUi() {
    const wrap = document.getElementById('gn-login-bio-android');
    const B = typeof window !== 'undefined' ? window.AndroidBiometric : null;
    if (!wrap || !B || typeof B.isAvailable !== 'function' || !B.isAvailable()) return;
    wrap.style.display = 'flex';
    wrap.innerHTML = `
      <button type="button" class="btn-sm primary" id="gn-bio-login-btn" style="max-width:18rem">Entrar con huella</button>
      <span style="font-size:.68rem;color:rgba(255,255,255,.82);line-height:1.35">Guardá usuario y contraseña en este dispositivo tras un ingreso correcto (solo esta app).</span>
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
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => _gnMountLoginBiometricUi(), { once: true });
    } else {
        _gnMountLoginBiometricUi();
    }
}
