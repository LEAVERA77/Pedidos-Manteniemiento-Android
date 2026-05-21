/**
 * Carga del listado admin de socios: sin datos_extra en el SELECT masivo (más rápido en Neon).
 * made by leavera77
 */
import {
    getSociosCatalogoSchema,
    andFragmentSociosCatalogoDesdeSchema,
} from './socios-catalogo-schema-cache.js';

const COLS_LISTADO =
    'id, nis_medidor, nis, medidor, nombre, calle, numero, barrio, telefono, distribuidor_codigo, localidad, provincia, codigo_postal, tipo_tarifa, urbano_rural, transformador, tipo_conexion, fases, latitud, longitud, activo';

/**
 * @param {unknown} val
 */
function parseDatosExtraObj(val) {
    if (val == null || val === '') return null;
    if (typeof val === 'object' && !Array.isArray(val)) return val;
    if (typeof val === 'string') {
        try {
            const p = JSON.parse(val);
            return p && typeof p === 'object' && !Array.isArray(p) ? p : null;
        } catch (_) {}
    }
    return null;
}

/**
 * @param {unknown[]} rows
 * @param {number} [maxKeys]
 */
function extraerClavesDatosExtraMuestra(rows, maxKeys = 28) {
    const mx = Math.max(1, Math.min(40, maxKeys));
    const k = new Set();
    for (const row of rows) {
        const o = parseDatosExtraObj(row.datos_extra);
        if (!o) continue;
        for (const key of Object.keys(o)) {
            const nk = String(key || '').trim();
            if (nk) k.add(nk);
            if (k.size >= mx) break;
        }
        if (k.size >= mx) break;
    }
    return [...k].sort();
}

/**
 * @param {{
 *   sqlSimple: (q: string) => Promise<{ rows?: unknown[] }>,
 *   sqlSimpleSelectAllPages?: (sel: string, ord: string) => Promise<{ rows?: unknown[] }>,
 *   esc: (v: unknown) => string,
 *   tenantIdActual: number | string | (() => number | string),
 *   empresaCfg?: { active_business_type?: string } | null,
 *   onProgress?: (msg: string) => void,
 * }} deps
 */
export async function fetchSociosCatalogoListadoAdmin(deps) {
    const sqlSimple = deps.sqlSimple;
    const schema = await getSociosCatalogoSchema(sqlSimple);
    const andSoc = andFragmentSociosCatalogoDesdeSchema(
        schema,
        deps.esc,
        deps.tenantIdActual,
        deps.empresaCfg
    );
    const colTid = schema.hasTenantId ? ', tenant_id' : '';
    const colBt = schema.hasBusinessType ? ', business_type' : '';

    deps.onProgress?.('Leyendo socios del tenant…');

    const baseSql = `SELECT ${COLS_LISTADO}${colTid}${colBt} FROM socios_catalogo WHERE 1=1${andSoc}`;
    const orderSql = 'ORDER BY nis_medidor';
    let r;
    if (typeof deps.sqlSimpleSelectAllPages === 'function') {
        r = await deps.sqlSimpleSelectAllPages(baseSql, orderSql);
    } else {
        r = await sqlSimple(`${baseSql} ${orderSql}`);
    }
    const rows = r.rows || [];

    let extraKeys = [];
    if (schema.hasDatosExtra && rows.length > 0) {
        deps.onProgress?.('Detectando columnas extra…');
        try {
            const sample = await sqlSimple(
                `SELECT datos_extra FROM socios_catalogo WHERE 1=1${andSoc} AND datos_extra IS NOT NULL AND datos_extra::text NOT IN ('{}','null') LIMIT 80`
            );
            extraKeys = extraerClavesDatosExtraMuestra(sample.rows || []);
        } catch (_) {
            extraKeys = [];
        }
    }

    return {
        rows,
        extraKeys,
        schema,
        hasDatosExtra: schema.hasDatosExtra,
    };
}
