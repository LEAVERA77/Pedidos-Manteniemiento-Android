/**
 * Barra fija inferior: sin red / cola offline (técnicos en campo).
 * made by leavera77
 */
import { offlineQueue } from '../offline.js';

const BAR_ID = 'gn-offline-status-bar';

function queueLen() {
    try {
        return offlineQueue().length;
    } catch (_) {
        return 0;
    }
}

function isOffline() {
    try {
        return typeof navigator !== 'undefined' && navigator.onLine === false;
    } catch (_) {
        return false;
    }
}

function ensureBar() {
    let bar = document.getElementById(BAR_ID);
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.className = 'gn-offline-status-bar';
    bar.setAttribute('role', 'status');
    bar.hidden = true;
    bar.innerHTML = `
<span class="gn-offline-status-bar__icon" aria-hidden="true"><i class="fas fa-wifi-slash"></i></span>
<span class="gn-offline-status-bar__text"></span>
<button type="button" class="gn-offline-status-bar__sync" hidden><i class="fas fa-sync"></i> Sincronizar</button>`;
    document.body.appendChild(bar);
    bar.querySelector('.gn-offline-status-bar__sync')?.addEventListener('click', () => {
        try {
            if (typeof window.sincronizarOffline === 'function') window.sincronizarOffline();
        } catch (_) {}
    });
    return bar;
}

function refreshBar() {
    const bar = ensureBar();
    const textEl = bar.querySelector('.gn-offline-status-bar__text');
    const syncBtn = bar.querySelector('.gn-offline-status-bar__sync');
    const n = queueLen();
    const offline = isOffline();

    if (!offline && n === 0) {
        bar.hidden = true;
        bar.classList.remove('gn-offline-status-bar--offline', 'gn-offline-status-bar--queue');
        try {
            document.documentElement.classList.remove('gn-has-offline-status-bar');
        } catch (_) {}
        return;
    }

    bar.hidden = false;
    try {
        document.documentElement.classList.add('gn-has-offline-status-bar');
    } catch (_) {}

    if (offline) {
        bar.classList.add('gn-offline-status-bar--offline');
        bar.classList.remove('gn-offline-status-bar--queue');
        if (textEl) {
            textEl.textContent =
                n > 0
                    ? `Sin red · ${n} cambio${n === 1 ? '' : 's'} en cola local`
                    : 'Sin red · los cambios se guardan en el dispositivo';
        }
        if (syncBtn) syncBtn.hidden = true;
        return;
    }

    bar.classList.remove('gn-offline-status-bar--offline');
    bar.classList.add('gn-offline-status-bar--queue');
    if (textEl) {
        textEl.textContent =
            n > 0
                ? `Cola offline · ${n} pendiente${n === 1 ? '' : 's'} de sincronizar`
                : 'Conexión restablecida';
    }
    if (syncBtn) syncBtn.hidden = n === 0;
}

(function initGnOfflineStatusBar() {
    if (typeof window === 'undefined') return;
    const tick = () => refreshBar();
    window.addEventListener('pmg-offline-queue-changed', tick);
    window.addEventListener('offline', tick);
    window.addEventListener('online', () => window.setTimeout(tick, 350));
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') tick();
    });
    document.addEventListener('gn-ms-visible', () => tick());
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tick);
    } else {
        tick();
    }
})();
