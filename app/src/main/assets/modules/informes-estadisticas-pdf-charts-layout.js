/**
 * Ajuste de Chart.js y contenedores para captura PDF/impresión (etiquetas legibles).
 * made by leavera77
 */

/** @type {Map<string, { labels: string[], padding?: object, containerStyle: string, wrapClass: string }>} */
const _snap = new Map();

const HBAR_IDS = new Set(['chart-tipos', 'chart-barrios-tiempo']);

/**
 * @param {unknown} chart
 */
export function esChartBarraHorizontal(chart) {
    const c = /** @type {{ config?: { type?: string }, options?: { indexAxis?: string } }} */ (chart);
    return c?.config?.type === 'bar' && c?.options?.indexAxis === 'y';
}

/**
 * @param {string[]} labels
 * @param {number} [fontPx]
 */
export function medirPaddingIzqLabels(labels, fontPx = 9) {
    const maxLen = (labels || []).reduce((m, lb) => Math.max(m, String(lb || '').length), 0);
    const px = Math.ceil(maxLen * (fontPx * 0.52)) + 14;
    return Math.min(300, Math.max(72, px));
}

/**
 * @param {number} n
 */
export function alturaContenedorBarraHorizontal(n) {
    const c = Math.max(1, Number(n) || 1);
    return Math.min(580, Math.max(260, c * 28 + 110));
}

/**
 * @param {HTMLElement | null | undefined} wrap
 */
export function chartWrapNecesitaPaginaCompleta(wrap) {
    if (!wrap) return false;
    const canvas = wrap.querySelector?.('canvas');
    const id = canvas?.id || '';
    if (HBAR_IDS.has(id)) return true;
    const m = typeof window !== 'undefined' ? window.__gnChartsEstadisticas : null;
    const chart = m && id ? m[id] : null;
    return esChartBarraHorizontal(chart);
}

/**
 * @param {() => Record<string, unknown>} getCharts
 * @param {boolean} activar
 */
export function aplicarChartsLayoutExportPdf(getCharts, activar) {
    const raw = typeof getCharts === 'function' ? getCharts() : {};
    const entries = raw && typeof raw === 'object' ? Object.entries(raw) : [];

    if (!activar) {
        for (const [id, snap] of _snap.entries()) {
            const chart = raw[id];
            const wrap = document.getElementById(id)?.closest?.('.chart-wrap');
            const cont = document.getElementById(id)?.closest?.('.chart-container');
            try {
                if (chart && snap) {
                    chart.data.labels = snap.labels.slice();
                    if (snap.padding && chart.options?.layout) {
                        chart.options.layout.padding = { ...snap.padding };
                    }
                    chart.update('none');
                }
            } catch (_) {}
            try {
                if (cont && snap?.containerStyle != null) cont.setAttribute('style', snap.containerStyle);
            } catch (_) {}
            try {
                if (wrap) {
                    wrap.classList.remove('gn-pdf-export-wide');
                    if (snap?.wrapClass != null) wrap.className = snap.wrapClass;
                }
            } catch (_) {}
        }
        _snap.clear();
        return;
    }

    for (const [id, chart] of entries) {
        if (!chart || typeof chart !== 'object') continue;
        const canvas = document.getElementById(id);
        const cont = canvas?.closest?.('.chart-container');
        const wrap = canvas?.closest?.('.chart-wrap');
        if (!canvas || !cont) continue;

        const hbar = esChartBarraHorizontal(chart) || HBAR_IDS.has(id);
        if (!_snap.has(id)) {
            _snap.set(id, {
                labels: (chart.data?.labels || []).slice(),
                padding: { ...(chart.options?.layout?.padding || {}) },
                containerStyle: cont.getAttribute('style') || '',
                wrapClass: wrap?.className || '',
            });
        }

        if (hbar) {
            const full =
                chart._gnLabelsFull && Array.isArray(chart._gnLabelsFull)
                    ? chart._gnLabelsFull.map((x) => String(x || ''))
                    : (chart.data?.labels || []).map((x) => String(x || '').replace(/…$/, ''));
            const n = Math.max(full.length, chart.data?.labels?.length || 0);
            chart.data.labels = full.length ? full : chart.data.labels;
            const padL = medirPaddingIzqLabels(chart.data.labels);
            chart.options.layout = chart.options.layout || {};
            chart.options.layout.padding = {
                top: 12,
                bottom: 12,
                left: padL,
                right: 52,
            };
            chart.options.scales = chart.options.scales || {};
            chart.options.scales.y = {
                ...(chart.options.scales.y || {}),
                stacked: chart.options.scales.y?.stacked,
                ticks: {
                    ...(chart.options.scales.y?.ticks || {}),
                    autoSkip: false,
                    mirror: false,
                    color: '#334155',
                    font: { size: 9, weight: '500' },
                    padding: 4,
                },
            };
            chart.options.scales.x = {
                ...(chart.options.scales.x || {}),
                ticks: {
                    ...(chart.options.scales.x?.ticks || {}),
                    color: '#475569',
                    font: { size: 9, weight: '600' },
                },
            };
            const h = alturaContenedorBarraHorizontal(n);
            cont.style.setProperty('--gn-pdf-chart-h', `${h}px`);
            cont.style.height = `${h}px`;
            cont.style.minHeight = `${h}px`;
            cont.style.maxHeight = `${h + 40}px`;
            if (wrap) {
                wrap.classList.add('gn-pdf-export-wide');
                wrap.style.overflow = 'visible';
                wrap.style.minWidth = '100%';
            }
        } else if (chart.config?.type === 'bar') {
            chart.options.layout = chart.options.layout || {};
            const p = chart.options.layout.padding || {};
            chart.options.layout.padding = {
                top: Math.max(p.top || 0, 14),
                bottom: Math.max(p.bottom || 0, 40),
                left: Math.max(p.left || 0, 10),
                right: Math.max(p.right || 0, 14),
            };
            const scales = chart.options.scales || {};
            if (scales.x?.ticks) {
                scales.x.ticks.maxRotation = 50;
                scales.x.ticks.minRotation = 0;
                scales.x.ticks.autoSkip = false;
                scales.x.ticks.font = { size: 8.5, weight: '500' };
            }
        } else if (chart.config?.type === 'doughnut') {
            chart.options.layout = chart.options.layout || {};
            chart.options.layout.padding = { top: 8, bottom: 28, left: 12, right: 12 };
        }

        try {
            chart.resize();
            chart.update('none');
        } catch (_) {}
    }
}

if (typeof window !== 'undefined') {
    window.__gnChartsEstadisticas = window.__gnChartsEstadisticas || null;
}
