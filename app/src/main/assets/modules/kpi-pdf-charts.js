/**
 * Gráficos Chart.js para informe KPI en PDF (A4, barras horizontales, impresión).
 * made by leavera77
 */

import { KPI_PDF_IMPRESION_BARRAS_GRAYSCALE } from './graficos-pdf-export-theme.js';

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
    const rowPx = 24;
    const canvasH = Math.min(420, 58 + n * rowPx);
    const canvasW = 680;
    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    const lab = String(metricaTitle || '').trim() || 'Métrica';
    const labels = points.map((p) => pdfTruncLabel(p.label, 22));
    const data = points.map((p) => p.y);
    const bg = points.map((_, i) => KPI_PDF_IMPRESION_BARRAS_GRAYSCALE[i % KPI_PDF_IMPRESION_BARRAS_GRAYSCALE.length]);
    const chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: lab,
                    data,
                    backgroundColor: bg,
                    borderColor: '#0f172a',
                    borderWidth: 1.6,
                    maxBarThickness: 18,
                },
            ],
        },
        options: {
            indexAxis: 'y',
            animation: false,
            responsive: false,
            devicePixelRatio: 2,
            layout: { padding: { top: 12, bottom: 12, left: 8, right: 18 } },
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
                    grid: { color: 'rgba(15, 23, 42, 0.14)', lineWidth: 0.7 },
                    ticks: {
                        color: '#1e293b',
                        font: { size: 10, weight: '600', family: 'Helvetica, Arial, sans-serif' },
                        autoSkip: true,
                        maxTicksLimit: 8,
                    },
                    border: { color: '#64748b' },
                },
                y: {
                    grid: { display: false },
                    ticks: {
                        color: '#1e293b',
                        font: { size: 10, weight: '600', family: 'Helvetica, Arial, sans-serif' },
                        autoSkip: false,
                        padding: 4,
                    },
                    border: { color: '#64748b' },
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
