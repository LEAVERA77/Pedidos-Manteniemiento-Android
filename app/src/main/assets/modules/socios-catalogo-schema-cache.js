/**
 * Una sola consulta a information_schema para columnas de socios_catalogo (sesión).
 * made by leavera77
 */

/** @type {{ hasTenantId: boolean, hasBusinessType: boolean, hasDatosExtra: boolean } | null} */
let _schema = null;

export function resetSociosCatalogoSchemaCache() {
    _schema = null;
}

/**
 * @param {(q: string) => Promise<{ rows?: { column_name?: string }[] }>} sqlSimple
 */
export async function getSociosCatalogoSchema(sqlSimple) {
    if (_schema) return _schema;
    const r = await sqlSimple(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'socios_catalogo' AND column_name IN ('tenant_id','business_type','datos_extra')`
    );
    const set = new Set((r.rows || []).map((x) => String(x.column_name || '')));
    _schema = {
        hasTenantId: set.has('tenant_id'),
        hasBusinessType: set.has('business_type'),
        hasDatosExtra: set.has('datos_extra'),
    };
    return _schema;
}

/**
 * @param {{ hasTenantId: boolean, hasBusinessType: boolean }} schema
 * @param {(v: unknown) => string} esc
 * @param {number | string | (() => number | string)} tenantIdActual
 * @param {{ active_business_type?: string } | null | undefined} empresaCfg
 */
export function andFragmentSociosCatalogoDesdeSchema(schema, esc, tenantIdActual, empresaCfg) {
    const tidRaw = typeof tenantIdActual === 'function' ? tenantIdActual() : tenantIdActual;
    const parts = [];
    if (schema.hasTenantId) {
        parts.push(`tenant_id = ${esc(tidRaw)}`);
    }
    if (schema.hasBusinessType) {
        const bt = String(empresaCfg?.active_business_type || '')
            .trim()
            .toLowerCase();
        if (bt === 'electricidad' || bt === 'agua' || bt === 'municipio') {
            parts.push(
                `(business_type = ${esc(bt)} OR business_type IS NULL OR TRIM(COALESCE(business_type::text, '')) = '')`
            );
        }
    }
    return parts.length ? ` AND ${parts.join(' AND ')}` : '';
}
