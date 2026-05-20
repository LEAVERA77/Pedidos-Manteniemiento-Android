/**
 * WebView Android (gama media): fluidez del scroll y tacto en el modal detalle #dm.
 * Carga desde gn-android-shell-perf.js (sin agrandar app.js).
 * made by leavera77
 */

const SHELL_CLASS = 'gn-android-shell';
const SCROLLING_CLASS = 'gn-dm-is-scrolling';
const SCROLL_END_MS = 150;
const SCROLL_BIND_ATTR = 'data-gn-dm-scroll-perf';

/** @type {number | null} */
let _scrollEndTimer = null;
/** @type {MutationObserver | null} */
let _moDm = null;
/** @type {MutationObserver | null} */
let _moDmc = null;

function isAndroidShellDoc() {
    try {
        return document.documentElement.classList.contains(SHELL_CLASS);
    } catch (_) {
        return false;
    }
}

/** Usado por pedido-ver-imagen.js para no insertar DOM pesado durante el desplazamiento. */
export function gnDmDetalleEstaDesplazandose() {
    try {
        const dm = document.getElementById('dm');
        return !!(dm && dm.classList.contains(SCROLLING_CLASS));
    } catch (_) {
        return false;
    }
}

function obtenerScrollDetalle() {
    const dmc = document.getElementById('dmc');
    if (!dmc) return null;
    return dmc.querySelector('.gn-dm-detail-scroll') || null;
}

function marcarFinScroll() {
    const dm = document.getElementById('dm');
    if (!dm) return;
    dm.classList.remove(SCROLLING_CLASS);
}

function onScrollDetalle() {
    const dm = document.getElementById('dm');
    if (!dm || !dm.classList.contains('active')) return;
    dm.classList.add(SCROLLING_CLASS);
    if (_scrollEndTimer != null) clearTimeout(_scrollEndTimer);
    _scrollEndTimer = window.setTimeout(() => {
        _scrollEndTimer = null;
        marcarFinScroll();
    }, SCROLL_END_MS);
}

function desvincularScrollDetalle(scroll) {
    if (!scroll || scroll.getAttribute(SCROLL_BIND_ATTR) !== '1') return;
    scroll.removeAttribute(SCROLL_BIND_ATTR);
    scroll.removeEventListener('scroll', onScrollDetalle);
}

function vincularScrollDetalle() {
    const scroll = obtenerScrollDetalle();
    if (!scroll || scroll.getAttribute(SCROLL_BIND_ATTR) === '1') return;
    scroll.setAttribute(SCROLL_BIND_ATTR, '1');
    scroll.addEventListener('scroll', onScrollDetalle, { passive: true });
}

function alCambiarEstadoDm() {
    const dm = document.getElementById('dm');
    if (!dm) return;
    if (dm.classList.contains('active')) {
        requestAnimationFrame(vincularScrollDetalle);
    } else {
        if (_scrollEndTimer != null) {
            clearTimeout(_scrollEndTimer);
            _scrollEndTimer = null;
        }
        dm.classList.remove(SCROLLING_CLASS);
        const scroll = obtenerScrollDetalle();
        desvincularScrollDetalle(scroll);
    }
}

function observarDmc() {
    const dmc = document.getElementById('dmc');
    if (!dmc || _moDmc) return;
    _moDmc = new MutationObserver(() => {
        const dm = document.getElementById('dm');
        if (!dm?.classList.contains('active')) return;
        const prev = dmc.querySelector(`[${SCROLL_BIND_ATTR}="1"]`);
        if (prev && prev !== obtenerScrollDetalle()) desvincularScrollDetalle(prev);
        requestAnimationFrame(vincularScrollDetalle);
    });
    _moDmc.observe(dmc, { childList: true, subtree: false });
}

function observarDm() {
    const dm = document.getElementById('dm');
    if (!dm || _moDm) return;
    _moDm = new MutationObserver(alCambiarEstadoDm);
    _moDm.observe(dm, { attributes: true, attributeFilter: ['class'] });
    alCambiarEstadoDm();
}

export function installGnDmModalPerfAndroid() {
    if (!isAndroidShellDoc()) return;
    observarDm();
    observarDmc();
}

if (typeof window !== 'undefined') {
    window.gnDmDetalleEstaDesplazandose = gnDmDetalleEstaDesplazandose;
    const boot = () => {
        try {
            installGnDmModalPerfAndroid();
        } catch (_) {}
    };
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
        else boot();
    }
}
