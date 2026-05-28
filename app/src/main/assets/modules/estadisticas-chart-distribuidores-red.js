/**
 * Gráfico «Por distribuidor» en coop. eléctrica: catálogo distribuidores_red + pedidos del período.
 * made by leavera77
 */

import { codigoDistribuidorDesdeTextoPedido } from './estadisticas-datos-red-saifi.js';
import {
    mergeOpcionesBarraHorizontalEstadisticas,
    ajustarEjeYBarraHorizontal,
    labelsEjeYDistribuidorRed,
    opcionesChartDistribuidoresEstadisticas,
} from './estadisticas-chart-hbar-layout.js';

/** SQL: agrupa pedidos por código de distribuidor (columna distribuidor en pedidos). */
export function sqlPedidosPorCodigoDistribuidor(filtro) {
    const base = String(filtro || '').trim();
    const clause = base ? `${base} AND` : 'WHERE';
    return `SELECT COALESCE(NULLIF(TRIM(SPLIT_PART(COALESCE(NULLIF(TRIM(distribuidor),''), '—'), ' - ', 1)), ''), 'Sin código') AS distribuidor,
        COUNT(*)::int AS n,
        COUNT(*) FILTER(WHERE estado='Cerrado')::int AS cerrados
        FROM pedidos ${clause} COALESCE(NULLIF(TRIM(distribuidor),''), '') <> ''
        GROUP BY 1 ORDER BY n DESC`;
}

/**
 * @param {string} codigo
 * @param {string} nombre
 * @param {string} [localidad]
 */
export function etiquetaDistribuidorRed(codigo, nombre, localidad) {
    const c = String(codigo || '').trim();
    const n = String(nombre || '').trim();
    const loc = String(localidad || '').trim();
    let t = c;
    if (n && n.toUpperCase() !== c.toUpperCase()) t += ` · ${n}`;
    if (loc) t += ` (${loc})`;
    return t.length > 48 ? `${t.slice(0, 47)}…` : t;
}

/**
 * @param {{
 *   getApiToken?: () => string | null | undefined;
 *   apiUrl?: (p: string) => string;
 *   asegurarJwtApiRest?: () => Promise<void>;
 * }} d
 */
async function fetchCatalogoRedElectrica(d) {
    try {
        await d.asegurarJwtApiRest?.();
        const tok = d.getApiToken?.();
        if (!tok || !d.apiUrl) return [];
        const url = String(d.apiUrl('/api/admin/red-electrica') || '').replace(/\/+$/, '');
        const r = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return [];
        return Array.isArray(j.rows) ? j.rows : [];
    } catch (_) {
        return [];
    }
}

/**
 * @param {Array<{ distribuidor?: string; n?: unknown; cerrados?: unknown }>} pedidosRows
 */
function mapaPedidosPorCodigo(pedidosRows) {
    /** @type {Record<string, { n: number; cerrados: number }>} */
    const map = {};
    for (const row of pedidosRows || []) {
        const code =
            codigoDistribuidorDesdeTextoPedido(row.distribuidor) ||
            String(row.distribuidor || '')
                .trim()
                .toUpperCase();
        if (!code || code === 'SIN CÓDIGO' || code === 'SIN CODIGO') continue;
        const n = parseInt(row.n, 10) || 0;
        const c = parseInt(row.cerrados, 10) || 0;
        if (!map[code]) map[code] = { n: 0, cerrados: 0 };
        map[code].n += n;
        map[code].cerrados += c;
    }
    return map;
}

/**
 * @param {Array<Record<string, unknown>>} catalog
 * @param {Record<string, { n: number; cerrados: number }>} pedidosMap
 * @param {{ maxFilas?: number }} [opts]
 */
export function filasChartDistribuidoresRedElectrica(catalog, pedidosMap, opts = {}) {
    const maxFilas = opts.maxFilas ?? 40;
    const out = [];
    const seen = new Set();
    for (const row of catalog || []) {
        const codigo = String(row.codigo || '')
            .trim()
            .toUpperCase();
        if (!codigo) continue;
        seen.add(codigo);
        const stats = pedidosMap[codigo] || { n: 0, cerrados: 0 };
        out.push({
            codigo,
            distribuidor: etiquetaDistribuidorRed(codigo, row.nombre, row.localidad),
            n: stats.n,
            cerrados: stats.cerrados,
            clientes: parseInt(row.clientes, 10) || 0,
        });
    }
    for (const [codigo, stats] of Object.entries(pedidosMap)) {
        if (seen.has(codigo)) continue;
        out.push({
            codigo,
            distribuidor: codigo,
            n: stats.n,
            cerrados: stats.cerrados,
            clientes: 0,
        });
    }
    out.sort((a, b) => b.n - a.n || String(a.codigo).localeCompare(String(b.codigo)));
    return out.slice(0, maxFilas);
}

