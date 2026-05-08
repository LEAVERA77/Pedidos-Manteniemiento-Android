/**
 * Gráficos Chart.js para informe KPI en PDF (A4, barras horizontales, impresión).
 * made by leavera77
 */

import { KPI_PDF_IMPRESION_BARRAS_SOLIDOS } from './graficos-colores.js';

function pdfTruncLabel(s, max) {
    const t = String(s ?? '')
        .replace(/\s+/g, ' ')
        .trim();
    if (t.length <= max) return t;
    return t.slice(0, Math.max(1, max - 1)) + '…';
}

/**
 * @param {string} metricaTitle
 * @param {{ label: string, y: number }[]} points
 * @returns {Promise<string|null>} data URL PNG
 */
export async function kpiPdfMiniChartDataUrl(metricaTitle, points) {
    if (!points?.length || typeof Chart === 'undefined') return null;
    const n = points.length;
    const rowPx = 22;
    const canvasH = Math.min(480, 56 + n * rowPx);
    const canvasW = 720;
    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    const lab = String(metricaTitle || '').trim() || 'Métrica';
    const labels = points.map((p) => pdfTruncLabel(p.label, 22));
    const data = points.map((p) => p.y);
    const bg = points.map((_, i) => KPI_PDF_IMPRESION_BARRAS_SOLIDOS[i % KPI_PDF_IMPRESION_BARRAS_SOLIDOS.length]);
    const chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: lab,
                    data,
                    backgroundColor: bg,
                    borderColor: '#1e293b',
                    borderWidth: 1,
                    maxBarThickness: 20,
                },
            ],
        },
        options: {
            indexAxis: 'y',
            animation: false,
            responsive: false,
            devicePixelRatio: 2,
            layout: { padding: { top: 10, bottom: 10, left: 6, right: 14 } },
            plugins: {
                legend: { display: false },
                title: {
                    display: true,
                    text: lab,
                    color: '#0f172a',
                    font: { size: 12, weight: '600' },
                    padding: { bottom: 8 },
                },
            },
            scales: {
                x: {
                    position: 'bottom',
                    beginAtZero: false,
                    grid: { color: '#e2e8f0', lineWidth: 0.6 },
                    ticks: {
                        color: '#0f172a',
                        font: { size: 10, family: 'Helvetica, Arial, sans-serif' },
                        autoSkip: true,
                        maxTicksLimit: 8,
                    },
                    border: { color: '#cbd5e1' },
                },
                y: {
                    grid: { display: false },
                    ticks: {
                        color: '#0f172a',
                        font: { size: 10, family: 'Helvetica, Arial, sans-serif' },
                        autoSkip: false,
                    },
                    border: { color: '#cbd5e1' },
                },
            },
        },
        plugins: [
            {
                id: 'kpiPdfWhiteBg',
                beforeDraw(c) {
                    const { ctx: cctx, width, height } = c;
                    cctx.save();
                    cctx.fillStyle = '#ffffff';
                    cctx.fillRect(0, 0, width, height);
                    cctx.restore();
                },
            },
        ],
    });
    await new Promise((r) => setTimeout(r, 140));
    let url = null;
    try {
        url = canvas.toDataURL('image/png');
    } catch (_) {
        url = null;
    }
    try {
        chart.destroy();
    } catch (_) {}
    return url;
}
