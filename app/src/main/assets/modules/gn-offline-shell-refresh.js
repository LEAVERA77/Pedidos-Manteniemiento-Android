/**
 * Refresca el badge de cola offline al volver de segundo plano o tras eventos de red (WebView técnico).
 * No duplica la lógica de sincronización (sigue en app.js / sincronizarOffline).
 * made by leavera77
 */
import { actualizarBadgeOffline } from '../offline.js';

(function initGnOfflineShellRefresh() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const poke = () => {
        try {
            actualizarBadgeOffline();
        } catch (_) {}
    };
    window.addEventListener('pageshow', poke);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') poke();
    });
    window.addEventListener('offline', poke);
    window.addEventListener('online', () => {
        window.setTimeout(poke, 900);
    });
})();
