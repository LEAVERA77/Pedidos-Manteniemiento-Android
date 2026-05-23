/**
 * Completa fila del padrón desde BD (trafo, distribuidor, barrio/ramal) antes de aplicar al formulario #pm.
 * made by leavera77
 */

import { sqlWhereSocioCatalogoCoincideIdentificador } from './gn-socio-catalogo-match-sql.js';
import { rubroPadronActivo } from './padron-rubro-helpers.js';

const COLS_SOCIO = `id, nombre, telefono, transformador, distribuidor_codigo, tipo_conexion, fases,
        calle, numero, localidad, barrio, nis, medidor, nis_medidor`;

/** @param {string} v */
function txt(v) {
    return v != null ? String(v).trim() : '';
}

/**
 * Campos del catálogo con prioridad a valores no vacíos de `db`.
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>|null|undefined} db
 */
function fusionarFilaPadron(row, db) {
    if (!db) return row;
    const pick = (key) => {
        const d = txt(db[key]);
        if (d) return d;
        const r = row[key];
        return r != null && String(r).trim() ? String(r).trim() : r;
    };
    return {
        ...row,
        id: Number(db.id) > 0 ? Number(db.id) : row.id,
        nombre: row.nombre || db.nombre,
        telefono: pick('telefono'),
        transformador: pick('transformador'),
        distribuidor_codigo: pick('distribuidor_codigo'),
        tipo_conexion: pick('tipo_conexion'),
        fases: pick('fases'),
        calle: pick('calle'),
        numero: pick('numero'),
        localidad: pick('localidad'),
        barrio: pick('barrio'),
        nis: pick('nis'),
        medidor: pick('medidor'),
        nis_medidor:
            txt(db.nis_medidor) ||
            txt(row.nis_medidor) ||
            txt(db.medidor) ||
            txt(db.nis) ||
            txt(row.medidor) ||
            txt(row.nis),
    };
}

/**
 * @param {{
 *   sqlSimple: Function,
 *   esc: (v: unknown) => string,
 *   tenantIdActual: () => number,
 *   sociosCatalogoTieneTenantId: () => Promise<boolean>,
 * }} deps
 * @param {number} socioId
 */
async function fetchSocioCatalogoPorId(deps, socioId) {
    const sid = Number(socioId);
    if (!Number.isFinite(sid) || sid <= 0) return null;
    const hasT = await deps.sociosCatalogoTieneTenantId();
    const wf = hasT ? ` AND tenant_id = ${deps.esc(deps.tenantIdActual())}` : '';
    const r = await deps.sqlSimple(
        `SELECT ${COLS_SOCIO}
         FROM socios_catalogo
         WHERE COALESCE(activo, TRUE) = TRUE AND id = ${deps.esc(sid)}${wf}
         LIMIT 1`
    );
    return r.rows?.[0] || null;
}

/**
 * @param {{
 *   sqlSimple: Function,
 *   esc: (v: unknown) => string,
 *   tenantIdActual: () => number,
 *   sociosCatalogoTieneTenantId: () => Promise<boolean>,
 * }} deps
 * @param {string} ident
 */
async function fetchSocioCatalogoPorIdentificador(deps, ident) {
    const q = txt(ident);
    if (!q) return null;
    const hasT = await deps.sociosCatalogoTieneTenantId();
    const wf = hasT ? ` AND tenant_id = ${deps.esc(deps.tenantIdActual())}` : '';
    const idMatch = sqlWhereSocioCatalogoCoincideIdentificador(deps.esc, q, '');
    const r = await deps.sqlSimple(
        `SELECT ${COLS_SOCIO}
         FROM socios_catalogo
         WHERE COALESCE(activo, TRUE) = TRUE${wf}
           AND ${idMatch}
         ORDER BY id ASC
         LIMIT 1`
    );
    return r.rows?.[0] || null;
}

