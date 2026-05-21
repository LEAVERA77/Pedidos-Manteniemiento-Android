/**
 * Hidratación del modal detalle (#dm / #dmc) sobre shell persistente — sin innerHTML de #dmc.
 * made by leavera77
 */
import { ensureDetallePedidoShellMounted, queryDetalleSection } from './pedido-detalle-shell.js';
import { buildDetalleSections } from './pedido-detalle-render.js';
import {
    patchDetallePedidoIncremental,
    guardarDetalleEstructuraSig,
} from './pedido-detalle-incremental.js';
import { gnPrefetchNombresPedidoDetalle } from './gn-usuario-nombres.js';
import { gnParchAuditoriaDetalleTrasNombres } from './gn-usuario-nombres-detalle-patch.js';

function isAndroidShell() {
    try {
        return document.documentElement.classList.contains('gn-android-shell');
    } catch (_) {
        return false;
    }
}

function setSectionHtml(el, html) {
    if (!el) return;
    const next = html || '';
    if (el.innerHTML !== next) el.innerHTML = next;
}

function restoreScroll(scrollEl, scrollTop) {
    if (!scrollEl || scrollTop <= 0) return;
    requestAnimationFrame(() => {
        if (scrollEl) scrollEl.scrollTop = scrollTop;
    });
}

function applyMaterialesSection(p, showMateriales) {
    const wrap = document.getElementById('materiales-detalle-wrap');
    if (!wrap) return;
    if (!showMateriales) {
        wrap.hidden = true;
        wrap.dataset.pid = '';
        return;
    }
    wrap.hidden = false;
    const pid = String(p.id ?? '');
    const pidPrev = wrap.dataset.pid || '';
    wrap.dataset.pid = pid;
    const body = document.getElementById('materiales-detalle-body');
    if (!body) return;
    if (pidPrev !== pid || !body.querySelector('table, .mat-row, [data-mat-loaded]')) {
        body.innerHTML = '<p style="font-size:.8rem;color:var(--tl)">Cargando…</p>';
    }
}

/**
 * Rellena cada sección del shell sin reemplazar #dmc.
 * @param {object} p
 * @param {object} sections — salida de buildDetalleSections
 * @param {object} deps
 */
export function applyDetalleSectionsToShell(p, sections, deps) {
    const infoEl = document.querySelector('#dmc [data-gn-dm-block="info"]');
    setSectionHtml(infoEl, sections.info);

    setSectionHtml(queryDetalleSection('trabajo'), sections.trabajo);
    setSectionHtml(queryDetalleSection('derivacion'), sections.derivacion);

    const cierreEl = queryDetalleSection('cierre');
    if (cierreEl) {
        if (sections.cierre) {
            cierreEl.hidden = false;
            setSectionHtml(cierreEl, sections.cierre);
        } else {
            cierreEl.hidden = true;
            cierreEl.innerHTML = '';
        }
    }

    applyMaterialesSection(p, sections.showMateriales);

    setSectionHtml(queryDetalleSection('ubicacion'), sections.ubicacion);
    setSectionHtml(queryDetalleSection('top3'), sections.top3);
    setSectionHtml(queryDetalleSection('auditoria'), sections.auditoria);
    setSectionHtml(queryDetalleSection('fotos'), sections.fotos);

    const accionesDa = document.querySelector('#dmc .gn-dm-actions-bar .da');
    if (accionesDa) accionesDa.innerHTML = sections.acciones || '';

    try {
        if (typeof deps.actualizarHostOpinionClienteDetalleModal === 'function') {
            deps.actualizarHostOpinionClienteDetalleModal(p);
        } else {
            const host = document.getElementById('dm-opinion-cliente-host');
            if (host) host.innerHTML = sections.opinion || '';
        }
    } catch (_) {
        const host = document.getElementById('dm-opinion-cliente-host');
        if (host) host.innerHTML = sections.opinion || '';
    }

    try {
        if (typeof window.injectPedidoVerImagenReclamo === 'function') {
            if (isAndroidShell() && typeof requestIdleCallback === 'function') {
                requestIdleCallback(
                    () => {
                        void window.injectPedidoVerImagenReclamo(p);
                    },
                    { timeout: 800 }
                );
            } else {
                requestAnimationFrame(() => {
                    void window.injectPedidoVerImagenReclamo(p);
                });
            }
        }
    } catch (_) {}
}

/**
 * @param {object} p
 * @param {object} deps
 * @param {{ mode?: 'full'|'patch', preserveScroll?: boolean, scrollTop?: number, forceFullRender?: boolean }} [opts]
 * @returns {{ mode: string }}
 */
export function hydrateDetallePedido(p, deps, opts = {}) {
    const mode = opts.mode === 'patch' && !opts.forceFullRender ? 'patch' : 'full';

    if (mode === 'patch') {
        ensureDetallePedidoShellMounted();
        patchDetallePedidoIncremental(p, deps);
        guardarDetalleEstructuraSig(p, deps);
        return { mode: 'patch' };
    }

    ensureDetallePedidoShellMounted();

    const scroll = document.querySelector('#dm .gn-dm-detail-scroll');
    const scrollTop =
        opts.scrollTop != null
            ? opts.scrollTop
            : opts.preserveScroll
              ? scroll?.scrollTop ?? 0
              : 0;

    const sections = buildDetalleSections(p, deps);
    applyDetalleSectionsToShell(p, sections, deps);
    guardarDetalleEstructuraSig(p, deps);
    restoreScroll(scroll, scrollTop);

    void gnPrefetchNombresPedidoDetalle(p).then(() => {
        try {
            const dm = document.getElementById('dm');
            if (!dm?.classList.contains('active')) return;
            gnParchAuditoriaDetalleTrasNombres(p, buildDetalleSections, deps);
        } catch (_) {}
    });

    return { mode: 'full' };
}
