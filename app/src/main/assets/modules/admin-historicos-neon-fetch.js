/**
 * Carga reclamos históricos (cerrados / desestimados / derivados) desde Neon
 * solo para el `tenant_id` indicado (requiere columna `pedidos.tenant_id`).
 * made by leavera77
 */

const LIM_HIST_GLOBAL = 15000;

let _tieneTenantPedidosCache = null;

/**
 * @param {number} ms
 */
function waitMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {number} [maxMs]
 */
async function waitGnNormPedidoDesdeApi(maxMs = 12000) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
        if (typeof window !== 'undefined' && typeof window.gnNormPedidoDesdeApi === 'function') {
            return window.gnNormPedidoDesdeApi;
        }
        await waitMs(60);
    }
    throw new Error('Mapa de pedidos no disponible (recargá la página e intentá de nuevo).');
}

/**
 * Históricos ya en memoria (`app.p`) para mostrar al instante mientras Neon responde.
 * @param {number} tenantId
 */
export function historicosResueltosDesdeAppP(tenantId) {
    const tid = Math.floor(Number(tenantId));
    if (!Number.isFinite(tid) || tid <= 0) return [];
    const norm =
        typeof window !== 'undefined' && typeof window.gnNormPedidoDesdeApi === 'function'
            ? window.gnNormPedidoDesdeApi
            : null;
    const list = window.app?.p;
    if (!norm || !Array.isArray(list)) return [];
    const out = [];
    for (const p of list) {
        const es = String(p?.es || '');
        if (
            es !== 'Cerrado' &&
            es !== 'Desestimado' &&
            es !== 'Derivado externo' &&
            !p?.dex
        ) {
            continue;
        }
        const pt = p._histTenantId != null ? Number(p._histTenantId) : tid;
        if (pt !== tid) continue;
        out.push(p);
    }
    return out;
}

/**
 * @param {{ sqlSimple: (q: string) => Promise<{ rows?: unknown[] }> }} d
 */
async function neonPedidosTieneTenantId(d) {
    if (_tieneTenantPedidosCache != null) return _tieneTenantPedidosCache;
    try {
        const r = await d.sqlSimple(
            `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pedidos' AND column_name='tenant_id' LIMIT 1`
        );
        _tieneTenantPedidosCache = !!(r.rows && r.rows.length);
    } catch (_) {
        _tieneTenantPedidosCache = false;
    }
    return _tieneTenantPedidosCache;
}

/**
 * Históricos resueltos solo del tenant actual (nunca cruza otros `tenant_id`).
 * @param {{ sqlSimple: Function }} d
 * @param {number} tenantId
 * @returns {Promise<Record<string, unknown>[]>}
 */
export async function fetchHistoricosResueltosTenant(d, tenantId) {
    const tid = Math.floor(Number(tenantId));
    if (!Number.isFinite(tid) || tid <= 0) return [];

    const hasT = await neonPedidosTieneTenantId(d);
    const norm = await waitGnNormPedidoDesdeApi();
    if (!hasT) {
        console.warn('[admin-historicos-neon-fetch] pedidos sin tenant_id: no se listan históricos');
        return [];
    }
    const sql = `SELECT p.*, COALESCE(c.nombre, '') AS _gn_hist_tenant_nom
       FROM pedidos p
       LEFT JOIN clientes c ON c.id = p.tenant_id
       WHERE p.tenant_id = ${tid}
         AND (
             p.estado IN ('Cerrado', 'Desestimado', 'Derivado externo')
             OR COALESCE(p.derivado_externo, false) = true
           )
       ORDER BY COALESCE(p.fecha_derivacion, p.fecha_cierre, p.fecha_creacion) DESC NULLS LAST
       LIMIT ${LIM_HIST_GLOBAL}`;

    const r = await d.sqlSimple(sql);
    const rows = r.rows || [];
    const out = [];
    for (const raw of rows) {
        try {
            const o = norm(raw);
            o._histTenantNom = String(raw._gn_hist_tenant_nom || '').trim();
            o._histTenantId = raw.tenant_id != null ? Number(raw.tenant_id) : null;
            out.push(o);
        } catch (_) {
            /* fila rara: omitir */
        }
    }
    return out;
}

/** @deprecated Usar fetchHistoricosResueltosTenant; conservado por compat. */
export async function fetchHistoricosResueltosTodosTenants(d) {
    const tid =
        typeof window !== 'undefined' && typeof window._gnTenantId === 'function'
            ? Number(window._gnTenantId())
            : 0;
    return fetchHistoricosResueltosTenant(d, tid);
}

export { LIM_HIST_GLOBAL };
