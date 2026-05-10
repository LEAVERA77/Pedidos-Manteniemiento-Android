/**
 * Carga reclamos históricos (cerrados / desestimados / derivados) desde Neon
 * para todos los tenants con `pedidos.tenant_id`. Sin tocar app.js salvo deps.
 * made by leavera77
 */

const LIM_HIST_GLOBAL = 15000;

let _tieneTenantPedidosCache = null;

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
 * @param {{ sqlSimple: Function }} d
 * @returns {Promise<Record<string, unknown>[]>}
 */
export async function fetchHistoricosResueltosTodosTenants(d) {
    const hasT = await neonPedidosTieneTenantId(d);
    const norm = typeof window !== 'undefined' && typeof window.gnNormPedidoDesdeApi === 'function' ? window.gnNormPedidoDesdeApi : null;
    if (!norm) throw new Error('Mapa de pedidos no disponible (gnNormPedidoDesdeApi)');

    const sql = hasT
        ? `SELECT p.*, COALESCE(c.nombre, '') AS _gn_hist_tenant_nom
           FROM pedidos p
           LEFT JOIN clientes c ON c.id = p.tenant_id
           WHERE (
               p.estado IN ('Cerrado', 'Desestimado', 'Derivado externo')
               OR COALESCE(p.derivado_externo, false) = true
             )
           ORDER BY COALESCE(p.fecha_derivacion, p.fecha_cierre, p.fecha_creacion) DESC NULLS LAST
           LIMIT ${LIM_HIST_GLOBAL}`
        : `SELECT p.*, ''::text AS _gn_hist_tenant_nom
           FROM pedidos p
           WHERE (
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

export { LIM_HIST_GLOBAL };
