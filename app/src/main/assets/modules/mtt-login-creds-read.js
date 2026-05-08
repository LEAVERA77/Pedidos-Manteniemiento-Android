/**
 * Email/contraseña del login principal (#em / #pw o señuelo .gn-login-decoy).
 * El modal tenant solo pide la clave de técnico; admin va en el formulario de arriba.
 */
export function leerEmPwLoginParaMtt() {
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
