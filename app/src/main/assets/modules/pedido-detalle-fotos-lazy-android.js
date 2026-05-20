/**
 * Android: fotos del trabajo en <details> — carga al expandir (no al abrir #dm).
 * made by leavera77
 */
import { gnDetalleImgAttrs } from './pedido-detalle-html-helpers.js';

function esShellAndroid() {
    try {
        return document.documentElement.classList.contains('gn-android-shell');
    } catch (_) {
        return false;
    }
}

function buildFotosHtml(p) {
    const fotos = Array.isArray(p?.fotos) ? p.fotos.filter(Boolean) : [];
    if (!fotos.length) return '';
    const imgLazy = gnDetalleImgAttrs();
    let html = '<div class="fotos-container">';
    fotos.forEach((foto, idx) => {
        const ctxStr = JSON.stringify({ tipo: 'pedido_fotos', id: p.id, idx }).replace(/"/g, '&quot;');
        html += `<img src="${foto}" class="foto-miniatura"${imgLazy} onclick="verFotoAmpliada(this.src, JSON.parse(this.dataset.ctx))" data-ctx="${ctxStr}">`;
    });
    html += '</div>';
    return html;
}

function onToggleFotosLazy(ev) {
    const det = ev.target.closest('details.gn-dm-fotos-lazy');
    if (!det || !det.open || det.dataset.gnDmFotosLoaded === '1') return;
    const p = window.__gnDetallePedidoActivo;
    if (!p?.id) return;
    const host = det.querySelector('.gn-dm-fotos-lazy-host');
    if (!host) return;
    det.dataset.gnDmFotosLoaded = '1';
    requestAnimationFrame(() => {
        host.innerHTML = buildFotosHtml(p);
    });
}

function bindLazyFotos() {
    const scroll = document.querySelector('#dm .gn-dm-detail-scroll');
    if (!scroll || scroll.dataset.gnDmFotosLazyBind === '1') return;
    scroll.dataset.gnDmFotosLazyBind = '1';
    scroll.addEventListener('toggle', onToggleFotosLazy, true);
}

function watchDmFotosLazy() {
    const dm = document.getElementById('dm');
    if (!dm) return;
    const mo = new MutationObserver(() => {
        if (!dm.classList.contains('active')) return;
        requestAnimationFrame(bindLazyFotos);
    });
    mo.observe(dm, { attributes: true, attributeFilter: ['class'] });
    if (dm.classList.contains('active')) bindLazyFotos();
}

export function installPedidoDetalleFotosLazyAndroid() {
    if (!esShellAndroid()) return;
    if (typeof document === 'undefined') return;
    const boot = () => {
        try {
            watchDmFotosLazy();
        } catch (_) {}
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
}

installPedidoDetalleFotosLazyAndroid();
