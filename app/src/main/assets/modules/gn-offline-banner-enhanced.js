/**
 * Barra offline más visible: cola pendiente y aviso al volver online.
 * made by leavera77
 */

import { offlineQueue } from '../offline.js';

const MSG_ID = 'gn-offline-banner-msg';

function queueLen() {
    try {
        return offlineQueue().length;
    } catch (_) {
        return 0;
    }
}

function setBannerMessage(banner, text) {
    let el = banner.querySelector(`#${MSG_ID}`);
    if (!el) {
        el = document.createElement('span');
        el.id = MSG_ID;
        el.className = 'gn-offline-banner-msg';
        const icon = banner.querySelector('i');
        if (icon?.nextSibling) banner.insertBefore(el, icon.nextSibling);
        else banner.prepend(el);
    }
    el.textContent = text;
}

function refreshOfflineBannerUi() {
    if (document.documentElement.classList.contains('gn-android-shell')) {
        return;
    }
    const banner = document.getElementById('offline-banner');
    if (!banner) return;
    const n = queueLen();
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (offline) {
        setBannerMessage(
            banner,
            n > 0
                ? `Sin conexión — ${n} cambio(s) en cola local`
                : 'Sin conexión — los pedidos se guardan localmente'
        );
        banner.classList.add('gn-offline-banner--active');
        return;
    }
    if (n > 0) {
        setBannerMessage(
            banner,
            `Conexión restablecida — ${n} cambio(s) pendiente(s) de sincronizar`
        );
        banner.classList.add('visible', 'gn-offline-banner--pending-sync');
        banner.classList.remove('hidden');
        return;
    }
    banner.classList.remove('gn-offline-banner--active', 'gn-offline-banner--pending-sync');
}

(function initGnOfflineBannerEnhanced() {
    if (typeof window === 'undefined') return;
    const tick = () => refreshOfflineBannerUi();
    window.addEventListener('pmg-offline-queue-changed', tick);
    window.addEventListener('offline', tick);
    window.addEventListener('online', () => window.setTimeout(tick, 400));
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') tick();
    });
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tick);
    } else {
        tick();
    }
})();
