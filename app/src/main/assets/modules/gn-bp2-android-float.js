/**
 * Android / WebView: panel #bp2 oculto abajo al inicio; al mostrar: arrastrable, cerrable, siempre en pantalla.
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

function gnPadBottomPx() {
    try {
        const vv = window.visualViewport;
        const ob = vv && Number.isFinite(Number(vv.offsetBottom)) ? Number(vv.offsetBottom) : 0;
        return Math.round(152 + ob);
    } catch (_) {
        return 152;
    }
}

function gnPadTopPx() {
    try {
        const hd = document.querySelector('#ms .hd');
        if (hd) {
            const r = hd.getBoundingClientRect();
            if (r.height > 0 && r.bottom > 0) return Math.ceil(r.bottom) + 6;
        }
    } catch (_) {}
    return 64;
}

/** Cada sesión en APK: panel de pedidos arranca oculto abajo. */
export function ensureAndroidSessionBp2HiddenDefault() {
    if (!isAndroidShell()) return;
    try {
        if (sessionStorage.getItem('pmg_bp2_android_docked') === '1') return;
        sessionStorage.setItem('pmg_bp2_android_docked', '1');
        localStorage.setItem('pmg_bp2_hidden', '1');
    } catch (_) {}
}

/** Oculto: anclado al borde inferior, fuera de vista (translateY 100%). */
export function dockBp2AndroidHidden(bp2) {
    const el = bp2 || document.getElementById('bp2');
    if (!el) return;
    el.classList.add('gn-bp2-dock-bottom');
    el.classList.remove('gn-bp2-positioned');
    try {
        el.style.left = '0';
        el.style.right = '0';
        el.style.top = 'auto';
        el.style.bottom = '0';
        el.style.transform = 'translateY(100%)';
        el.style.removeProperty('width');
    } catch (_) {}
}

export function marcarBp2Posicionado(bp2) {
    if (!bp2) return;
    bp2.classList.remove('gn-bp2-dock-bottom');
    bp2.classList.add('gn-bp2-positioned');
    try {
        bp2.style.right = 'auto';
        bp2.style.bottom = 'auto';
        bp2.style.transform = '';
    } catch (_) {}
}

/** Al mostrar: fixed en viewport (coordenadas de clamp/drag), visible y dentro de pantalla. */
export function positionBp2AndroidVisible(bp2) {
    const el = bp2 || document.getElementById('bp2');
    if (!el) return;
    el.classList.remove('bp2-fullhide');
    marcarBp2Posicionado(el);
    const vv = window.visualViewport;
    const vh = vv && vv.height > 0 ? vv.height : window.innerHeight;
    const vw = window.innerWidth;
    const padX = 8;
    const padBottom = gnPadBottomPx();
    const padTop = gnPadTopPx();
    const w = Math.min(vw - padX * 2, 416);
    const maxH = Math.max(120, vh - padTop - padBottom);
    try {
        el.style.position = 'fixed';
        el.style.maxHeight = `${Math.round(maxH)}px`;
        el.style.width = `${Math.round(w)}px`;
        el.style.zIndex = '10025';
        el.style.right = 'auto';
        el.style.bottom = 'auto';
    } catch (_) {}
    let h = el.getBoundingClientRect().height;
    if (!h || h < 80) h = Math.min(280, maxH);
    const left = padX;
    const top = Math.max(padTop, vh - h - padBottom);
    try {
        el.style.left = `${Math.round(left)}px`;
        el.style.top = `${Math.round(top)}px`;
    } catch (_) {}
    clampBp2PanelIntoViewport();
    scheduleClampBp2PanelIntoViewport();
}

/** Mostrar panel tras FAB o chip (Android). */
export function showBp2AndroidPanel() {
    const bp2 = document.getElementById('bp2');
    if (!bp2) return;
    bp2.classList.remove('col', 'gn-bp2-dock-bottom');
    bp2.classList.add('gn-bp2-expanded');
    try {
        localStorage.setItem('pmg_bp2_hidden', '0');
    } catch (_) {}
    positionBp2AndroidVisible(bp2);
    initBp2DragAndroid();
}

function aplicarPosicionBp2Guardada() {
    const bp2 = document.getElementById('bp2');
    if (!bp2 || !floatingBp2Enabled()) return;
    if (bp2.classList.contains('bp2-fullhide')) return;
    try {
        const raw = localStorage.getItem('pmg_bp2_pos');
        if (!raw) {
            positionBp2AndroidVisible(bp2);
            return;
        }
        const p = JSON.parse(raw);
        if (!Number.isFinite(p.left) || !Number.isFinite(p.top)) {
            positionBp2AndroidVisible(bp2);
            return;
        }
        marcarBp2Posicionado(bp2);
        bp2.style.left = `${p.left}px`;
        bp2.style.top = `${p.top}px`;
        scheduleClampBp2PanelIntoViewport();
    } catch (_) {
        positionBp2AndroidVisible(bp2);
    }
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
        if (!isAndroidShell()) {
            orig(hidden);
            return;
        }
        const bp2 = document.getElementById('bp2');
        if (hidden) {
            orig(true);
            if (bp2) dockBp2AndroidHidden(bp2);
            return;
        }
        orig(false);
        if (!bp2) return;
        showBp2AndroidPanel();
        try {
            const raw = localStorage.getItem('pmg_bp2_pos');
            if (raw) {
                const p = JSON.parse(raw);
                if (Number.isFinite(p.left) && Number.isFinite(p.top)) {
                    marcarBp2Posicionado(bp2);
                    bp2.style.left = `${p.left}px`;
                    bp2.style.top = `${p.top}px`;
                    scheduleClampBp2PanelIntoViewport();
                }
            }
        } catch (_) {}
    }
    wrapped.__gnBp2AndroidFloatWrap = true;
    window.setBp2PanelHidden = wrapped;
}

export function installGnBp2AndroidFloat() {
    if (!isAndroidShell()) return;
    ensureAndroidSessionBp2HiddenDefault();
    patchSetBp2PanelHiddenAndroid();
    try {
        installGnPanelDockObservers();
    } catch (_) {}
    const boot = () => {
        const bp2 = document.getElementById('bp2');
        try {
            if (localStorage.getItem('pmg_bp2_hidden') !== '0') {
                if (typeof window.setBp2PanelHidden === 'function') window.setBp2PanelHidden(true);
                else if (bp2) dockBp2AndroidHidden(bp2);
            } else if (bp2 && !bp2.classList.contains('bp2-fullhide')) {
                initBp2DragAndroid();
                scheduleClampBp2PanelIntoViewport();
            }
        } catch (_) {
            if (bp2) dockBp2AndroidHidden(bp2);
        }
        initBp2DragAndroid();
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
    document.addEventListener('gn-ms-visible', () => {
        ensureAndroidSessionBp2HiddenDefault();
        setTimeout(() => {
            try {
                if (localStorage.getItem('pmg_bp2_hidden') === '0') {
                    const bp2 = document.getElementById('bp2');
                    if (bp2 && !bp2.classList.contains('bp2-fullhide')) {
                        showBp2AndroidPanel();
                        return;
                    }
                }
            } catch (_) {}
            boot();
        }, 80);
    });
    try {
        window.addEventListener('resize', () => scheduleClampBp2PanelIntoViewport(), { passive: true });
        window.visualViewport?.addEventListener('resize', () => scheduleClampBp2PanelIntoViewport(), {
            passive: true,
        });
    } catch (_) {}
}
