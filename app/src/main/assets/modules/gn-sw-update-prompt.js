/**
 * Aviso cuando hay una nueva versión del service worker / caché shell.
 * Tras Recargar o cerrar (×), no vuelve a mostrarse para la misma SW_VERSION.
 * made by leavera77
 */

const LS_SEEN = 'pmg_sw_version_seen';
const BANNER_ID = 'gn-sw-update-banner';

function parseSwVersion(text) {
    const m = String(text || '').match(/SW_VERSION\s*=\s*['"]([^'"]+)['"]/);
    return m?.[1] || '';
}

function getSeenVersion() {
    try {
        return localStorage.getItem(LS_SEEN) || '';
    } catch (_) {
        return '';
    }
}

function markVersionSeen(version) {
    const v = String(version || '').trim();
    if (!v) return;
    try {
        localStorage.setItem(LS_SEEN, v);
    } catch (_) {}
}

/** Solo mostrar si hay versión remota distinta a la ya reconocida por el usuario. */
function shouldPromptForVersion(remote) {
    const r = String(remote || '').trim();
    if (!r) return false;
    return r !== getSeenVersion();
}

export function showUpdateBanner(version) {
    const remote = String(version || '').trim();
    if (!remote || !shouldPromptForVersion(remote)) return;
    if (document.getElementById(BANNER_ID)) return;

    const bar = document.createElement('div');
    bar.id = BANNER_ID;
    bar.className = 'gn-sw-update-banner';
    bar.setAttribute('role', 'status');
    bar.innerHTML = `
<span><i class="fas fa-download" aria-hidden="true"></i> Hay una actualización (${remote})</span>
<button type="button" class="gn-sw-update-btn" data-gn-sw-reload>Recargar</button>
<button type="button" class="gn-sw-update-dismiss" data-gn-sw-dismiss aria-label="Cerrar">×</button>`;
    document.body.appendChild(bar);

    bar.querySelector('[data-gn-sw-reload]')?.addEventListener('click', () => {
        markVersionSeen(remote);
        window.location.reload();
    });
    bar.querySelector('[data-gn-sw-dismiss]')?.addEventListener('click', () => {
        markVersionSeen(remote);
        bar.remove();
    });
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
            if (nw.state !== 'installed' || !navigator.serviceWorker.controller) return;
            fetchRemoteSwVersion().then((v) => {
                if (shouldPromptForVersion(v)) showUpdateBanner(v);
            });
        });
    });
}

(async function initGnSwUpdatePrompt() {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    try {
        const remote = await fetchRemoteSwVersion();
        if (remote) {
            const seen = getSeenVersion();
            if (!seen) {
                markVersionSeen(remote);
            } else if (shouldPromptForVersion(remote)) {
                showUpdateBanner(remote);
            }
        }

        const reg = await navigator.serviceWorker.getRegistration();
        wireRegistration(reg);

        if (reg?.waiting && shouldPromptForVersion(remote)) {
            showUpdateBanner(remote);
        }

        await reg?.update?.();

        navigator.serviceWorker.addEventListener('controllerchange', () => {
            fetchRemoteSwVersion().then((v) => {
                if (v) markVersionSeen(v);
            });
        });
    } catch (_) {}
})();
