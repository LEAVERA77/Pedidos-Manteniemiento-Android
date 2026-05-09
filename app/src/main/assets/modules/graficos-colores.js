/**
 * Paleta KPI / estadísticas (legible en pantalla e impresión A4).
 * made by leavera77
 */

/** Doughnut «estados» — hex sólidos + borde blanco (Chart.js ya define border en app). */
export const ESTADO_DONUT_COLORS = {
    Pendiente: '#fcd34d',
    Asignado: '#93c5fd',
    'En ejecución': '#c4b5fd',
    Cerrado: '#6ee7b7',
    Desestimado: '#d1d5db',
    'Derivado externo': '#fca5a5',
};

export const DONUT_FALLBACK_SEQUENCE = [
    '#e2e8f0',
    '#cbd5e1',
    '#fcd34d',
    '#93c5fd',
    '#c4b5fd',
    '#6ee7b7',
    '#d1d5db',
    '#fca5a5',
];

/** Lista rotativa (tipos / usuarios / barras genéricas). */
/** Barras horizontales KPI PDF / impresión A4 (pastel, legible en pantalla e impresión). */
export const KPI_PDF_IMPRESION_BARRAS_SOLIDOS = [
    '#93c5fd',
    '#6ee7b7',
    '#fcd34d',
    '#c4b5fd',
    '#fca5a5',
    '#d1d5db',
    '#a5b4fc',
    '#fde68a',
];

export const CHART_PALETTE_ARRAY = [
    'rgba(252, 211, 77, 0.9)',
    'rgba(147, 197, 253, 0.9)',
    'rgba(196, 181, 253, 0.9)',
    'rgba(110, 231, 183, 0.9)',
    'rgba(209, 213, 219, 0.88)',
    'rgba(252, 165, 165, 0.9)',
    'rgba(253, 230, 138, 0.88)',
    'rgba(165, 180, 252, 0.88)',
    'rgba(167, 243, 208, 0.88)',
    'rgba(226, 232, 240, 0.85)',
];

export function datasetsMensualCreadosCerrados(rMensualRows) {
    return [
        {
            label: 'Creados',
            data: rMensualRows.map((r) => parseInt(r.total || 0, 10)),
            backgroundColor: 'rgba(252, 211, 77, 0.92)',
            borderColor: 'rgba(245, 158, 11, 0.55)',
            borderWidth: 1.5,
        },
        {
            label: 'Cerrados',
            data: rMensualRows.map((r) => parseInt(r.cerrados || 0, 10)),
            backgroundColor: 'rgba(110, 231, 183, 0.92)',
            borderColor: 'rgba(52, 211, 153, 0.55)',
            borderWidth: 1.5,
        },
    ];
}
