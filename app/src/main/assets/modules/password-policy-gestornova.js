/**
 * Misma política mínima que el panel admin → Contraseña (`cambiarContrasena`).
 * made by leavera77
 */

export const MIN_PASSWORD_LEN_GESTORNOVA = 4;

/** El usuario no debe pegar un hash bcrypt como contraseña. */
export function pareceHashBcryptGestornova(s) {
    const t = String(s ?? '').trim();
    return /^\$2[aby]\$\d{2}\$/.test(t);
}

/** @param {unknown} nueva */
export function mensajePasswordNuevaNoValidaGestornova(nueva) {
    const t = String(nueva ?? '').trim();
    if (!t) return 'Completá la contraseña.';
    if (pareceHashBcryptGestornova(t)) {
        return 'Ingresá la contraseña en texto plano (no el código que empieza con $2a$ o $2b$).';
    }
    if (t.length < MIN_PASSWORD_LEN_GESTORNOVA) {
        return `La contraseña debe tener al menos ${MIN_PASSWORD_LEN_GESTORNOVA} caracteres.`;
    }
    return '';
}

/**
 * Validación de par nueva + confirmar (misma regla que pestaña Contraseña).
 * @returns {{ ok: true, skipped: true } | { ok: true, skipped: false, nueva: string } | { ok: false, error: string }}
 */
export function validarParPasswordNuevoConfirmacionGestornova(nueva, confirmar) {
    const n = String(nueva ?? '').trim();
    const c = String(confirmar ?? '').trim();
    if (!n && !c) return { ok: true, skipped: true };
    if (!n || !c) {
        return {
            ok: false,
            error: 'Completá nueva contraseña y confirmación, o dejá ambas vacías si solo cambiás usuario o nombre.',
        };
    }
    if (n !== c) return { ok: false, error: 'Las contraseñas nuevas no coinciden.' };
    const inv = mensajePasswordNuevaNoValidaGestornova(n);
    if (inv) return { ok: false, error: inv };
    return { ok: true, skipped: false, nueva: n };
}
