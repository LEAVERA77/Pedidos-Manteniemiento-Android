/**
 * Aviso / bloqueo de actualización APK y assets (SW_VERSION) en Android WebView.
 * made by leavera77
 */

const BANNER_ID = 'gn-app-version-banner';
const SCREEN_ID = 'gn-force-update-screen';
const LS_SW_ACTIVE = 'pmg_active_sw_version';

function isAndroidShell() {
    try {
        return (
            document.documentElement.classList.contains('gn-android-shell') ||
            typeof window.AndroidConfig !== 'undefined'
        );
    } catch (_) {
        return false;
    }
}

function localApkCode() {
    try {
        const ac = window.AndroidConfig;
        if (ac && typeof ac.getVersionCode === 'function') {
            return parseInt(ac.getVersionCode(), 10) || 0;
        }
    } catch (_) {}
    try {
        return parseInt(localStorage.getItem('pmg_stored_app_version_code') || '0', 10) || 0;
    } catch (_) {
        return 0;
    }
}

function parseSwVersion(text) {
    const m = String(text || '').match(/SW_VERSION\s*=\s*['"]([^'"]+)['"]/);
    return m?.[1] || '';
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

function activeSwVersion() {
    try {
        return localStorage.getItem(LS_SW_ACTIVE) || '';
    } catch (_) {
        return '';
    }
}

function setActiveSwVersion(v) {
    const s = String(v || '').trim();
    if (!s) return;
    try {
        localStorage.setItem(LS_SW_ACTIVE, s);
    } catch (_) {}
}

function showBanner(text, force) {
    if (document.getElementById(BANNER_ID) || document.getElementById(SCREEN_ID)) return;
    const el = document.createElement('div');
    el.id = BANNER_ID;
    el.className = 'gn-app-version-banner';
    el.innerHTML = `<span>${text}</span>${force ? '' : '<button type="button" data-gn-av-dismiss>×</button>'}`;
    document.body.appendChild(el);
    el.querySelector('[data-gn-av-dismiss]')?.addEventListener('click', () => el.remove());
}

/**
 * @param {{ title: string, body: string, primaryLabel?: string, onPrimary?: () => void, secondaryLabel?: string, onSecondary?: () => void, mandatory?: boolean }} opts
 */
function showForceUpdateScreen(opts) {
    if (document.getElementById(SCREEN_ID)) return;
    const el = document.createElement('div');
    el.id = SCREEN_ID;
    el.className = 'gn-force-update-screen';
    el.setAttribute('role', 'alertdialog');
    el.setAttribute('aria-modal', 'true');
    const primaryLabel = opts.primaryLabel || 'Actualizar ahora';
    const secondary =
        opts.secondaryLabel && !opts.mandatory
            ? `<button type="button" class="gn-force-update-screen__sec" data-gn-fu-secondary>${opts.secondaryLabel}</button>`
            : '';
    el.innerHTML = `
<div class="gn-force-update-screen__card">
  <div class="gn-force-update-screen__icon" aria-hidden="true"><i class="fas fa-download"></i></div>
  <h2 class="gn-force-update-screen__title">${opts.title}</h2>
  <p class="gn-force-update-screen__body">${opts.body}</p>
  <div class="gn-force-update-screen__actions">
    <button type="button" class="gn-force-update-screen__primary" data-gn-fu-primary>${primaryLabel}</button>
    ${secondary}
  </div>
</div>`;
    document.body.appendChild(el);
    try {
        document.documentElement.classList.add('gn-force-update-active');
    } catch (_) {}
    el.querySelector('[data-gn-fu-primary]')?.addEventListener('click', () => {
        try {
            opts.onPrimary?.();
        } catch (_) {}
    });
    el.querySelector('[data-gn-fu-secondary]')?.addEventListener('click', () => {
        try {
            opts.onSecondary?.();
        } catch (_) {}
        el.remove();
        try {
            document.documentElement.classList.remove('gn-force-update-active');
        } catch (_) {}
    });
}

function applyNativeUpdatePayload(data) {
    const ac = window.AndroidConfig;
    if (!ac?.applyUpdateCheckFromNeon) return;
    try {
        ac.applyUpdateCheckFromNeon(
            JSON.stringify({
                versionCode: parseInt(data.versionCode, 10) || 0,
                versionName: data.versionName || '',
                apkUrl: data.apkUrl || '',
                releaseNotes: data.releaseNotes || '',
                forceUpdate: !!data.forceUpdate,
            })
        );
    } catch (_) {}
}

async function checkApkVersionGate() {
    if (!isAndroidShell()) return;
    try {
        const base =
            typeof window.apiUrl === 'function'
                ? window.apiUrl('/api/app-version')
                : '/api/app-version';
        const r = await fetch(base, { cache: 'no-store' });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) return;
        const remote = parseInt(data.versionCode, 10) || 0;
        const local = localApkCode();
        if (remote <= local) return;

        const msg = `Hay una actualización (${data.versionName || remote}). Descargala para seguir trabajando.`;
        applyNativeUpdatePayload(data);

        if (data.forceUpdate) {
            showForceUpdateScreen({
                title: 'Actualizá la app',
                body: msg,
                primaryLabel: data.apkUrl ? 'Descargar actualización' : 'Reintentar',
                mandatory: true,
                onPrimary: () => {
                    if (data.apkUrl) {
                        try {
                            window.open(data.apkUrl, '_blank');
                        } catch (_) {}
                    }
                    try {
                        window.AndroidConfig?.requestUpdateCheck?.();
                    } catch (_) {}
                },
            });
            return;
        }
        showBanner(msg, false);
    } catch (_) {}
}

async function checkShellAssetsGate() {
    const remote = await fetchRemoteSwVersion();
    if (!remote) return;

    const active = activeSwVersion();
    if (!active) {
        setActiveSwVersion(remote);
        return;
    }
    if (remote === active) return;

    const body =
        'La versión embebida de la app quedó desactualizada. Recargá para descargar los archivos nuevos antes de seguir en campo.';

    if (isAndroidShell()) {
        showForceUpdateScreen({
            title: 'Actualizá la app',
            body: `${body} (v${remote})`,
            primaryLabel: 'Recargar ahora',
            mandatory: true,
            onPrimary: () => {
                setActiveSwVersion(remote);
                window.location.reload();
            },
        });
        return;
    }

    try {
        const mod = await import('./gn-sw-update-prompt.js');
        if (typeof mod.showUpdateBanner === 'function') mod.showUpdateBanner(remote);
    } catch (_) {
        showBanner(`Actualización de interfaz disponible (${remote}). Recargá la página.`, false);
    }
}

export async function checkAppVersionGate() {
    await checkApkVersionGate();
    await checkShellAssetsGate();
}

function initGnAppVersionGate() {
    const run = () => void checkAppVersionGate();
    document.addEventListener('gn-ms-visible', () => setTimeout(run, 1200));
    if (document.getElementById('ms')?.classList.contains('active')) {
        setTimeout(run, 2000);
    }
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready
            .then(() => fetchRemoteSwVersion())
            .then((v) => {
                if (v) setActiveSwVersion(v);
            })
            .catch(() => {});
    }
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initGnAppVersionGate, { once: true });
    } else {
        initGnAppVersionGate();
    }
}
