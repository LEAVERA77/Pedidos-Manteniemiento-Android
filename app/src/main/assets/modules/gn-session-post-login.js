/**
 * Hooks tras mostrar pantalla principal (#ms) post-login.
 * made by leavera77
 */

export function notifyMainScreenVisible() {
    try {
        document.dispatchEvent(new CustomEvent('gn-ms-visible'));
    } catch (_) {}
}

if (typeof window !== 'undefined') {
    window.notifyMainScreenVisible = notifyMainScreenVisible;
}