/**
 * @param {{
 *   pedidosRows: Array<{ distribuidor?: string; n?: unknown; cerrados?: unknown }>;
 *   getApiToken?: () => string | null | undefined;
 *   apiUrl?: (p: string) => string;
 *   asegurarJwtApiRest?: () => Promise<void>;
 * }} p
 */
export async function resolverFilasChartDistribuidoresRed(p) {
    const catalog = await fetchCatalogoRedElectrica(p);
    const pedidosMap = mapaPedidosPorCodigo(p.pedidosRows);
    if (catalog.length) {
        return filasChartDistribuidoresRedElectrica(catalog, pedidosMap);
    }
    return (p.pedidosRows || []).map((r) => ({
        distribuidor: String(r.distribuidor || ''),
        n: parseInt(r.n, 10) || 0,
        cerrados: parseInt(r.cerrados, 10) || 0,
    }));
}

/** Ajusta altura del contenedor según cantidad de filas (barras horizontales). */
export function ajustarContenedorChartDistribuidores(nFilas) {
    const wrap = document.getElementById('chart-distribuidores')?.closest('.chart-container');
    if (!wrap) return;
    const n = Math.max(4, Math.min(nFilas || 8, 45));
    const h = Math.min(56 + n * 26, 960);
    wrap.style.height = `${h}px`;
    wrap.style.minHeight = `${h}px`;
    wrap.style.maxHeight = `${h}px`;
}

/**
 * @param {Function} crearChart
 * @param {Record<string, import('chart.js').Chart>} chartRef
 * @param {Array<{ distribuidor?: string; n?: number; cerrados?: number }>} filas
 * @param {{ horizontal?: boolean }} [opts]
 */
export function crearChartDistribuidoresEstadisticas(crearChart, chartRef, filas, opts = {}) {
    const rows = filas || [];
    const horizontal = opts.horizontal !== false && rows.length > 0;
    if (horizontal) {
        ajustarContenedorChartDistribuidores(rows.length);
        const labels = labelsEjeYDistribuidorRed(rows);
        crearChart(
            'chart-distribuidores',
            'bar',
            labels,
            [
                {
                    label: 'Total',
                    data: rows.map((r) => parseInt(r.n, 10) || 0),
                    backgroundColor: 'rgba(186, 230, 253, 0.82)',
                    borderColor: 'rgba(125, 211, 252, 0.65)',
                    borderWidth: 1,
                },
                {
                    label: 'Cerrados',
                    data: rows.map((r) => parseInt(r.cerrados, 10) || 0),
                    backgroundColor: 'rgba(167, 243, 208, 0.85)',
                    borderColor: 'rgba(110, 231, 183, 0.65)',
                    borderWidth: 1,
                },
            ],
            mergeOpcionesBarraHorizontalEstadisticas({
                plugins: {
                    legend: { display: true, position: 'top' },
                    tooltip: {
                        callbacks: {
                            label: (c) => {
                                const v =
                                    c.parsed && typeof c.parsed === 'object' && 'x' in c.parsed
                                        ? c.parsed.x
                                        : c.raw;
                                const full = rows[c.dataIndex]?.distribuidor || c.label;
                                return ` ${c.dataset.label}: ${v} pedidos · ${full}`;
                            },
                        },
                    },
                },
                scales: {
                    x: { beginAtZero: true, ticks: { stepSize: 1 } },
                },
            })
        );
        const ch = chartRef['chart-distribuidores'];
        if (ch) {
            ch._gnLabelsFull = rows.map((r) => String(r.distribuidor || ''));
            ajustarEjeYBarraHorizontal(ch);
        }
        return;
    }
    crearChart(
        'chart-distribuidores',
        'bar',
        rows.map((r) => r.distribuidor),
        [
            {
                label: 'Total',
                data: rows.map((r) => parseInt(r.n, 10) || 0),
                backgroundColor: 'rgba(186, 230, 253, 0.82)',
                borderColor: 'rgba(125, 211, 252, 0.65)',
                borderWidth: 1,
            },
            {
                label: 'Cerrados',
                data: rows.map((r) => parseInt(r.cerrados, 10) || 0),
                backgroundColor: 'rgba(167, 243, 208, 0.85)',
                borderColor: 'rgba(110, 231, 183, 0.65)',
                borderWidth: 1,
            },
        ],
        opcionesChartDistribuidoresEstadisticas()
    );
}
