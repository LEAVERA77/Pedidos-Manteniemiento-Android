/**
 * Filtro de lectura para `socios_catalogo`: mismo criterio que el listado admin (tenant de sesión
 * + línea de negocio activa cuando la tabla tiene `business_type`), paridad con `pedidosFiltroTenantSql`.
 * made by leavera77
 */

/**
 * @param {{
 *   sqlSimple: (q: string) => Promise<{ rows?: { column_name?: string }[] }>;
 *   esc: (v: unknown) => string;
 *   tenantIdActual: number | string | (() => number | string);
 *   empresaCfg?: { active_business_type?: string } | null;
 * }} deps
 * @returns {Promise<string>} fragmento con espacio inicial, p. ej. ` AND tenant_id = 1`, o cadena vacía
 */
export async function andFragmentSociosCatalogoSesionNeon(deps) {
    const tidRaw =
        typeof deps.tenantIdActual === 'function' ? deps.tenantIdActual() : deps.tenantIdActual;
    const r = await deps.sqlSimple(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'socios_catalogo' AND column_name IN ('tenant_id','business_type')`
    );
    const set = new Set((r.rows || []).map((x) => String(x.column_name || '')));
    const parts = [];
    if (set.has('tenant_id')) {
        parts.push(`tenant_id = ${deps.esc(tidRaw)}`);
    }
    if (set.has('business_type')) {
        const bt = String(deps.empresaCfg?.active_business_type || '')
            .trim()
            .toLowerCase();
        if (bt === 'electricidad' || bt === 'agua' || bt === 'municipio') {
            parts.push(
                `(business_type = ${deps.esc(bt)} OR business_type IS NULL OR TRIM(COALESCE(business_type::text, '')) = '')`
            );
        }
    }
    return parts.length ? ` AND ${parts.join(' AND ')}` : '';
}
