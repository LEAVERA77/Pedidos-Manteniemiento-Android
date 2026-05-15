/**
 * Captura html2canvas y preparación de vista para informes PDF / impresión de estadísticas admin.
 * Depende de Chart.js instancias en el objeto `_charts` de app.js (inyectado vía setInformesEstadisticasPdfCaptureDeps).
 * made by leavera77
 */

import { construirHtmlEncabezadoInformeEmpresa } from './informe-empresa-html-encabezado.js';

/** @type {{ getCharts: () => Record<string, unknown>; lineaPeriodoInformeEstadisticas: () => string } | null} */
let _deps = null;

/** @type {{ _noop?: boolean } | null} */
let _chartDataSnapshotForPdf = null;

export function setInformesEstadisticasPdfCaptureDeps(d) {
    _deps = d && typeof d.getCharts === 'function' && typeof d.lineaPeriodoInformeEstadisticas === 'function' ? d : null;
}

function chartValues() {
    const m = _deps?.getCharts?.();
    return m && typeof m === 'object' ? Object.values(m) : [];
}

export function pdfMmAjustarImagen(cw, ch, maxWmm, maxHmm) {
    const ar = cw / ch;
    let iw = maxWmm;
    let ih = iw / ar;
    if (ih > maxHmm) {
        ih = maxHmm;
        iw = ih * ar;
    }
    return { iw, ih };
}

export function alturaContenidoCaptura(el) {
    if (!el) return 40;
    const r0 = el.getBoundingClientRect();
    let maxB = r0.top;
    const walk = (n) => {
        if (!n || n.nodeType !== 1) return;
        const st = window.getComputedStyle(n);
        if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) return;
        const br = n.getBoundingClientRect();
        if (br.width >= 1 && br.height >= 1) maxB = Math.max(maxB, br.bottom);
        for (let i = 0; i < n.children.length; i++) walk(n.children[i]);
    };
    walk(el);
    const h = Math.ceil(maxB - r0.top + 12);
    const mx = Math.min(Math.max(el.scrollHeight, el.offsetHeight, 40), 3200);
    return Math.max(40, Math.min(h, mx));
}

export function tituloChartEstadisticas(el) {
    const h4 = el?.querySelector?.('h4');
    const t = (h4?.textContent || '').replace(/\s+/g, ' ').trim();
    return t || 'Gráfico';
}

export function escAttrPrint(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/"/g, '&quot;');
}

export function adminEstadisticasSetCaptureCompact(on) {
    const root = document.getElementById('admin-estadisticas');
    if (root) root.classList.toggle('gn-stats-capture-compact', !!on);
    if (typeof window !== 'undefined') window.__gnStatsInkSave = !!on;
}

export function aplicarEstadisticasInkSaveCharts(activar) {
    if (activar) {
        if (_chartDataSnapshotForPdf) return;
        _chartDataSnapshotForPdf = { _noop: true };
        chartValues().forEach((chart) => {
            try {
                chart.update('none');
            } catch (_) {}
        });
    } else {
        _chartDataSnapshotForPdf = null;
        chartValues().forEach((chart) => {
            try {
                chart.update('none');
            } catch (_) {}
        });
    }
}

export async function prepararVistaCapturaEstadisticasPdf(activar) {
    adminEstadisticasSetCaptureCompact(!!activar);
    aplicarEstadisticasInkSaveCharts(!!activar);
    chartValues().forEach((ch) => {
        try {
            ch.resize();
        } catch (_) {}
    });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, activar ? 220 : 90));
}

export function coleccionSeccionesPdfEstadisticas() {
    const root = document.getElementById('admin-estadisticas');
    if (!root) return [];
    const out = [{ type: 'resumen' }];
    root.querySelectorAll('.chart-wrap').forEach((w) => {
        try {
            if (window.getComputedStyle(w).display === 'none') return;
            out.push({ type: 'chart', el: w, title: tituloChartEstadisticas(w) });
        } catch (_) {}
    });
    return out;
}

