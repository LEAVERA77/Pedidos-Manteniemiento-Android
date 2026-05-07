/**
 * Estadísticas admin: gráfico motivos desestimación, tipos apilados con desestimados, bloque PDF.
 * made by leavera77
 */

import { CHART_PALETTE_ARRAY } from './graficos-colores.js';

export function sqlMotivosDesestimacion(filtro) {
    return `SELECT COALESCE(NULLIF(TRIM(motivo_desestimacion),''), '(Sin motivo)') AS motivo, COUNT(*)::int AS n
        FROM pedidos ${filtro} AND estado='Desestimado'
        GROUP BY 1 ORDER BY n DESC NULLS LAST LIMIT 14`;
}

export function datasetsTiposTrabajoConDesestimados(rTiposRows) {
    const otros = rTiposRows.map((r) => Math.max(0, parseInt(r.n, 10) - parseInt(r.nd || 0, 10)));
    const des = rTiposRows.map((r) => parseInt(r.nd || 0, 10));
    return [
        {
            label: 'Otros estados',
            data: otros,
            backgroundColor: rTiposRows.map((_, i) => CHART_PALETTE_ARRAY[i % CHART_PALETTE_ARRAY.length]),
            borderColor: 'rgba(148, 163, 184, 0.35)',
            borderWidth: 1,
        },
        {
            label: 'Desestimados',
            data: des,
            backgroundColor: 'rgba(107, 114, 128, 0.88)',
            borderColor: 'rgba(75, 85, 99, 0.55)',
            borderWidth: 1,
        },
    ];
}

export function opcionesChartTiposApilados() {
    return {
        indexAxis: 'y',
        layout: { padding: { top: 4, bottom: 4, left: 4, right: 36 } },
        plugins: {
            legend: { display: true, position: 'top' },
            tooltip: {
                callbacks: {
                    label: (c) => {
                        const v =
                            c.parsed && typeof c.parsed === 'object' && 'x' in c.parsed ? c.parsed.x : c.raw;
                        return ` ${c.dataset.label}: ${v} pedidos`;
                    },
                },
            },
        },
        scales: {
            x: { stacked: true, beginAtZero: true, ticks: { stepSize: 1 } },
            y: { stacked: true },
        },
    };
}

export function crearGraficoMotivosDesestimacion(crearChart, rMotivosRows) {
    const rows =
        rMotivosRows && rMotivosRows.length
            ? rMotivosRows
            : [{ motivo: '(Sin desestimados en el período)', n: 0 }];
    const lab = rows.map((r) => {
        const t = String(r.motivo || '');
        return t.length > 30 ? `${t.slice(0, 30)}…` : t;
    });
    const data = rows.map((r) => parseInt(r.n, 10) || 0);
    crearChart(
        'chart-desest-motivos',
        'doughnut',
        lab,
        [
            {
                data,
                backgroundColor: rows.map((_, i) => CHART_PALETTE_ARRAY[i % CHART_PALETTE_ARRAY.length]),
                borderWidth: 1.5,
                borderColor: 'rgba(255, 255, 255, 0.98)',
            },
        ],
        {
            plugins: {
                legend: { display: true, position: 'bottom' },
                tooltip: { callbacks: { label: (c) => ` ${c.label}: ${c.parsed} pedidos` } },
            },
        }
    );
}

export function insertarCardDesestimadosEnResumen(cardList, desestimados, totalN) {
    const n = Number(desestimados) || 0;
    const t = Number(totalN) || 0;
    const idx = cardList.findIndex((c) => c.lbl === 'Pendientes');
    const insertAt = idx >= 0 ? idx + 1 : 1;
    cardList.splice(insertAt, 0, {
        val: n,
        lbl: 'Desestimados',
        cls: n > 0 ? 'dash-kpi-slate' : '',
    });
}

export function renderBloquePdfDesestimados(el, { totalN, desestimados, motivosRows }) {
    if (!el) return;
    const tot = Number(totalN) || 0;
    const des = Number(desestimados) || 0;
    const pct = tot > 0 ? Math.round(1000 * (des / tot)) / 10 : 0;
    const rows = motivosRows || [];
    const filas =
        rows.length > 0
            ? rows
                  .map(
                      (r) =>
                          `<tr><td style="padding:.25rem .35rem;border:1px solid #cbd5e1">${String(r.motivo || '')
                              .replace(/</g, '&lt;')
                              .replace(/&/g, '&amp;')}</td><td style="padding:.25rem .35rem;border:1px solid #cbd5e1;text-align:right">${parseInt(
                              r.n,
                              10
                          ) || 0}</td></tr>`
                  )
                  .join('')
            : '<tr><td colspan="2" style="padding:.35rem;color:#64748b">Sin motivos registrados en el período.</td></tr>';
    el.innerHTML = `
      <div style="margin:.65rem 0 0;padding:.65rem .75rem;border:1px solid var(--bo);border-radius:.5rem;background:#f8fafc">
        <h4 style="margin:0 0 .45rem;font-size:.88rem;color:var(--bd)">Reclamos desestimados</h4>
        <p style="margin:0 0 .5rem;font-size:.78rem;color:var(--tm);line-height:1.45">
          Total en período: <strong>${des}</strong> de <strong>${tot}</strong> pedidos (${pct}%).
        </p>
        <p style="margin:0 0 .35rem;font-size:.72rem;font-weight:600;color:var(--tm)">Desglose por motivo</p>
        <table style="width:100%;border-collapse:collapse;font-size:.76rem">
          <thead><tr><th style="text-align:left;padding:.25rem .35rem;border:1px solid #cbd5e1;background:#e2e8f0">Motivo</th>
          <th style="text-align:right;padding:.25rem .35rem;border:1px solid #cbd5e1;background:#e2e8f0">Cant.</th></tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </div>`;
}
