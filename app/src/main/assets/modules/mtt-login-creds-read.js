/**
 * Email/contraseña del formulario de login para el modal tenant (técnico).
 * 1) Preferir campos dentro del modal (el login de atrás suele estar vacío o tapado).
 * 2) Si no, #em / #pw del login.
 * 3) Fallback señuelo .gn-login-decoy (autocompletado del navegador).
 */
export function leerEmPwLoginParaMtt() {
    const mEm = (document.getElementById('mtt-android-login-em')?.value || '').trim();
    const mPw = document.getElementById('mtt-android-login-pw')?.value || '';
    if (mEm && mPw) {
        return { em: mEm, pw: mPw };
    }
    let em = (document.getElementById('em')?.value || '').trim();
    let pw = document.getElementById('pw')?.value || '';
    if (em && pw) return { em, pw };
    try {
        const decoy = document.querySelector('#lf .gn-login-decoy');
        if (!decoy) return { em, pw };
        const nodes = decoy.querySelectorAll('input');
        const dEm = (nodes[0]?.value || '').trim();
        const dPw = nodes[1]?.value || '';
        if (dEm && dPw) {
            const emEl = document.getElementById('em');
            const pwEl = document.getElementById('pw');
            if (emEl && !em) emEl.value = dEm;
            if (pwEl && !pw) pwEl.value = dPw;
            return { em: dEm, pw: dPw };
        }
    } catch (_) {}
    return { em, pw };
}
