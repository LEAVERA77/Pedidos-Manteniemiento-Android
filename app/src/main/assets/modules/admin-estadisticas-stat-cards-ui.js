/**
 * Admin → Estadísticas: tarjetas KPI clicables → listado + detalle de pedido.
 * made by leavera77
 */

/** @type {Record<string, string>} */
const FILTER_BY_LABEL = {
    'Total pedidos': 'est_total',
    Pendientes: 'est_pendientes',
    Asignados: 'est_asignados',
    'En ejecución': 'est_en_ejec',
    Cerrados: 'est_cerrados',
    '🔴 Críticos activos': 'est_criticos_activos',
    '🟠 Altos activos': 'est_altos_activos',
    'Cerrados hoy': 'est_cerrados_hoy',
    Desestimados: 'est_desestimados',
};

/**
 * @param {Array<{ val?: unknown; lbl?: string; cls?: string; filter?: string }>} cardList
 */
export function enrichEstadisticasStatCards(cardList) {
    return (cardList || []).map((c) => {
        const filter = c.filter || FILTER_BY_LABEL[String(c.lbl || '').trim()] || '';
        return { ...c, filter, clickable: !!filter };
    });
}

/**
 * @param {Array<{ val?: unknown; lbl?: string; cls?: string; filter?: string; clickable?: boolean }>} cardList
 */
export function renderEstadisticasStatCardsHtml(cardList) {
    return (cardList || [])
        .map((s) => {
            const cls = String(s.cls || '').trim();
            const val = s.val ?? '—';
            const lbl = s.lbl ?? '';
            if (!s.clickable || !s.filter) {
                return `<div class="stat-card ${cls}"><div class="val">${val}</div><div class="lbl">${lbl}</div></div>`;
            }
            return `<div class="stat-card stat-card-click dash-kpi-click ${cls}" data-est-stat-filter="${s.filter}" tabindex="0" role="button" title="Ver pedidos"><div class="val">${val}</div><div class="lbl">${lbl}</div></div>`;
        })
        .join('');
}

/** @type {Record<string, unknown> | null} */
let _deps = null;

/** @param {Record<string, unknown>} ctx */
export function buildEstadisticasStatCardsDeps(ctx) {
    return {
        sqlSimple: ctx.sqlSimple,
        pedidosFiltroTenantSql: ctx.pedidosFiltroTenantSql,
        resolveCondicionFechaPedidosStats: ctx.resolveCondicionFechaPedidosStats,
        fmtInformeFecha: ctx.fmtInformeFecha,
        logErrorWeb: ctx.logErrorWeb,
        mensajeErrorUsuario: ctx.mensajeErrorUsuario,
        escHtml: (t) =>
            String(t ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;'),
        abrirPedidoDetalle: ctx.abrirPedidoDetalleEstadisticas,
    };
}

function ensureEstadisticasStatCardsUiInit() {
    if (_deps) return;
    try {
        const getDeps =
            typeof window !== 'undefined' && typeof window.__gnDepsAdminPanelDeferred === 'function'
                ? window.__gnDepsAdminPanelDeferred
                : null;
        if (!getDeps) return;
        initEstadisticasStatCardsUi(buildEstadisticasStatCardsDeps(getDeps()));
    } catch (_) {}
}

/** @param {Record<string, unknown>} d */
export function initEstadisticasStatCardsUi(d) {
    _deps = d;
    const host = document.getElementById('stats-cards-detalle-host');
    bindEstadisticasStatDetalleHostClicks(host);
}

function depsEstadisticasStatCards() {
    if (!_deps) throw new Error('Estadísticas KPI: UI no inicializada');
    return _deps;
}

/**
 * @param {HTMLElement | null} gridEl
 */
export function bindEstadisticasStatCardClicks(gridEl) {
    if (!gridEl || gridEl._gnEstStatBound) return;
    gridEl._gnEstStatBound = true;
    gridEl.addEventListener('click', (ev) => {
        const card = ev.target.closest('[data-est-stat-filter]');
        if (!card) return;
        gridEl.querySelectorAll('.stat-card-click.active-ring').forEach((x) => x.classList.remove('active-ring'));
        card.classList.add('active-ring');
        void ejecutarEstadisticasStatFiltroLista(card.dataset.estStatFilter);
    });
    gridEl.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        const card = ev.target.closest('[data-est-stat-filter]');
        if (!card) return;
        ev.preventDefault();
        card.click();
    });
}

