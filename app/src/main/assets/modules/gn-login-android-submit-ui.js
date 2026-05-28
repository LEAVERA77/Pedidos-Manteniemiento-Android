/**
 * WebView Android: evita que los inputs del login se achiquen al pulsar Ingresar.
 * made by leavera77
 */

function esShellAndroidGestorNova() {
    try {
        if (typeof window.AndroidConfig !== 'undefined' && window.AndroidConfig != null) return true;
        const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '';
        return /GestorNova\//i.test(ua);
    } catch (_) {
        return false;
    }
}

function fijarLayoutLoginAndroid() {
    const lf = document.getElementById('lf');
    const lb = document.getElementById('lb');
    if (!lf || !lb) return;

    lf.classList.add('gn-login-form-stable');
    document.getElementById('ls')?.classList.add('gn-login-modern');

    if (lb.dataset.gnLoginSubmitBound === '1') return;
    lb.dataset.gnLoginSubmitBound = '1';

    const marcarCargando = () => {
        lf.classList.add('gn-login-form--loading');
        lb.classList.add('gn-login-btn--loading');
    };

    lb.addEventListener(
        'click',
        () => {
            marcarCargando();
        },
        { capture: true }
    );

    lf.addEventListener(
        'submit',
        (ev) => {
            try {
                ev.preventDefault();
            } catch (_) {}
            marcarCargando();
        },
        { capture: true }
    );
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (esShellAndroidGestorNova()) fijarLayoutLoginAndroid();
        }, { once: true });
    } else if (esShellAndroidGestorNova()) {
        fijarLayoutLoginAndroid();
    }
    try {
        window.addEventListener('gestornova-app-ready', () => {
            if (esShellAndroidGestorNova()) fijarLayoutLoginAndroid();
        });
    } catch (_) {}
}