/**
 * @param {{
 *   sqlSimple: Function,
 *   esc: (v: unknown) => string,
 *   tenantIdActual: () => number,
 * }} deps
 * @param {string} ident
 */
async function fetchClienteFinalPorIdentificador(deps, ident) {
    const q = txt(ident);
    const tid = deps.tenantIdActual();
    if (!q || !Number.isFinite(tid)) return null;
    const r = await deps.sqlSimple(
        `SELECT id, nombre, apellido, calle, numero_puerta, barrio, localidad, nis, medidor, numero_cliente, telefono
         FROM clientes_finales
         WHERE COALESCE(activo, TRUE) = TRUE AND cliente_id = ${deps.esc(tid)}
           AND (
             UPPER(TRIM(COALESCE(nis,''))) = UPPER(TRIM(${deps.esc(q)}))
             OR UPPER(TRIM(COALESCE(medidor,''))) = UPPER(TRIM(${deps.esc(q)}))
             OR UPPER(TRIM(COALESCE(numero_cliente,''))) = UPPER(TRIM(${deps.esc(q)}))
           )
         LIMIT 1`
    );
    const db = r.rows?.[0];
    if (!db) return null;
    const nom = [db.nombre, db.apellido]
        .map((x) => (x != null ? String(x).trim() : ''))
        .filter(Boolean)
        .join(' ');
    return {
        id: db.id,
        nombre: nom || 'Vecino',
        calle: db.calle,
        numero: db.numero_puerta,
        barrio: db.barrio,
        localidad: db.localidad,
        nis: db.nis,
        medidor: db.medidor,
        nis_medidor: db.medidor || db.nis || db.numero_cliente,
        numero_cliente: db.numero_cliente,
        telefono: db.telefono,
    };
}

/**
 * @param {{
 *   sqlSimple: Function,
 *   esc: (v: unknown) => string,
 *   tenantIdActual: () => number,
 *   sociosCatalogoTieneTenantId: () => Promise<boolean>,
 * }} deps
 * @param {Record<string, unknown>} row
 */
async function enriquecerDesdeCatalogoSql(deps, row) {
    let out = { ...row };
    try {
        if (Number(row.id) > 0) {
            const byId = await fetchSocioCatalogoPorId(deps, row.id);
            out = fusionarFilaPadron(out, byId);
        }
        const ident = txt(
            out.nis_medidor || out.medidor || out.nis || out.numero_cliente || out.identificador
        );
        if (ident) {
            const byIdent = await fetchSocioCatalogoPorIdentificador(deps, ident);
            out = fusionarFilaPadron(out, byIdent);
            const cf = await fetchClienteFinalPorIdentificador(deps, ident);
            if (cf) {
                out = fusionarFilaPadron(out, {
                    ...cf,
                    transformador: out.transformador,
                    distribuidor_codigo: out.distribuidor_codigo || cf.distribuidor_codigo,
                    tipo_conexion: out.tipo_conexion || cf.tipo_conexion,
                    fases: out.fases || cf.fases,
                });
            }
        }
    } catch (e) {
        console.warn('[padron-fila-completar]', e?.message || e);
    }
    return out;
}

/**
 * Enriquece una fila (p. ej. match de API) con datos completos de Neon cuando hay conexión SQL.
 * @param {Parameters<typeof enriquecerDesdeCatalogoSql>[0]} deps
 * @param {Record<string, unknown>} row
 */
export async function enriquecerFilaPadronDesdeBd(deps, row) {
    if (!row || typeof deps.sqlSimple !== 'function') return row;
    return enriquecerDesdeCatalogoSql(deps, row);
}

/**
 * @param {Parameters<typeof enriquecerDesdeCatalogoSql>[0]} deps
 * @param {Record<string, unknown>} row
 */
export async function completarFilaPadronDesdeBd(deps, row) {
    if (!row || typeof deps.sqlSimple !== 'function') return row;
    void rubroPadronActivo(deps);
    return enriquecerDesdeCatalogoSql(deps, row);
}