/** @param {string} filter */
export async function ejecutarEstadisticasStatFiltroLista(filter) {
    ensureEstadisticasStatCardsUiInit();
    const d = depsEstadisticasStatCards();
    const host = document.getElementById('stats-cards-detalle-host');
    if (!host || !filter) return;
    host.style.display = 'block';
    host.innerHTML =
        '<div class="ll2" style="padding:.45rem 0"><i class="fas fa-circle-notch fa-spin"></i> Cargando pedidos…</div>';
    host.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

    const tsql = await d.pedidosFiltroTenantSql();
    const { condFecha } = await d.resolveCondicionFechaPedidosStats(tsql);
    const base = `FROM pedidos WHERE ${condFecha}${tsql}`;
    const lim = 120;
    let q = '';
    let titulo = '';

    if (filter === 'est_total') {
        titulo = 'Todos los pedidos del período';
        q = `SELECT id, numero_pedido, estado, prioridad, fecha_creacion, descripcion ${base} ORDER BY fecha_creacion DESC LIMIT ${lim}`;
    } else if (filter === 'est_pendientes') {
        titulo = 'Pendientes (período)';
        q = `SELECT id, numero_pedido, estado, prioridad, fecha_creacion, descripcion ${base} AND estado = 'Pendiente' ORDER BY fecha_creacion DESC LIMIT ${lim}`;
    } else if (filter === 'est_asignados') {
        titulo = 'Asignados (período)';
        q = `SELECT id, numero_pedido, estado, prioridad, fecha_creacion, descripcion ${base} AND estado = 'Asignado' ORDER BY fecha_creacion DESC LIMIT ${lim}`;
    } else if (filter === 'est_en_ejec') {
        titulo = 'En ejecución (período)';
        q = `SELECT id, numero_pedido, estado, prioridad, fecha_creacion, descripcion ${base} AND estado = 'En ejecución' ORDER BY fecha_creacion DESC LIMIT ${lim}`;
    } else if (filter === 'est_cerrados') {
        titulo = 'Cerrados (período)';
        q = `SELECT id, numero_pedido, estado, prioridad, fecha_cierre, descripcion ${base} AND estado = 'Cerrado' ORDER BY fecha_cierre DESC NULLS LAST LIMIT ${lim}`;
    } else if (filter === 'est_criticos_activos') {
        titulo = 'Críticos activos (no cerrados)';
        q = `SELECT id, numero_pedido, estado, prioridad, fecha_creacion, descripcion ${base} AND prioridad = 'Crítica' AND estado != 'Cerrado' ORDER BY fecha_creacion DESC LIMIT ${lim}`;
    } else if (filter === 'est_altos_activos') {
        titulo = 'Altos activos (no cerrados)';
        q = `SELECT id, numero_pedido, estado, prioridad, fecha_creacion, descripcion ${base} AND prioridad = 'Alta' AND estado != 'Cerrado' ORDER BY fecha_creacion DESC LIMIT ${lim}`;
    } else if (filter === 'est_cerrados_hoy') {
        titulo = 'Cerrados hoy';
        q = `SELECT id, numero_pedido, estado, prioridad, fecha_cierre, descripcion ${base} AND estado = 'Cerrado' AND fecha_cierre::date = CURRENT_DATE ORDER BY fecha_cierre DESC LIMIT ${lim}`;
    } else if (filter === 'est_desestimados') {
        titulo = 'Desestimados (período)';
        q = `SELECT id, numero_pedido, estado, prioridad, fecha_creacion, descripcion, motivo_desestimacion ${base} AND estado = 'Desestimado' ORDER BY fecha_creacion DESC LIMIT ${lim}`;
    } else {
        host.style.display = 'none';
        host.innerHTML = '';
        return;
    }

    try {
        const r = await d.sqlSimple(q);
        const rows = r.rows || [];
        if (!rows.length) {
            host.innerHTML = `<div class="gn-est-stats-detalle-hd"><strong>${d.escHtml(titulo)}</strong></div><span style="color:var(--tl)">Sin pedidos en esta categoría para el período seleccionado.</span>`;
            return;
        }
        if (rows.length === 1 && typeof d.abrirPedidoDetalle === 'function') {
            host.innerHTML = `<div class="gn-est-stats-detalle-hd"><strong>${d.escHtml(titulo)}</strong> · abriendo detalle…</div>`;
            await d.abrirPedidoDetalle(rows[0].id);
            host.innerHTML = `<div class="gn-est-stats-detalle-hd"><strong>${d.escHtml(titulo)}</strong></div>${renderFilasEstadisticasStat(rows, filter, d)}`;
            return;
        }
        host.innerHTML = `<div class="gn-est-stats-detalle-hd"><strong>${d.escHtml(titulo)}</strong> <span style="color:var(--tm);font-weight:500">(${rows.length}${rows.length >= lim ? '+' : ''}) — tocá un reclamo para ver el detalle</span></div>${renderFilasEstadisticasStat(rows, filter, d)}`;
    } catch (e) {
        d.logErrorWeb?.('estadisticas-stat-filtro', e);
        host.innerHTML = `<span style="color:var(--re)">${d.escHtml(d.mensajeErrorUsuario(e))}</span>`;
    }
}

