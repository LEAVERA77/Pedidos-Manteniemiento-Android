/**
 * Leyendas bajo gráficos de Admin → Estadísticas (solo datos; sin texto de significado de colores).
 * made by leavera77
 */

import { filasTiposTrabajoParaGraficoEstadisticas } from './estadisticas-desestimados.js';

/**
 * @param {object} p
 * @param {(s: unknown) => string} p.scap
 * @param {(n: number, tot: number) => number} p.pctOf
 * @param {boolean} p.esMun
 * @param {boolean} p.esCooperativaAgua
 * @param {{ rows?: Array<{ mes?: string, total?: unknown, cerrados?: unknown }> }} p.rMensual
 * @param {{ rows?: Array<{ estado?: string, n?: unknown }> }} p.rEstados
 * @param {{ rows?: Array<{ prioridad?: string, n?: unknown }> }} p.rPrior
 * @param {{ rows?: Array<{ distribuidor?: string, n?: unknown, cerrados?: unknown }> }} p.rDist
 * @param {{ rows?: unknown[] }} p.rBarT
 * @param {{ rows?: Array<{ tipo?: string, n?: unknown }> }} p.rTipos
 * @param {{ rows?: Array<{ usuario?: string, n?: unknown }> } | null} p.rUsuarios
 * @param {{ rows?: Array<{ tecnico?: string, n?: unknown }> } | null} p.rTecnicos
 */
export function pintarCaptionsGraficosEstadisticasAdmin(p) {
    const scap = p.scap;
    const pctOf = p.pctOf;
    const esMun = p.esMun;
    const esCooperativaAgua = !!p.esCooperativaAgua;
    const rMensual = p.rMensual || { rows: [] };
    const rEstados = p.rEstados || { rows: [] };
    const rPrior = p.rPrior || { rows: [] };
    const rDist = p.rDist || { rows: [] };
    const rBarT = p.rBarT || { rows: [] };
    const rTipos = p.rTipos || { rows: [] };
    const rUsuarios = p.rUsuarios || { rows: [] };
    const rTecnicos = p.rTecnicos || { rows: [] };

    const capM = document.getElementById('chart-cap-mensual');
    if (capM) {
        const totCr = rMensual.rows.reduce((s, r) => s + parseInt(r.total || 0, 10), 0);
        const totCe = rMensual.rows.reduce((s, r) => s + parseInt(r.cerrados || 0, 10), 0);
        capM.innerHTML = `<strong>Resumen numérico</strong> · Suma de pedidos creados (por mes): ${totCr}. Suma de cierres registrados por mes: ${totCe}.`;
    }
    const totEst = (rEstados.rows || []).reduce((s, r) => s + parseInt(r.n || 0, 10), 0);
    const capE = document.getElementById('chart-cap-estados');
    if (capE) {
        if (totEst) {
            const lines = rEstados.rows.map((r) => {
                const n = parseInt(r.n || 0, 10);
                return `${scap(r.estado)} <strong>${pctOf(n, totEst)}%</strong> (${n})`;
            }).join(' · ');
            capE.innerHTML = `<strong>Distribución sobre ${totEst} pedidos</strong><br>${lines}`;
        } else capE.textContent = 'Sin datos en el período.';
    }
    const totPr = (rPrior.rows || []).reduce((s, r) => s + parseInt(r.n || 0, 10), 0);
    const capP = document.getElementById('chart-cap-prioridades');
    if (capP) {
        if (totPr) {
            const lines = rPrior.rows.map((r) => {
                const n = parseInt(r.n || 0, 10);
                return `${scap(r.prioridad)} <strong>${pctOf(n, totPr)}%</strong> (${n})`;
            }).join(' · ');
            capP.innerHTML = `<strong>Distribución sobre ${totPr} pedidos</strong><br>${lines}`;
        } else capP.textContent = 'Sin datos en el período.';
    }
    const capD = document.getElementById('chart-cap-distribuidores');
    if (capD) {
        const lblZ = esMun ? 'barrio' : esCooperativaAgua ? 'ramal' : 'distribuidor';
        if ((rDist.rows || []).length) {
            const lines = rDist.rows
                .map((r) => {
                    const n = parseInt(r.n || 0, 10);
                    const c = parseInt(r.cerrados || 0, 10);
                    const pc = n ? pctOf(c, n) : 0;
                    return `${scap(r.distribuidor)}: total ${n}, cerrados ${c} (<strong>${pc}%</strong> del propio ${lblZ})`;
                })
                .join('<br>');
            capD.innerHTML = `<strong>Por ${lblZ}</strong><br>${lines}`;
        } else capD.textContent = 'Sin datos en el período.';
    }
    const capBT = document.getElementById('chart-cap-barrios-tiempo');
    if (capBT) {
        if (esMun && (rBarT.rows || []).length) {
            capBT.innerHTML =
                '<strong>Tiempo promedio de resolución por barrio</strong> (pedidos cerrados en el período). ' +
                'Barras más cortas = cierre más rápido. Requiere columna <code>barrio</code> en pedidos.';
        } else capBT.textContent = '';
    }
    const tiposCaptionRows = filasTiposTrabajoParaGraficoEstadisticas(rTipos.rows || []);
    const totTip = tiposCaptionRows.reduce((s, r) => s + parseInt(r.n || 0, 10), 0);
    const capT = document.getElementById('chart-cap-tipos');
    if (capT) {
        if (totTip) {
            const lines = tiposCaptionRows
                .map((r) => {
                    const n = parseInt(r.n || 0, 10);
                    return `${scap(r.tipo)} <strong>${pctOf(n, totTip)}%</strong> (${n})`;
                })
                .join(' · ');
            capT.innerHTML = `<strong>Top tipos (${totTip} pedidos en la muestra)</strong><br>${lines}`;
        } else capT.textContent = 'Sin datos en el período.';
    }
    const totU = (rUsuarios.rows || []).reduce((s, r) => s + parseInt(r.n || 0, 10), 0);
    const capU = document.getElementById('chart-cap-usuarios');
    if (capU) {
        if (totU && (rUsuarios.rows || []).length) {
            const lines = rUsuarios.rows
                .map((r) => {
                    const n = parseInt(r.n || 0, 10);
                    return `${scap(r.usuario)} <strong>${pctOf(n, totU)}%</strong> (${n})`;
                })
                .join(' · ');
            capU.innerHTML = `<strong>Creadores (${totU} pedidos)</strong><br>${lines}`;
        } else capU.textContent = 'Sin datos en el período.';
    }
    const totTc = (rTecnicos.rows || []).reduce((s, r) => s + parseInt(r.n || 0, 10), 0);
    const capTc = document.getElementById('chart-cap-tecnicos');
    if (capTc) {
        if (totTc && (rTecnicos.rows || []).length) {
            const lines = rTecnicos.rows
                .map((r) => {
                    const n = parseInt(r.n || 0, 10);
                    return `${scap(r.tecnico)} <strong>${pctOf(n, totTc)}%</strong> (${n})`;
                })
                .join(' · ');
            capTc.innerHTML = `<strong>Cierres por técnico (${totTc} pedidos)</strong><br>${lines}`;
        } else if ((rTecnicos.rows || []).length === 0) capTc.innerHTML = '';
    }
}
