/**
 * Aviso cuando hay una nueva versión del service worker / caché shell.
 * made by leavera77
 */

const LS_SEEN = 'pmg_sw_version_seen';
const BANNER_ID = 'gn-sw-update-banner';

function parseSwVersion(text) {
    const m = String(text || '').match(/SW_VERSION\s*=\s*['"]([^'"]+)['"]/);
    return m?.[1] || '';
}

function showUpdateBanner(version) {
    if (document.getElementById(BANNER_ID)) return;
    const bar = document.createElement('div');
    bar.id = BANNER_ID;
    bar.className = 'gn-sw-update-banner';
    bar.setAttribute('role', 'status');
    bar.innerHTML = `
<span><i class="fas fa-download" aria-hidden="true"></i> Hay una actualización (${version || 'nueva'})</span>
<button type="button" class="gn-sw-update-btn" data-gn-sw-reload>Recargar</button>
<button type="button" class="gn-sw-update-dismiss" data-gn-sw-dismiss aria-label="Cerrar">×</button>`;
    document.body.appendChild(bar);
    bar.querySelector('[data-gn-sw-reload]')?.addEventListener('click', () => {
        try {
            localStorage.setItem(LS_SEEN, version || '');
        } catch (_) {}
        window.location.reload();
    });
    bar.querySelector('[data-gn-sw-dismiss]')?.addEventListener('click', () => bar.remove());
}

async function fetchRemoteSwVersion() {
    try {
        const url = new URL('sw.js', window.location.href).href;
        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok) return '';
        return parseSwVersion(await r.text());
    } catch (_) {
        return '';
    }
}

function wireRegistration(reg) {
    if (!reg) return;
    reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                fetchRemoteSwVersion().then((v) => showUpdateBanner(v));
            }
        });
    });
}

(async function initGnSwUpdatePrompt() {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    try {
        const remote = await fetchRemoteSwVersion();
        let seen = '';
        try {
            seen = localStorage.getItem(LS_SEEN) || '';
        } catch (_) {}
        if (remote && seen && remote !== seen) {
            showUpdateBanner(remote);
        } else if (remote && !seen) {
            try {
                localStorage.setItem(LS_SEEN, remote);
            } catch (_) {}
        }
        const reg = await navigator.serviceWorker.getRegistration();
        wireRegistration(reg);
        await reg?.update?.();
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            fetchRemoteSwVersion().then((v) => {
                if (v && v !== seen) showUpdateBanner(v);
            });
        });
    } catch (_) {}
})();
