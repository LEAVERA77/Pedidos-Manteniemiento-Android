/** Chart.js plugins estadisticas admin. made by leavera77 */
export function initGNChartPercentPlugins() {
    if (window.__gnChartPctPlugins || typeof Chart === 'undefined') return;
    window.__gnChartPctPlugins = true;
    Chart.register({
        id: 'gestornovaPctDoughnut',
        afterDatasetsDraw(chart) {
            if (chart.config.type !== 'doughnut') return;
            const ds = chart.data.datasets[0];
            if (!ds?.data?.length) return;
            const total = ds.data.reduce((s, v) => s + Number(v || 0), 0);
            if (!total) return;
            const ctx = chart.ctx;
            const meta = chart.getDatasetMeta(0);
            ctx.save();
            ctx.font = '600 9.5px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            meta.data.forEach((arc, i) => {
                const v = Number(ds.data[i] || 0);
                if (!v) return;
                const pct = Math.round(1000 * v / total) / 10;
                const { x, y } = arc.tooltipPosition();
                const ink = typeof window !== 'undefined' && window.__gnStatsInkSave;
                ctx.lineWidth = ink ? 0 : 4;
                ctx.strokeStyle = 'rgba(255,255,255,.95)';
                ctx.fillStyle = '#0f172a';
                const t = pct + '%';
                if (!ink) ctx.strokeText(t, x, y);
                ctx.fillText(t, x, y);
            });
            ctx.restore();
        }
    });
    Chart.register({
        id: 'gestornovaStatsBarLabels',
        afterDatasetsDraw(chart) {
            const cid = chart.canvas?.id;
            const ctx = chart.ctx;
            const area = chart.chartArea;
            if (!ctx || !area) return;
            ctx.save();
            const drawPctVertical = (data, meta0) => {
                if (!data?.length || !meta0?.data?.length || meta0.hidden) return;
                const total = data.reduce((s, v) => s + Number(v || 0), 0);
                if (!total) return;
                ctx.font = '600 10px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
                ctx.textAlign = 'center';
                meta0.data.forEach((bar, i) => {
                    const v = Number(data[i] || 0);
                    if (!v) return;
                    const pct = Math.round(1000 * v / total) / 10;
                    const p = typeof bar.getProps === 'function' ? bar.getProps(['x', 'y', 'base'], true) : null;
                    const x = p?.x ?? bar.x;
                    const yv = p?.y ?? bar.y;
                    const bs = p?.base ?? bar.base;
                    if (x == null || yv == null || bs == null) return;
                    const top = Math.min(yv, bs);
                    const bot = Math.max(yv, bs);
                    const h = bot - top;
                    let ty = top - 5;
                    ctx.textBaseline = 'bottom';
                    if (ty < area.top + 14) {
                        ty = top + h / 2;
                        ctx.textBaseline = 'middle';
                    }
                    if (ctx.textBaseline === 'bottom' && ty > area.bottom - 10) {
                        ty = top + h / 2;
                        ctx.textBaseline = 'middle';
                    }
                    const t = pct + '%';
                    const inkP = typeof window !== 'undefined' && window.__gnStatsInkSave;
                    ctx.lineWidth = inkP ? 0 : 3;
                    ctx.strokeStyle = 'rgba(255,255,255,.95)';
                    ctx.fillStyle = '#0f172a';
                    if (!inkP) ctx.strokeText(t, x, ty);
                    ctx.fillText(t, x, ty);
                });
            };
            if (cid === 'chart-mensual' && chart.config.type === 'bar' && chart.options.indexAxis !== 'y') {
                chart.data.datasets.forEach((ds, di) => {
                    const meta = chart.getDatasetMeta(di);
                    if (meta.hidden || !meta?.data?.length) return;
                    meta.data.forEach((bar, i) => {
                        const v = Number(ds.data[i] || 0);
                        if (!v) return;
                        const cp = typeof bar.getCenterPoint === 'function' ? bar.getCenterPoint() : null;
                        const x = cp?.x ?? bar.x;
                        const y = cp?.y ?? bar.y;
                        if (x == null || y == null) return;
                        const inkM = typeof window !== 'undefined' && window.__gnStatsInkSave;
                        ctx.font = '600 10px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.lineWidth = inkM ? 1.5 : 3;
                        ctx.strokeStyle = inkM ? 'rgba(255,255,255,.88)' : 'rgba(255,255,255,.92)';
                        ctx.fillStyle = '#0f172a';
                        const t = String(v);
                        if (!inkM || v >= 1) ctx.strokeText(t, x, y);
                        ctx.fillText(t, x, y);
                    });
                });
                ctx.restore();
                return;
            }
            if (cid === 'chart-tipos' && chart.config.type === 'bar' && chart.options.indexAxis === 'y') {
                const dsets = chart.data.datasets || [];
                const metaLast = chart.getDatasetMeta(dsets.length - 1);
                if (!metaLast?.data?.length) {
                    ctx.restore();
                    return;
                }
                ctx.font = '600 10px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
                ctx.fillStyle = '#0f172a';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                metaLast.data.forEach((bar, i) => {
                    let sum = 0;
                    dsets.forEach((ds) => {
                        sum += Number(ds.data?.[i] || 0);
                    });
                    if (!sum) return;
                    const p = typeof bar.getProps === 'function' ? bar.getProps(['x', 'y', 'base'], true) : null;
                    const xv = p?.x ?? bar.x;
                    const yv = p?.y ?? bar.y;
                    const bs = p?.base ?? bar.base;
                    if (xv == null || yv == null || bs == null) return;
                    const right = Math.max(xv, bs);
                    const tx = Math.min(right + 6, area.right - 4);
                    ctx.fillText(String(sum), tx, yv);
                });
                ctx.restore();
                return;
            }
            const pctCharts = { 'chart-usuarios': true, 'chart-tecnicos': true };
            if (pctCharts[cid] && chart.config.type === 'bar' && chart.options.indexAxis !== 'y') {
                drawPctVertical(chart.data.datasets[0]?.data, chart.getDatasetMeta(0));
            }
            ctx.restore();
        }
    });

}
