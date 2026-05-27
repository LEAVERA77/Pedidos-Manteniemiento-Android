/**
 * Android / WebView: panel #bp2 arrastrable (como moui-card), clamp al viewport y recuperación al mostrar.
 * made by leavera77
 */

import {
    clampBp2PanelIntoViewport,
    scheduleClampBp2PanelIntoViewport,
    installGnPanelDockObservers,
} from './gn-panel-docks.js';

function isAndroidShell() {
    try {
        return (
            document.documentElement.classList.contains('gn-android-shell') ||
            document.documentElement.classList.contains('gn-android-webview') ||
            typeof window.AndroidConfig !== 'undefined' ||
            (typeof window.esAndroidWebViewMapa === 'function' && window.esAndroidWebViewMapa())
        );
    } catch (_) {
        return false;
    }
}

function floatingBp2Enabled() {
    try {
        return (
            window.matchMedia('(min-width:1024px)').matches ||
            (typeof window.esAndroidWebViewMapa === 'function' && window.esAndroidWebViewMapa())
        );
    } catch (_) {
        return isAndroidShell();
    }
}

function marcarBp2Posicionado(bp2) {
    if (!bp2) return;
    bp2.classList.add('gn-bp2-positioned');
    try {
        bp2.style.right = 'auto';
        bp2.style.bottom = 'auto';
    } catch (_) {}
}

function aplicarPosicionBp2Guardada() {
    const bp2 = document.getElementById('bp2');
    if (!bp2 || !floatingBp2Enabled()) return;
    try {
        const raw = localStorage.getItem('pmg_bp2_pos');
        if (!raw) return;
        const p = JSON.parse(raw);
        if (!Number.isFinite(p.left) || !Number.isFinite(p.top)) return;
        marcarBp2Posicionado(bp2);
        bp2.style.left = `${p.left}px`;
        bp2.style.top = `${p.top}px`;
        scheduleClampBp2PanelIntoViewport();
    } catch (_) {}
}

function ensureBp2DragHandle() {
    const ph = document.getElementById('ph');
    if (!ph || ph.querySelector('.gn-bp2-drag-grip')) return;
    const grip = document.createElement('i');
    grip.className = 'fas fa-grip-vertical gn-bp2-drag-grip';
    grip.setAttribute('aria-hidden', 'true');
    grip.title = 'Arrastrar panel';
    ph.insertBefore(grip, ph.firstChild);
}

function initBp2DragAndroid() {
    const bp2 = document.getElementById('bp2');
    const ph = document.getElementById('ph');
    if (!bp2 || !ph || ph.dataset.gnBp2AndroidDrag === '1') return;
    if (!floatingBp2Enabled()) return;
    ph.dataset.gnBp2AndroidDrag = '1';
    ensureBp2DragHandle();
    aplicarPosicionBp2Guardada();

    let drag = null;

    const onDown = (clientX, clientY) => {
        if (bp2.classList.contains('bp2-fullhide')) return;
        const r = bp2.getBoundingClientRect();
        marcarBp2Posicionado(bp2);
        drag = { sx: clientX, sy: clientY, sl: r.left, st: r.top, moved: false };
    };

    const onMove = (clientX, clientY, ev) => {
        if (!drag) return;
        if (Math.abs(clientX - drag.sx) + Math.abs(clientY - drag.sy) > 5) {
            drag.moved = true;
            if (ev?.cancelable) ev.preventDefault();
        }
        if (!drag.moved) return;
        bp2.style.left = `${drag.sl + (clientX - drag.sx)}px`;
        bp2.style.top = `${drag.st + (clientY - drag.sy)}px`;
        clampBp2PanelIntoViewport();
    };

    const onUp = () => {
        if (!drag) return;
        if (drag.moved) {
            try {
                const br = bp2.getBoundingClientRect();
                localStorage.setItem('pmg_bp2_pos', JSON.stringify({ left: br.left, top: br.top }));
            } catch (_) {}
            window.__bp2DragJustEnded = true;
            setTimeout(() => {
                window.__bp2DragJustEnded = false;
            }, 450);
            scheduleClampBp2PanelIntoViewport();
        }
        drag = null;
    };

    ph.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || e.target.closest('button')) return;
        if (e.target.closest('.gn-bp2-plegar-trigger')) return;
        e.preventDefault();
        onDown(e.clientX, e.clientY);
        const mm = (ev) => onMove(ev.clientX, ev.clientY, ev);
        const mu = () => {
            document.removeEventListener('mousemove', mm);
            document.removeEventListener('mouseup', mu);
            onUp();
        };
        document.addEventListener('mousemove', mm);
        document.addEventListener('mouseup', mu);
    });

    ph.addEventListener(
        'touchstart',
        (e) => {
            if (e.touches.length !== 1 || e.target.closest('button')) return;
            if (e.target.closest('.gn-bp2-plegar-trigger')) return;
            e.preventDefault();
            const t = e.touches[0];
            onDown(t.clientX, t.clientY);
            const tm = (ev) => {
                const tt = ev.touches[0];
                if (tt) onMove(tt.clientX, tt.clientY, ev);
            };
            const te = () => {
                document.removeEventListener('touchmove', tm);
                document.removeEventListener('touchend', te);
                document.removeEventListener('touchcancel', te);
                onUp();
            };
            document.addEventListener('touchmove', tm, { passive: false });
            document.addEventListener('touchend', te);
            document.addEventListener('touchcancel', te);
        },
        { passive: false }
    );
}

function patchSetBp2PanelHiddenAndroid() {
    const orig = window.setBp2PanelHidden;
    if (!orig || orig.__gnBp2AndroidFloatWrap) return;
    function wrapped(hidden) {
        orig(hidden);
        if (!isAndroidShell()) return;
        const bp2 = document.getElementById('bp2');
        if (!hidden && bp2) {
            marcarBp2Posicionado(bp2);
            scheduleClampBp2PanelIntoViewport();
        }
    }
    wrapped.__gnBp2AndroidFloatWrap = true;
    window.setBp2PanelHidden = wrapped;
}

export function installGnBp2AndroidFloat() {
    if (!isAndroidShell()) return;
    patchSetBp2PanelHiddenAndroid();
    try {
        installGnPanelDockObservers();
    } catch (_) {}
    const boot = () => {
        initBp2DragAndroid();
        scheduleClampBp2PanelIntoViewport();
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
    document.addEventListener('gn-ms-visible', () => {
        setTimeout(boot, 80);
    });
    try {
        window.addEventListener('resize', () => scheduleClampBp2PanelIntoViewport(), { passive: true });
        window.visualViewport?.addEventListener('resize', () => scheduleClampBp2PanelIntoViewport(), {
            passive: true,
        });
    } catch (_) {}
}
