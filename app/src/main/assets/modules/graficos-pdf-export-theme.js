/**
 * Tema Chart.js para PDF/impresión: escala de grises distinguible, bordes y series claras.
 * made by leavera77
 */

/** Barras / segmentos rotativos (contraste alto en B/N). */
export const CHART_PALETTE_GRAYSCALE_PRINT = [
    '#0f172a',
    '#334155',
    '#475569',
    '#64748b',
    '#94a3b8',
    '#cbd5e1',
    '#e2e8f0',
    '#f1f5f9',
];

/** Dos series apiladas o agrupadas (p. ej. creados/cerrados, total/cerrados). */
export const SERIES_GRAY_DARK = '#1e293b';
export const SERIES_GRAY_MID = '#64748b';
export const SERIES_GRAY_LIGHT = '#cbd5e1';

/** Dona estados — solo tonos de gris distinguibles en impresión B/N. */
export const ESTADO_DONUT_GRAYSCALE_PRINT = {
    Pendiente: '#e5e7eb',
    Asignado: '#94a3b8',
    'En ejecución': '#64748b',
    Cerrado: '#1f2937',
    Desestimado: '#cbd5e1',
    'Derivado externo': '#475569',
};

export const PRIORIDAD_GRAYSCALE_PRINT = {
    Crítica: '#0f172a',
    Alta: '#374151',
    Media: '#6b7280',
    Baja: '#cbd5e1',
};

export const KPI_PDF_IMPRESION_BARRAS_GRAYSCALE = [
    '#0f172a',
    '#374151',
    '#525252',
    '#737373',
    '#a3a3a3',
    '#d4d4d4',
    '#e5e5e5',
    '#f5f5f5',
];

const LINE_MAIN = { border: '#111827', fill: 'rgba(17, 24, 39, 0.08)', point: '#0f172a' };
const LINE_REF_A = { border: '#6b7280', dash: [7, 4] };
const LINE_REF_B = { border: '#9ca3af', dash: [3, 3] };

/**
 * @param {unknown} v
 */
function cloneColorValue(v) {
    if (Array.isArray(v)) return v.map((x) => x);
    return v;
}

/**
 * @param {import('chart.js').Chart | Record<string, unknown>} chart
 */
export function snapChartDatasetColors(chart) {
    const c = /** @type {{ data?: { datasets?: object[] } }} */ (chart);
    return (c.data?.datasets || []).map((ds) => {
        const d = /** @type {Record<string, unknown>} */ (ds);
        return {
            backgroundColor: cloneColorValue(d.backgroundColor),
            borderColor: cloneColorValue(d.borderColor),
            borderWidth: d.borderWidth,
            borderDash: Array.isArray(d.borderDash) ? [...d.borderDash] : d.borderDash,
            pointRadius: d.pointRadius,
            pointBackgroundColor: cloneColorValue(d.pointBackgroundColor),
            pointBorderColor: cloneColorValue(d.pointBorderColor),
            fill: d.fill,
            type: d.type,
        };
    });
}

/**
 * @param {import('chart.js').Chart | Record<string, unknown>} chart
 * @param {ReturnType<typeof snapChartDatasetColors>} snap
 */
export function restoreChartDatasetColors(chart, snap) {
    if (!chart || !snap?.length) return;
    const c = /** @type {{ data: { datasets: object[] } }} */ (chart);
    (c.data.datasets || []).forEach((ds, i) => {
        const s = snap[i];
        if (!s) return;
        const d = /** @type {Record<string, unknown>} */ (ds);
        if (s.backgroundColor !== undefined) d.backgroundColor = cloneColorValue(s.backgroundColor);
        if (s.borderColor !== undefined) d.borderColor = cloneColorValue(s.borderColor);
        if (s.borderWidth !== undefined) d.borderWidth = s.borderWidth;
        if (s.borderDash !== undefined) d.borderDash = Array.isArray(s.borderDash) ? [...s.borderDash] : s.borderDash;
        if (s.pointRadius !== undefined) d.pointRadius = s.pointRadius;
        if (s.pointBackgroundColor !== undefined) d.pointBackgroundColor = cloneColorValue(s.pointBackgroundColor);
        if (s.pointBorderColor !== undefined) d.pointBorderColor = cloneColorValue(s.pointBorderColor);
        if (s.fill !== undefined) d.fill = s.fill;
        if (s.type !== undefined) d.type = s.type;
    });
}

/**
 * @param {string} chartId
 * @param {string[]} labels
 * @param {number} i
 */
function grayPorIndice(i) {
    return CHART_PALETTE_GRAYSCALE_PRINT[i % CHART_PALETTE_GRAYSCALE_PRINT.length];
}

/**
 * @param {import('chart.js').Chart | Record<string, unknown>} chart
 * @param {string} [chartId]
 */
