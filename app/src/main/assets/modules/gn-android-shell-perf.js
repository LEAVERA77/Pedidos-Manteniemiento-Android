/**
 * WebView Android: clase en <html> para CSS de fluidez (mapa, detalle pedido) sin tocar app.js.
 * made by leavera77
 */
(function initGnAndroidShellPerf() {
    try {
        if (typeof window === 'undefined' || !window.document) return;
        const ac = window.AndroidConfig;
        if (ac == null) return;
        document.documentElement.classList.add('gn-android-shell');
    } catch (_) {}
})();
