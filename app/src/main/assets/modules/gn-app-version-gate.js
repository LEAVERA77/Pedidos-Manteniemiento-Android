/**
 * Aviso de actualización APK / shell (Android WebView y referencia web).
 * made by leavera77
 */

const BANNER_ID = 'gn-app-version-banner';

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

function localCode() {
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

function showBanner(text, force) {
    if (document.getElementById(BANNER_ID)) return;
    const el = document.createElement('div');
    el.id = BANNER_ID;
    el.className = 'gn-app-version-banner';
    el.innerHTML = `<span>${text}</span>${force ? '' : '<button type="button" data-gn-av-dismiss>×</button>'}`;
    document.body.appendChild(el);
    el.querySelector('[data-gn-av-dismiss]')?.addEventListener('click', () => el.remove());
}

export async function checkAppVersionGate() {
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
        const local = localCode();
        if (remote > local) {
            const msg = `Hay una actualización (${data.versionName || remote}). Descargala desde el panel o actualizá la APK.`;
            showBanner(msg, !!data.forceUpdate);
            const ac = window.AndroidConfig;
            if (ac?.applyUpdateCheckFromNeon) {
                ac.applyUpdateCheckFromNeon(
                    JSON.stringify({
                        versionCode: remote,
                        versionName: data.versionName || '',
                        apkUrl: data.apkUrl || '',
                        releaseNotes: data.releaseNotes || '',
                        forceUpdate: !!data.forceUpdate,
                    })
                );
            }
        }
    } catch (_) {}
}

function initGnAppVersionGate() {
    document.addEventListener('gn-ms-visible', () => {
        setTimeout(() => void checkAppVersionGate(), 2000);
    });
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initGnAppVersionGate, { once: true });
    } else initGnAppVersionGate();
}