/**
 * @param {Array<Record<string, unknown>>} rows
 * @param {string} filter
 * @param {object} d
 */
function renderFilasEstadisticasStat(rows, filter, d) {
    const scap = (t) => d.escHtml(String(t ?? ''));
    return rows
        .map((row) => {
            const id = row.id;
            const np = scap(row.numero_pedido);
            const pr = scap(row.prioridad);
            const es = scap(row.estado);
            const de = scap(String(row.descripcion || '').substring(0, 80));
            const fe = row.fecha_cierre
                ? d.fmtInformeFecha(row.fecha_cierre)
                : d.fmtInformeFecha(row.fecha_creacion);
            const motDes =
                filter === 'est_desestimados' && row.motivo_desestimacion
                    ? ` · ${scap(String(row.motivo_desestimacion).substring(0, 48))}`
                    : '';
            return `<div class="gn-est-stats-detalle-row" role="button" tabindex="0" data-pedido-id="${id}"><strong>#${np}</strong> · ${es} · ${pr}${motDes}<br><span class="gn-est-stats-detalle-meta">${scap(fe)} — ${de}</span></div>`;
        })
        .join('');
}

/** @param {HTMLElement | null} [hostEl] */
export function bindEstadisticasStatDetalleHostClicks(hostEl) {
    const host = hostEl || document.getElementById('stats-cards-detalle-host');
    if (!host || host._gnEstDetHostBound) return;
    host._gnEstDetHostBound = true;
    host.addEventListener('click', (ev) => {
        const row = ev.target.closest('[data-pedido-id]');
        if (!row) return;
        const d = depsEstadisticasStatCards();
        if (typeof d.abrirPedidoDetalle !== 'function') return;
        void d.abrirPedidoDetalle(row.dataset.pedidoId);
    });
    host.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        const row = ev.target.closest('[data-pedido-id]');
        if (!row) return;
        ev.preventDefault();
        const d = depsEstadisticasStatCards();
        if (typeof d.abrirPedidoDetalle === 'function') void d.abrirPedidoDetalle(row.dataset.pedidoId);
    });
}

/** @param {Array<{ val?: unknown; lbl?: string; cls?: string }>} cardList */
export function pintarEstadisticasStatCards(cardList) {
    ensureEstadisticasStatCardsUiInit();
    const el = document.getElementById('stats-cards');
    if (!el) return;
    const host = document.getElementById('stats-cards-detalle-host');
    if (host) {
        host.style.display = 'none';
        host.innerHTML = '';
    }
    el.innerHTML = renderEstadisticasStatCardsHtml(enrichEstadisticasStatCards(cardList));
  