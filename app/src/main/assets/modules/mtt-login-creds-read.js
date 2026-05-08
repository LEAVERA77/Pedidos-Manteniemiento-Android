/**
 * Email/contraseña para el modal tenant (técnico).
 * Email: #mtt-android-login-em si está, si no #em / señuelo.
 * Contraseña: solo #pw o señuelo (no hay campo pw en el modal).
 */
export function leerEmPwLoginParaMtt() {
    const mEm = (document.getElementById('mtt-android-login-em')?.value || '').trim();
    let em = (document.getElementById('em')?.value || '').trim();
    let pw = document.getElementById('pw')?.value || '';
    if (mEm) em = mEm;
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
            const emFinal = mEm || em || dEm;
            if (emEl && !mEm && !em) emEl.value = dEm;
            if (pwEl && !pw) pwEl.value = dPw;
            const pwFinal = pw || dPw;
            if (emFinal && pwFinal) return { em: emFinal, pw: pwFinal };
        }
    } catch (_) {}
    return { em, pw };
}
