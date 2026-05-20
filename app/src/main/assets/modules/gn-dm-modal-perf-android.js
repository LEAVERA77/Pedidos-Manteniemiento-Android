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
/** @type {{ p: object, opts: object } | null} */
let _detalleRepintadoEncolado = null;
/** @type {boolean} */
let _detalleWrapIntentado = false;

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

/** Repintado diferido (refetch / opinión) mientras el usuario desplaza el detalle. */
export function gnDmDebeDiferirRepintadoDetalle() {
    if (!isAndroidShellDoc()) return false;
    const dm = document.getElementById('dm');
    return !!(dm && dm.classList.contains('active') && gnDmDetalleEstaDesplazandose());
}

export function gnDmEncolarRepintadoDetalle(p, opts = {}) {
    if (!p) return;
    _detalleRepintadoEncolado = { p, opts: opts || {} };
    try {
        window.__gnDetallePedidoActivo = p;
    } catch (_) {}
    try {
        const pid = p.id != null ? String(p.id) : '';
        const list = window.app?.p;
        if (pid && Array.isArray(list)) {
            const ix = list.findIndex((x) => x && String(x.id) === pid);
            if (ix >= 0) list[ix] = p;
        }
    } catch (_) {}
}

function vaciarRepintadoEncolado() {
    if (!_detalleRepintadoEncolado) return;
    const q = _detalleRepintadoEncolado;
    _detalleRepintadoEncolado = null;
    const orig = window.__gnDetalleSinPerf || window.detalle;
    if (typeof orig !== 'function') return;
    void Promise.resolve(orig(q.p, q.opts)).catch(() => {});
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
    requestAnimationFrame(vaciarRepintadoEncolado);
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
        void import('./pedido-ver-imagen.js')
            .then((m) => {
                try {
                    m.installPedidoVerImagenDetalleObserver?.();
                } catch (_) {}
            })
            .catch(() => {});
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

function envolverDetalleGlobal() {
    if (_detalleWrapIntentado && window.detalle?.__gnDmPerfWrap) return true;
    const orig = window.detalle;
    if (typeof orig !== 'function' || orig.__gnDmPerfWrap) return !!orig?.__gnDmPerfWrap;
    window.__gnDetalleSinPerf = orig;

    async function detalleConPerf(p, opts = {}) {
        const optsSafe = opts || {};
        const dm = document.getElementById('dm');
        const pidOpen = dm?.dataset?.detallePedidoId;
        const pid = p?.id != null ? String(p.id) : '';
        const mismoPedidoAbierto =
            !!dm?.classList.contains('active') && pidOpen != null && pid && String(pidOpen) === pid;
        const soloActualizacion = !!optsSafe.skipBackgroundRefetch;

        if (
            isAndroidShellDoc() &&
            mismoPedidoAbierto &&
            soloActualizacion &&
            gnDmDetalleEstaDesplazandose()
        ) {
            gnDmEncolarRepintadoDetalle(p, optsSafe);
            return;
        }

        const scroll = obtenerScrollDetalle();
        const scrollTop = mismoPedidoAbierto && scroll ? scroll.scrollTop : 0;

        await orig(p, optsSafe);

        if (scrollTop > 0) {
            requestAnimationFrame(() => {
                const sc = obtenerScrollDetalle();
                if (sc) sc.scrollTop = scrollTop;
            });
        }
    }

    detalleConPerf.__gnDmPerfWrap = true;
    window.detalle = detalleConPerf;
    _detalleWrapIntentado = true;
    return true;
}

function asegurarEnvoltorioDetalle() {
    if (!isAndroidShellDoc()) return;
    if (envolverDetalleGlobal()) return;
    let n = 0;
    const tick = () => {
        n += 1;
        if (envolverDetalleGlobal() || n > 80) return;
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

export function installGnDmModalPerfAndroid() {
    if (!isAndroidShellDoc()) return;
    observarDm();
    observarDmc();
    asegurarEnvoltorioDetalle();
}

if (typeof window !== 'undefined') {
    window.gnDmDetalleEstaDesplazandose = gnDmDetalleEstaDesplazandose;
    window.gnDmDebeDiferirRepintadoDetalle = gnDmDebeDiferirRepintadoDetalle;
    window.gnDmEncolarRepintadoDetalle = gnDmEncolarRepintadoDetalle;
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
