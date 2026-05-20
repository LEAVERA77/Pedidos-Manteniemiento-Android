/**
 * Repintado incremental del modal #dm (sin innerHTML completo de #dmc).
 * made by leavera77
 */
import {
    buildDetalleInfoBlockInner,
    buildDetalleAccionesBarHtml,
    computeDetalleEstructuraSig,
} from './pedido-detalle-render.js';

export function puedePatchIncrementalDetalle(p, opts, deps) {
    if (opts?.forceFullRender) return false;
    const dm = document.getElementById('dm');
    if (!dm?.classList.contains('active')) return false;
    if (String(dm.dataset.detallePedidoId || '') !== String(p?.id ?? '')) return false;
    if (!dm.querySelector('.gn-dm-detail-scroll [data-gn-dm-block="info"]')) return false;
    const prev = dm.dataset.detalleEstructuraSig || '';
    if (!prev) return false;
    return prev === computeDetalleEstructuraSig(p, deps);
}

/**
 * Actualiza bloques livianos (info, opinión, acciones) preservando scroll y el resto del DOM.
 * @param {object} p
 * @param {object} deps — mismo objeto que buildDetallePedidoDmcHtml
 */
export function patchDetallePedidoIncremental(p, deps) {
    const scroll = document.querySelector('#dm .gn-dm-detail-scroll');
    const scrollTop = scroll?.scrollTop ?? 0;

    const info = document.querySelector('#dm [data-gn-dm-block="info"]');
    if (info) {
        const titulo = info.querySelector('h4');
        const tituloHtml = titulo ? titulo.outerHTML : '<h4>📋 Información General</h4>';
        info.innerHTML = tituloHtml + buildDetalleInfoBlockInner(p, deps);
    }

    try {
        if (typeof deps.actualizarHostOpinionClienteDetalleModal === 'function') {
            deps.actualizarHostOpinionClienteDetalleModal(p);
        } else if (typeof deps.construirHtmlBloqueOpinionClienteDetalle === 'function') {
            const host = document.getElementById('dm-opinion-cliente-host');
            if (host) {
                const escDet = (t) => String(t == null ? '' : t).replace(/</g, '&lt;').replace(/>/g, '&gt;');
                host.innerHTML = deps.construirHtmlBloqueOpinionClienteDetalle(p, escDet);
            }
        }
    } catch (_) {}

    const da = document.querySelector('#dm .gn-dm-actions-bar .da');
    if (da) da.innerHTML = buildDetalleAccionesBarHtml(p, deps);

    try {
        if (typeof window.injectPedidoVerImagenReclamo === 'function') {
            void window.injectPedidoVerImagenReclamo(p);
        }
    } catch (_) {}

    if (scrollTop > 0) {
        requestAnimationFrame(() => {
            if (scroll) scroll.scrollTop = scrollTop;
        });
    }
}

export function guardarDetalleEstructuraSig(p, deps) {
    try {
        const dm = document.getElementById('dm');
        if (dm) dm.dataset.detalleEstructuraSig = computeDetalleEstructuraSig(p, deps);
    } catch (_) {}
}
