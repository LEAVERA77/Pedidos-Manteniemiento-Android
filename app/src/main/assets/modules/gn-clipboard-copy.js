/**
 * Copiar texto al portapapeles: WebView Android (AndroidDevice), Clipboard API, fallback execCommand.
 * Expone window.copiarTexto (onclick en detalle de pedido / coords).
 * made by leavera77
 */

function copiarTextoFallbackDOM(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.setAttribute('aria-hidden', 'true');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try {
        ok = document.execCommand('copy');
    } catch (_) {}
    try {
        document.body.removeChild(ta);
    } catch (_) {}
    return ok;
}

/**
 * @param {string} raw
 * @param {{ okMessage?: string }} [opts]
 * @returns {Promise<void>}
 */
export async function copiarTextoContenido(raw, opts = {}) {
    const t = String(raw ?? '');
    const okMsg = opts.okMessage || 'Copiado al portapapeles';
    const toastFn = typeof window !== 'undefined' && typeof window.toast === 'function' ? window.toast : () => {};

    if (typeof window !== 'undefined' && window.AndroidDevice && typeof window.AndroidDevice.copyText === 'function') {
        try {
            window.AndroidDevice.copyText(t);
            toastFn(okMsg, 'success');
            return;
        } catch (_) {}
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        try {
            await navigator.clipboard.writeText(t);
            toastFn(okMsg, 'success');
            return;
        } catch (_) {
            if (copiarTextoFallbackDOM(t)) {
                toastFn(okMsg, 'success');
                return;
            }
            toastFn('Error al copiar', 'error');
            return;
        }
    }

    if (copiarTextoFallbackDOM(t)) toastFn(okMsg, 'success');
    else toastFn('Error al copiar', 'error');
}

export function installGnClipboardCopy() {
    if (typeof window === 'undefined') return;
    window.copiarTexto = function (texto) {
        void copiarTextoContenido(String(texto ?? ''));
    };
}
