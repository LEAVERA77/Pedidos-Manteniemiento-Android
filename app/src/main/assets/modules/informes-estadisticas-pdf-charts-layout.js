/** Preparación temporal de Chart.js para capturar estadísticas en un PDF legible. */

/** Snapshots contienen las referencias originales, no resolvers de Chart.js. */
const _snap = new Map();
const HBAR_IDS = new Set(['chart-tipos', 'chart-barrios-tiempo']);

export function esChartBarraHorizontal(chart) {
    return chart?.config?.type === 'bar' && chart?.options?.indexAxis === 'y';
}

/** Se conserva por compatibilidad con quienes usan este módulo. */
export function medirPaddingIzqLabels(labels, fontPx = 9) {
    const maxLen = (labels || []).reduce((m, lb) => Math.max(m, String(lb || '').length), 0);
    return Math.min(280, Math.max(76, Math.ceil(maxLen * (fontPx * 0.5)) + 16));
}

export function alturaContenedorBarraHorizontal(n) {
    return Math.max(280, Math.min(1200, Math.max(1, Number(n) || 1) * 34 + 100));
}

export function chartWrapNecesitaPaginaCompleta(wrap) {
    if (!wrap) return false;
    if (wrap.id === 'chart-wrap-confiabilidad') return true;
    const id = wrap.querySelector?.('canvas')?.id || '';
    if (HBAR_IDS.has(id)) return true;
    const chart = typeof window !== 'undefined' ? window.__gnChartsEstadisticas?.[id] : null;
    return esChartBarraHorizontal(chart);
}

/** Copia opciones planas sin perder callbacks ni acceder a los proxies resueltos de Chart.js. */
function copiarOpciones(value, seen = new WeakMap()) {
    if (!value || typeof value !== 'object') return value;
    const proto = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) return value;
    if (seen.has(value)) return seen.get(value);
    const copy = Array.isArray(value) ? [] : {};
    seen.set(value, copy);
    for (const key of Object.keys(value)) copy[key] = copiarOpciones(value[key], seen);
    return copy;
}

/** Divide etiquetas largas sin descartar palabras. Chart.js acepta arrays multilínea. */
export function partirEtiquetaPdf(value, maxChars = 36) {
    const text = String(value ?? '').trim();
    if (!text) return [''];
    const lines = [];
    let line = '';
    const limit = Math.max(8, Number(maxChars) || 36);
    for (const word of text.split(/\s+/)) {
        const chars = Array.from(word);
        const parts = [];
        while (chars.length > limit) parts.push(chars.splice(0, limit).join(''));
        if (chars.length) parts.push(chars.join(''));
        for (const part of parts) {
            if (!line) line = part;
            else if (line.length + part.length + 1 <= limit && parts.length === 1) line += ` ${part}`;
            else { lines.push(line); line = part; }
        }
    }
    if (line) lines.push(line);
    return lines;
}

/**
 * Ajusta copias de opciones/datos; al terminar restaura exactamente las referencias
 * y estilos originales. Nunca expandir chart.options.*: son resolvers de Chart.js.
 */
export function aplicarChartsLayoutExportPdf(getCharts, activar) {
    const charts = typeof getCharts === 'function' ? getCharts() || {} : {};
    if (!activar) {
        for (const snap of _snap.values()) {
            try {
                snap.chart.data.labels = snap.labels;
                snap.chart.data.datasets = snap.datasets;
                snap.chart.options = snap.options;
                if (snap.containerStyle == null) snap.container.removeAttribute('style');
                else snap.container.setAttribute('style', snap.containerStyle);
                snap.chart.resize();
                snap.chart.update('none');
            } catch (e) { console.warn('[pdf-charts-restore]', e); }
        }
        _snap.clear();
        return;
    }

    for (const [id, chart] of Object.entries(charts)) {
        const canvas = document.getElementById(id);
        const container = canvas?.closest?.('.chart-container');
        if (!chart?.data || !chart?.config || !container || _snap.has(id)) continue;
        const snap = {
            chart, container,
            containerStyle: container.getAttribute('style'),
            options: chart.config.options,
            labels: chart.data.labels,
            datasets: chart.data.datasets,
        };
        _snap.set(id, snap);
        try {
            // Copiar config.options (objeto original); chart.options es un Proxy resuelto.
            const opts = copiarOpciones(snap.options || {});
            const horizontal = esChartBarraHorizontal(chart) || HBAR_IDS.has(id);
            const original = Array.isArray(snap.labels) ? snap.labels : [];
            const full = Array.isArray(chart._gnLabelsFull) && chart._gnLabelsFull.length === original.length
                ? chart._gnLabelsFull : original;
            chart.data.labels = horizontal ? full.map((label) => partirEtiquetaPdf(label)) : copiarOpciones(original);
            chart.data.datasets = copiarOpciones(snap.datasets || []);
            opts.animation = false;
            opts.responsive = true;
            opts.maintainAspectRatio = false;
            opts.layout = opts.layout || {};
            // El eje Y ya reserva ancho para etiquetas; agregar ese ancho otra vez oculta las barras.
            if (horizontal) {
                opts.layout.padding = { top: 12, bottom: 12, left: 8, right: 48 };
                opts.scales = opts.scales || {};
                opts.scales.y = opts.scales.y || {};
                opts.scales.y.ticks = { ...(opts.scales.y.ticks || {}), autoSkip: false, font: { size: 11, weight: '600' } };
                const rows = chart.data.labels.reduce((sum, label) => sum + Math.max(34, label.length * 15 + 12), 100);
                const h = Math.min(1800, Math.max(280, rows));
                container.style.setProperty('height', `${h}px`, 'important');
                container.style.setProperty('min-height', `${h}px`, 'important');
                container.style.setProperty('max-height', `${h}px`, 'important');
            } else {
                const h = chart.config.type === 'doughnut' ? 330 : 300;
                container.style.setProperty('height', `${h}px`, 'important');
                container.style.setProperty('min-height', `${h}px`, 'important');
                container.style.setProperty('max-height', `${h}px`, 'important');
            }
            chart.options = opts;
            chart.resize();
            chart.update('none');
        } catch (e) {
            // Un gráfico mal configurado no debe dejar alterado el resto del panel.
            console.warn(`[pdf-chart ${id}]`, e);
            try {
                chart.data.labels = snap.labels;
                chart.data.datasets = snap.datasets;
                chart.options = snap.options;
                if (snap.containerStyle == null) container.removeAttribute('style');
                else container.setAttribute('style', snap.containerStyle);
                chart.resize();
                chart.update('none');
            } catch (_) {}
            _snap.delete(id);
        }
    }
}

if (typeof window !== 'undefined') window.__gnChartsEstadisticas = window.__gnChartsEstadisticas || null;
