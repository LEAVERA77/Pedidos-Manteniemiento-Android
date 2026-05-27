/**
 * Barras horizontales en Admin → Estadísticas: ancho del eje Y según etiquetas (evita texto cortado).
 * made by leavera77
 */

/** @type {Set<string>} */
export const CHART_IDS_BARRA_HORIZONTAL = new Set([
    'chart-tipos',
    'chart-barrios-tiempo',
    'chart-distribuidores',
]);

function fontStringForScale(scale) {
    const tickFont = scale?.options?.ticks?.font || {};
    const size = tickFont.size || 11;
    const weight = tickFont.weight || '600';
    const family =
        tickFont.family ||
        (typeof Chart !== 'undefined' && Chart.defaults?.font?.family) ||
        'system-ui, sans-serif';
    return `${weight} ${size}px ${family}`;
}

/**
 * @param {import('chart.js').Chart} chart
 * @param {string[]} labels
 */
export function anchoEjeYEtiquetas(chart, labels) {
    const ctx = chart?.ctx;
    if (!ctx || !labels?.length) return 120;
    const scale = chart.scales?.y;
    ctx.save();
    ctx.font = fontStringForScale(scale);
    let max = 0;
    for (const lb of labels) {
        max = Math.max(max, ctx.measureText(String(lb ?? '')).width);
    }
    ctx.restore();
    return Math.ceil(max) + 18;
}

/** Ajusta ancho del eje Y tras crear/actualizar el gráfico. */
export function ajustarEjeYBarraHorizontal(chart) {
    if (!chart?.canvas?.id || !CHART_IDS_BARRA_HORIZONTAL.has(chart.canvas.id)) return;
    if (chart.config?.type !== 'bar' || chart.options?.indexAxis !== 'y') return;
    const scale = chart.scales?.y;
    if (!scale) return;
    const full = chart._gnLabelsFull;
    const labels =
        Array.isArray(full) && full.length === (chart.data?.labels?.length || 0)
            ? full
            : chart.data?.labels || [];
    const w = anchoEjeYEtiquetas(chart, labels);
    const next = Math.min(Math.max(w, 100), 320);
    if (Math.abs((scale.width || 0) - next) > 2) {
        scale.width = next;
        try {
            chart.resize();
        } catch (_) {}
    }
}

export function escalaYBarraHorizontalEstadisticas({ stacked = false } = {}) {
    return {
        stacked,
        grid: { display: false },
        ticks: {
            padding: 8,
            autoSkip: false,
            color: '#475569',
            font: { size: 11, weight: '600' },
            crossAlign: 'far',
        },
        afterFit(scale) {
            const chart = scale.chart;
            const full = chart?._gnLabelsFull;
            const labels =
                Array.isArray(full) && full.length === (chart?.data?.labels?.length || 0)
                    ? full
                    : chart?.data?.labels || [];
            const w = anchoEjeYEtiquetas(chart, labels);
            scale.width = Math.min(Math.max(w, 100), 320);
        },
    };
}

export function layoutPaddingBarraHorizontal() {
    return { top: 8, bottom: 8, left: 6, right: 52 };
}

/**
 * @param {Record<string, unknown>} opts
 */
export function mergeOpcionesBarraHorizontalEstadisticas(opts = {}) {
    const stacked = !!(opts.scales && /** @type {{ y?: { stacked?: boolean } }} */ (opts.scales).y?.stacked);
    const pad = layoutPaddingBarraHorizontal();
    const extraPad = opts.layout?.padding || {};
    return {
        ...opts,
        indexAxis: 'y',
        layout: {
            padding: {
                top: extraPad.top ?? pad.top,
                bottom: extraPad.bottom ?? pad.bottom,
                left: extraPad.left ?? pad.left,
                right: extraPad.right ?? pad.right,
            },
        },
        scales: {
            ...(opts.scales || {}),
            y: {
                ...escalaYBarraHorizontalEstadisticas({ stacked }),
                ...((opts.scales && opts.scales.y) || {}),
            },
        },
    };
}

/** @param {Array<{ distribuidor?: string }>} filas */
export function labelsEjeYDistribuidorRed(filas) {
    return (filas || []).map((r) => {
        const t = String(r.distribuidor || '').trim();
        return t.length > 44 ? `${t.slice(0, 43)}…` : t;
    });
}

/** Etiquetas completas para chart-tipos (tooltips usan _gnLabelsFull en app). */
export function labelsEjeYChartTipos(filas) {
    return (filas || []).map((r) => {
        const t = String(r.tipo || '').trim() || 'Sin tipo';
        return t.length > 42 ? `${t.slice(0, 41)}…` : t;
    });
}

/** @param {Array<{ barrio?: string }>} rows */
export function labelsEjeYBarriosTiempo(rows) {
    return (rows || []).map((r) => {
        const t = String(r.barrio || '').trim();
        return t.length > 36 ? `${t.slice(0, 35)}…` : t;
    });
}

/**
 * @param {import('chart.js').Chart} chart
 * @param {Array<{ barrio?: string }>} rows
 */
export function crearChartBarriosTiempoEstadisticas(crearChart, chartRef, rows) {
    if (!rows?.length) return;
    const labels = labelsEjeYBarriosTiempo(rows);
    crearChart(
        'chart-barrios-tiempo',
        'bar',
        labels,
        [
            {
                label: 'Horas prom. cierre',
                data: rows.map((r) => parseFloat(r.horas_prom || 0)),
                backgroundColor: 'rgba(186, 230, 253, 0.75)',
                borderColor: 'rgba(125, 211, 252, 0.55)',
                borderWidth: 1,
            },
        ],
        mergeOpcionesBarraHorizontalEstadisticas({
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (c) =>
                            ' ' +
                            (c.parsed?.x != null ? c.parsed.x.toFixed(1) : c.raw) +
                            ' h · n=' +
                            (rows[c.dataIndex]?.n ?? ''),
                    },
                },
            },
            scales: {
                x: { beginAtZero: true, title: { display: true, text: 'Horas' } },
            },
        })
    );
    const ch = chartRef['chart-barrios-tiempo'];
    if (ch) {
        ch._gnLabelsFull = rows.map((r) => String(r.barrio || ''));
        ajustarEjeYBarraHorizontal(ch);
    }
}

/** Barras verticales distribuidor/ramal/barrio (eje X con etiquetas rotadas). */
export function opcionesChartDistribuidoresEstadisticas() {
    return {
        layout: { padding: { top: 8, bottom: 48, left: 8, right: 12 } },
        plugins: {
            legend: { display: true, position: 'top' },
            tooltip: { callbacks: { label: (c) => ' ' + c.dataset.label + ': ' + c.parsed.y } },
        },
        scales: {
            x: {
                ticks: {
                    maxRotation: 50,
                    minRotation: 28,
                    autoSkip: false,
                    font: { size: 10 },
                    padding: 6,
                },
            },
        },
    };
}
