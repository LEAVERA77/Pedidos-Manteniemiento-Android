/**
 * Paleta KPI / estadísticas (legible en pantalla e impresión A4).
 * made by leavera77
 */

/** Doughnut «estados» — hex sólidos + borde blanco (Chart.js ya define border en app). */
export const ESTADO_DONUT_COLORS = {
    Pendiente: '#f59e0b',
    Asignado: '#3b82f6',
    'En ejecución': '#8b5cf6',
    Cerrado: '#10b981',
    Desestimado: '#6b7280',
    'Derivado externo': '#ef4444',
};

export const DONUT_FALLBACK_SEQUENCE = [
    '#94a3b8',
    '#cbd5e1',
    '#e2e8f0',
    '#fcd34d',
    '#93c5fd',
    '#c4b5fd',
];

/** Lista rotativa (tipos / usuarios / barras genéricas). */
export const CHART_PALETTE_ARRAY = [
    'rgba(245, 158, 11, 0.82)',
    'rgba(59, 130, 246, 0.82)',
    'rgba(139, 92, 246, 0.82)',
    'rgba(16, 185, 129, 0.82)',
    'rgba(107, 114, 128, 0.78)',
    'rgba(251, 191, 36, 0.78)',
    'rgba(56, 189, 248, 0.78)',
    'rgba(167, 139, 250, 0.78)',
    'rgba(52, 211, 153, 0.78)',
    'rgba(148, 163, 184, 0.72)',
];

export function datasetsMensualCreadosCerrados(rMensualRows) {
    return [
        {
            label: 'Creados',
            data: rMensualRows.map((r) => parseInt(r.total || 0, 10)),
            backgroundColor: 'rgba(245, 158, 11, 0.88)',
            borderColor: 'rgba(217, 119, 6, 0.75)',
            borderWidth: 1.5,
        },
        {
            label: 'Cerrados',
            data: rMensualRows.map((r) => parseInt(r.cerrados || 0, 10)),
            backgroundColor: 'rgba(16, 185, 129, 0.88)',
            borderColor: 'rgba(5, 150, 105, 0.75)',
            borderWidth: 1.5,
        },
    ];
}