export function applyChartGrayscalePrintTheme(chart, chartId = '') {
    const c = /** @type {{
        config?: { type?: string };
        data?: { labels?: string[]; datasets?: Record<string, unknown>[] };
        options?: { scales?: Record<string, unknown>; plugins?: Record<string, unknown> };
    }} */ (chart);
    if (!c?.data?.datasets?.length) return;
    const id = String(chartId || '');
    const type = c.config?.type || 'bar';
    const labels = (c.data.labels || []).map((x) => String(x || ''));
    const datasets = c.data.datasets;

    const setBarSolid = (ds, fill, stroke = '#0f172a', bw = 1.5) => {
        const n = Math.max(labels.length, (ds.data || []).length, 1);
        ds.backgroundColor = fill;
        ds.borderColor = stroke;
        ds.borderWidth = bw;
    };

    if (type === 'doughnut') {
        datasets.forEach((ds) => {
            const map =
                id === 'chart-estados'
                    ? ESTADO_DONUT_GRAYSCALE_PRINT
                    : id === 'chart-prioridades'
                      ? PRIORIDAD_GRAYSCALE_PRINT
                      : null;
            ds.backgroundColor = labels.map((lb, i) => {
                if (map && map[lb]) return map[lb];
                return grayPorIndice(i);
            });
            ds.borderColor = '#ffffff';
            ds.borderWidth = 2;
        });
        return;
    }

    if (type === 'line') {
        datasets.forEach((ds, di) => {
            const isRef = ds.type === 'line' && di > 0;
            if (isRef) {
                ds.borderColor = di === 1 ? LINE_REF_A.border : LINE_REF_B.border;
                ds.borderDash = di === 1 ? [...LINE_REF_A.dash] : [...LINE_REF_B.dash];
                ds.borderWidth = 1.8;
                ds.pointRadius = 0;
                ds.fill = false;
                ds.backgroundColor = 'transparent';
                return;
            }
            ds.borderColor = LINE_MAIN.border;
            ds.backgroundColor = LINE_MAIN.fill;
            ds.pointBackgroundColor = LINE_MAIN.point;
            ds.pointBorderColor = '#ffffff';
            ds.pointBorderWidth = 1.2;
            ds.pointRadius = 3.5;
            ds.borderWidth = 2.2;
            ds.fill = true;
        });
        aplicarEscalasGrisesImpresion(c);
        return;
    }

    if (id === 'chart-mensual' || id === 'chart-distribuidores') {
        const fills = [SERIES_GRAY_DARK, SERIES_GRAY_MID];
        datasets.forEach((ds, di) => {
            setBarSolid(ds, fills[di % fills.length], '#0f172a', 1.8);
        });
        aplicarEscalasGrisesImpresion(c);
        return;
    }

    if (id === 'chart-tipos' && datasets.length >= 2) {
        setBarSolid(datasets[0], SERIES_GRAY_MID, '#1e293b', 1.5);
        setBarSolid(datasets[1], SERIES_GRAY_DARK, '#0f172a', 1.8);
        aplicarEscalasGrisesImpresion(c);
        return;
    }

    if (type === 'bar' && c.options?.indexAxis === 'y') {
        datasets.forEach((ds, di) => {
            const n = Math.max(labels.length, (ds.data || []).length, 1);
            if (datasets.length === 1) {
                ds.backgroundColor = labels.map((_, i) => grayPorIndice(i));
                ds.borderColor = '#0f172a';
                ds.borderWidth = 1.5;
            } else {
                setBarSolid(ds, di === 0 ? SERIES_GRAY_MID : SERIES_GRAY_DARK, '#0f172a', 1.6);
            }
        });
        aplicarEscalasGrisesImpresion(c);
        return;
    }

    if (type === 'bar') {
        datasets.forEach((ds) => {
            const n = Math.max(labels.length, (ds.data || []).length, 1);
            ds.backgroundColor = Array.from({ length: n }, (_, i) => grayPorIndice(i));
            ds.borderColor = '#0f172a';
            ds.borderWidth = 1.5;
        });
        aplicarEscalasGrisesImpresion(c);
    }
}

/**
 * @param {Record<string, unknown>} chart
 */
function aplicarEscalasGrisesImpresion(chart) {
    const scales = chart.options?.scales;
    if (!scales || typeof scales !== 'object') return;
    for (const key of Object.keys(scales)) {
        const sc = /** @type {Record<string, unknown>} */ (scales[key]);
        if (!sc || typeof sc !== 'object') continue;
        if (sc.ticks && typeof sc.ticks === 'object') {
            sc.ticks = { ...sc.ticks, color: '#1e293b' };
        }
        if (sc.title && typeof sc.title === 'object') {
            sc.title = { ...sc.title, color: '#334155' };
        }
        if (sc.grid && typeof sc.grid === 'object') {
            sc.grid = { ...sc.grid, color: 'rgba(15, 23, 42, 0.12)' };
        }
    }
    const plugins = chart.options?.plugins;
    if (plugins?.legend && typeof plugins.legend === 'object') {
        plugins.legend = {
            ...plugins.legend,
            labels: {
                ...(/** @type {object} */ (plugins.legend).labels || {}),
                color: '#1e293b',
                boxWidth: 14,
                boxHeight: 10,
            },
        };
    }
}