export async function capturaPdfBloqueResumenEstadisticas() {
    const linea = _deps?.lineaPeriodoInformeEstadisticas?.() || '';
    const marco = document.getElementById('enre-marco');
    const cards = document.getElementById('stats-cards');
    const wrap = document.createElement('div');
    wrap.setAttribute(
        'style',
        'position:fixed;left:-12000px;top:0;width:720px;padding:12px 14px;box-sizing:border-box;background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;font-family:system-ui,Segoe UI,sans-serif'
    );
    const headDiv = document.createElement('div');
    headDiv.innerHTML = construirHtmlEncabezadoInformeEmpresa(linea);
    wrap.appendChild(headDiv);
    if (marco) {
        const m = marco.cloneNode(true);
        m.querySelectorAll('a').forEach((a) => {
            a.setAttribute('href', '#');
            a.style.textDecoration = 'none';
            a.style.color = '#1e40af';
        });
        wrap.appendChild(m);
    }
    if (cards) wrap.appendChild(cards.cloneNode(true));
    const pdfDes = document.getElementById('stats-desestimados-pdf-block');
    if (pdfDes && pdfDes.innerHTML && pdfDes.innerHTML.trim()) {
        wrap.appendChild(pdfDes.cloneNode(true));
    }
    document.body.appendChild(wrap);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 70));
    let canvas = null;
    try {
        const sh = Math.max(alturaContenidoCaptura(wrap), wrap.offsetHeight, 48);
        canvas = await html2canvas(wrap, {
            scale: 1.12,
            useCORS: true,
            logging: false,
            backgroundColor: '#f8fafc',
            width: 720,
            height: sh,
            windowWidth: 720,
            windowHeight: sh,
        });
    } catch (e) {
        console.warn('[pdf-resumen]', e);
    }
    document.body.removeChild(wrap);
    return canvas;
}

export async function html2canvasCapturaElemento(el, opts = {}) {
    if (!el || typeof html2canvas !== 'function') return null;
    const delayAfterResize = typeof opts.delayAfterResize === 'number' ? opts.delayAfterResize : 200;
    const statsExport = !!opts.statsExport;
    try {
        chartValues().forEach((ch) => {
            try {
                ch.resize();
            } catch (_) {}
        });
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        await new Promise((r) => setTimeout(r, delayAfterResize));
        const sw = Math.max(el.offsetWidth, el.clientWidth, 120);
        const rawSh =
            opts.useFullScrollHeight || statsExport
                ? Math.max(el.scrollHeight, el.offsetHeight, 40)
                : Math.max(alturaContenidoCaptura(el), el.offsetHeight, 40);
        const sh = Math.min(rawSh, statsExport ? opts.maxHeightPx || 4600 : opts.maxHeightPx || 3800);
        const scale = statsExport
            ? Math.min(2.65, 2700 / Math.max(sw, 260))
            : Math.min(1.2, 1850 / Math.max(sw, 380));
        return await html2canvas(el, {
            scale,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            width: sw,
            height: sh,
            windowWidth: sw,
            windowHeight: sh,
            scrollX: 0,
            scrollY: 0,
            onclone: (_doc, node) => {
                try {
                    node.classList.add('gn-capture-pdf');
                    node.style.overflow = 'visible';
                    node.style.height = 'auto';
                    node.style.minHeight = '0';
                    node.style.maxHeight = 'none';
                    node.style.alignSelf = 'flex-start';
                    node.querySelectorAll('button').forEach((b) => {
                        b.style.visibility = 'hidden';
                    });
                } catch (_) {}
            },
        });
    } catch (e) {
        console.warn('html2canvas elemento', e);
        return null;
    }
}

export async function html2canvasCapturaEstadisticasCompleta(el) {
    return html2canvasCapturaElemento(el, { delayAfterResize: 400 });
}
