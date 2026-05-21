/**
 * Filtro de lectura para `socios_catalogo`: mismo criterio que el listado admin (tenant de sesión
 * + línea de negocio activa cuando la tabla tiene `business_type`), paridad con `pedidosFiltroTenantSql`.
 * made by leavera77
 */
import {
    getSociosCatalogoSchema,
    andFragmentSociosCatalogoDesdeSchema,
} from './socios-catalogo-schema-cache.js';

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
    const schema = await getSociosCatalogoSchema(deps.sqlSimple);
    return andFragmentSociosCatalogoDesdeSchema(
        schema,
        deps.esc,
        deps.tenantIdActual,
        deps.empresaCfg
    );
}
