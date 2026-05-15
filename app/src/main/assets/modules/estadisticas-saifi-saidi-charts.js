/**
 * Gráficos SAIFI / SAIDI (Admin → Estadísticas, cooperativa eléctrica).
 * Estimación interna: cierres de reclamos de red / usuarios (catálogo o Red Eléctrica).
 * made by leavera77
 */

/**
 * @param {(id: string, type: string, labels: string[], datasets: object[], extraOpts?: object) => void} crearChart
 * @param {{
 *   showConf: boolean;
 *   confRows: Array<{ mes?: string; ev?: unknown; min_tot?: unknown }>;
 *   denomEff: number;
 *   saifiPeriodo: number | null;
 *   saidiPeriodo: number | null;
 *   denomMeta: { fuente?: string; n?: number };
 * }} p
 */
export function crearGraficosSaifiSaidi(crearChart, p) {
    if (!p.showConf) return;

    const rows = p.confRows || [];
    const denom = Math.max(1, Number(p.denomEff) || 1);
    const hasMes = rows.length > 0;

    const labels = hasMes
        ? rows.map((r) => String(r.mes || ''))
        : ['Período (sin cierres de red)'];

    const saifiVals = hasMes
        ? rows.map((r) => {
              const ev = parseInt(r.ev || 0, 10);
              return Math.round((ev / denom) * 10000) / 10000;
          })
        : [p.saifiPeriodo != null ? Number(p.saifiPeriodo) : 0];

    const saidiVals = hasMes
        ? rows.map((r) => {
              const min = parseFloat(r.min_tot || 0);
              return Math.round((min / denom) * 10) / 10;
          })
        : [p.saidiPeriodo != null ? Math.round(Number(p.saidiPeriodo) * 10) / 10 : 0];

    const refSaifi =
        p.saifiPeriodo != null && hasMes
            ? [{ type: 'line', borderColor: 'rgba(37, 99, 235, 0.45)', borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0, data: labels.map(() => Number(p.saifiPeriodo)), label: 'Prom. período' }]
            : [];

    const refSaidi =
        p.saidiPeriodo != null && hasMes
            ? [{ type: 'line', borderColor: 'rgba(180, 83, 9, 0.45)', borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0, data: labels.map(() => Math.round(Number(p.saidiPeriodo) * 10) / 10), label: 'Prom. período' }]
            : [];

    crearChart(
        'chart-saifi',
        'line',
        labels,
        [
            {
                label: 'SAIFI (int./usuario)',
                data: saifiVals,
                borderColor: 'rgba(37, 99, 235, 0.95)',
                backgroundColor: 'rgba(147, 197, 253, 0.28)',
                fill: true,
                tension: 0.22,
                pointRadius: 4,
                pointHoverRadius: 6,
            },
            ...refSaifi,
        ],
        {
            plugins: {
                legend: { display: true, position: 'top' },
                tooltip: {
                    callbacks: {
                        label: (c) => {
                            const v = c.parsed?.y;
                            return ` ${c.dataset.label}: ${v != null ? v : c.raw}`;
                        },
                    },
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grace: '5%',
                    title: { display: true, text: 'Interrupciones / usuario' },
                    ticks: { color: '#475569' },
                },
                x: {
                    ticks: { maxRotation: 45, minRotation: 0, color: '#475569' },
                    grid: { display: false },
                },
            },
        }
    );

    crearChart(
        'chart-saidi',
        'line',
        labels,
        [
            {
                label: 'SAIDI (min/usuario)',
                data: saidiVals,
                borderColor: 'rgba(180, 83, 9, 0.95)',
                backgroundColor: 'rgba(253, 230, 138, 0.35)',
                fill: true,
                tension: 0.22,
                pointRadius: 4,
                pointHoverRadius: 6,
            },
            ...refSaidi,
        ],
        {
            plugins: {
                legend: { display: true, position: 'top' },
                tooltip: {
                    callbacks: {
                        label: (c) => {
                            const v = c.parsed?.y;
                            return ` ${c.dataset.label}: ${v != null ? v : c.raw} min/usuario`;
                        },
                    },
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grace: '5%',
                    title: { display: true, text: 'Minutos acum. / usuario' },
                    ticks: { color: '#475569' },
                },
                x: {
                    ticks: { maxRotation: 45, minRotation: 0, color: '#475569' },
                    grid: { display: false },
                },
            },
        }
    );
}

/**
 * @param {{
 *   scap: (s: unknown) => string;
 *   confRows: Array<{ mes?: string; ev?: unknown; min_tot?: unknown }>;
 *   denomEff: number;
 *   saifiPeriodo: number | null;
 *   saidiPeriodo: number | null;
 *   denomMeta: { fuente?: string; n?: number; parcial?: boolean };
 *   evConfTot: number;
 *   minConfTot: number;
 * }} p
 */
export function pintarCaptionConfiabilidadSaifiSaidi(p) {
    const cap = document.getElementById('chart-cap-confiabilidad');
    if (!cap) return;
    const scap = p.scap;
    const denom = Math.max(1, Number(p.denomEff) || 1);
    const rows = p.confRows || [];
    if (!rows.length) {
        cap.innerHTML =
            '<strong>Confiabilidad eléctrica</strong> · Sin cierres de reclamos de red en el período seleccionado. ' +
            (p.saifiPeriodo != null
                ? `Prom. período: SAIFI ${scap(String(p.saifiPeriodo))}, SAIDI ${scap(String(p.saidiPeriodo))} min/usuario. `
                : '') +
            `Denominador: ${denom.toLocaleString('es-AR')} usuarios (${scap(p.denomMeta.fuente || 'catalogo')}).`;
        return;
    }
    const lines = rows
        .map((r) => {
            const ev = parseInt(r.ev || 0, 10);
            const min = parseFloat(r.min_tot || 0);
            const saifi = Math.round((ev / denom) * 10000) / 10000;
            const saidi = Math.round((min / denom) * 10) / 10;
            return `${scap(r.mes)}: SAIFI <strong>${saifi}</strong> (${ev} int.) · SAIDI <strong>${saidi}</strong> min/usu.`;
        })
        .join('<br>');
    const fuenteLbl =
        p.denomMeta.fuente === 'red'
            ? 'clientes Red Eléctrica (distribuidores afectados)'
            : p.denomMeta.fuente === 'socios_catalogo'
              ? 'socios activos por Dist. en catálogo (columna distribuidor_codigo)'
              : 'total socios activos en catálogo';
    cap.innerHTML =
        `<strong>Estimación mensual</strong> · Denominador: ${denom.toLocaleString('es-AR')} usuarios (${fuenteLbl}` +
        (p.denomMeta.parcial ? ', parcial' : '') +
        `). Total período: ${p.evConfTot} interrupciones, ${Math.round(p.minConfTot)} min acum., SAIFI prom. <strong>${p.saifiPeriodo != null ? scap(String(p.saifiPeriodo)) : '—'}</strong>, SAIDI prom. <strong>${p.saidiPeriodo != null ? scap(String(p.saidiPeriodo)) : '—'}</strong> min/usuario.<br>${lines}`;
}
