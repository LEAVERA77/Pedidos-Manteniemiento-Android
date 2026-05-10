/**
 * Etiqueta de versión en login (#app-version): Android (nombre + build) o versión web.
 * Reintenta en DOMContentLoaded y al volver a mostrar la pantalla de login (#ls.active).
 */
function esAndroidApp() {
    return (
        /GestorNova\//i.test(navigator.userAgent) ||
        /Nexxo\//i.test(navigator.userAgent) ||
        window.location.protocol === 'file:'
    );
}

function refreshAppVersionLabel(webVersionLabel) {
    const el = document.getElementById('app-version');
    if (!el) return;
    try {
        if (esAndroidApp() && window.AndroidConfig && typeof window.AndroidConfig.getAppVersion === 'function') {
            let text = 'Versión ' + String(window.AndroidConfig.getAppVersion());
            if (typeof window.AndroidConfig.getVersionCode === 'function') {
                text += ' (build ' + String(window.AndroidConfig.getVersionCode()) + ')';
            }
            el.textContent = text;
            return;
        }
        const wv = webVersionLabel != null && String(webVersionLabel) !== '' ? String(webVersionLabel) : '';
        if (wv) el.textContent = 'Versión web ' + wv;
    } catch (_) {}
}

export function initAndroidAppVersionDisplay(webVersionLabel) {
    const schedule = () => {
        try {
            refreshAppVersionLabel(webVersionLabel);
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(() => refreshAppVersionLabel(webVersionLabel));
            }
            setTimeout(() => refreshAppVersionLabel(webVersionLabel), 0);
            setTimeout(() => refreshAppVersionLabel(webVersionLabel), 400);
        } catch (_) {}
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', schedule, { once: true });
    } else schedule();

    const ls = document.getElementById('ls');
    if (ls && typeof MutationObserver !== 'undefined') {
        try {
            const mo = new MutationObserver(() => {
                if (ls.classList.contains('active')) schedule();
            });
            mo.observe(ls, { attributes: true, attributeFilter: ['class'] });
        } catch (_) {}
    }
}
