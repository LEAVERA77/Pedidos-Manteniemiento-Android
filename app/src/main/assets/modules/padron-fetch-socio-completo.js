/**
 * Carga fila completa del catálogo de socios (mismas columnas que el admin) para pedido nuevo.
 * made by leavera77
 */

import { sqlWhereSocioExactoIdentificador } from './gn-socio-catalogo-match-sql.js';
import { normalizarFilaPadronSocio } from './padron-socio-campos-resolver.js';

const COLS_SOCIO_BASE = `id, nis_medidor, nis, medidor, nombre, calle, numero, barrio, telefono,
        distribuidor_codigo, localidad, provincia, codigo_postal, tipo_tarifa, urbano_rural,
        transformador, tipo_conexion, fases, latitud, longitud, activo`;

/** @param {string} v */
function txt(v) {
    return v != null ? String(v).trim() : '';
}

/**
 * @param {{
 *   sqlSimple: (q: string) => Promise<{ rows?: unknown[] }>,
 * }} deps
 * @param {string} sql
 */
async function sqlSelectSocio(deps, sql) {
    try {
        return await deps.sqlSimple(sql);
    } catch (e1) {
        const msg = String(e1?.message || e1 || '');
        if (!/datos_extra/i.test(msg)) throw e1;
        return await deps.sqlSimple(sql.replace(/,?\s*datos_extra/, ''));
    }
}

/**
 * @param {{
 *   sqlSimple: Function,
 *   esc: (v: unknown) => string,
 *   tenantIdActual: () => number,
 *   sociosCatalogoTieneTenantId: () => Promise<boolean>,
 * }} deps
 * @param {string} whereExtra
 * @param {string} orderBy
 */
async function fetchSocioCatalogoSql(deps, whereExtra, orderBy = 'ORDER BY id ASC LIMIT 1') {
    const hasT = await deps.sociosCatalogoTieneTenantId();
    const wf = hasT ? ` AND tenant_id = ${deps.esc(deps.tenantIdActual())}` : '';
    const sql = `SELECT ${COLS_SOCIO_BASE}, datos_extra
         FROM socios_catalogo
         WHERE COALESCE(activo, TRUE) = TRUE${wf}${whereExtra}
         ${orderBy}`;
    const r = await sqlSelectSocio(deps, sql);
    const row = r.rows?.[0];
    return row ? normalizarFilaPadronSocio(row) : null;
}

/**
 * @param {Record<string, unknown>|null|undefined} a
 * @param {Record<string, unknown>|null|undefined} b
 */
function fusionarFilasPadron(a, b) {
    if (!a) return b || {};
    if (!b) return a || {};
    const pick = (key) => txt(b[key]) || txt(a[key]) || '';
    return normalizarFilaPadronSocio({
        ...a,
        ...b,
        id: Number(b.id) > 0 ? Number(b.id) : a.id,
        nombre: txt(b.nombre) || txt(a.nombre),
        nis: pick('nis'),
        medidor: pick('medidor'),
        nis_medidor: pick('nis_medidor') || pick('medidor') || pick('nis'),
        telefono: pick('telefono'),
        transformador: pick('transformador'),
        distribuidor_codigo: pick('distribuidor_codigo'),
        tipo_conexion: pick('tipo_conexion'),
        fases: pick('fases'),
        calle: pick('calle'),
        numero: pick('numero'),
        localidad: pick('localidad'),
        barrio: pick('barrio'),
        provincia: pick('provincia'),
        codigo_postal: pick('codigo_postal'),
        tipo_tarifa: pick('tipo_tarifa'),
        urbano_rural: pick('urbano_rural'),
        datos_extra: b.datos_extra != null ? b.datos_extra : a.datos_extra,
    });
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
export async function cargarFilaPadronCompletaDesdeBd(deps, row) {
    if (!row || typeof deps.sqlSimple !== 'function') return normalizarFilaPadronSocio(row);

    let full = normalizarFilaPadronSocio(row);
    try {
        const sid = Number(row.id);
        if (Number.isFinite(sid) && sid > 0) {
            const byId = await fetchSocioCatalogoSql(deps, ` AND id = ${deps.esc(sid)}`);
            full = fusionarFilasPadron(full, byId);
        }

        const ident = txt(row.nis || row.medidor || row.nis_medidor || row.identificador || row.numero_cliente);
        if (ident) {
            const idMatch = sqlWhereSocioExactoIdentificador(deps.esc, ident, '');
            const byIdent = await fetchSocioCatalogoSql(
                deps,
                ` AND ${idMatch}`,
                `ORDER BY
                  CASE
                    WHEN UPPER(TRIM(COALESCE(nis,''))) = UPPER(TRIM(${deps.esc(ident)})) THEN 0
                    WHEN UPPER(TRIM(COALESCE(medidor,''))) = UPPER(TRIM(${deps.esc(ident)})) THEN 1
                    WHEN UPPER(TRIM(COALESCE(nis_medidor,''))) = UPPER(TRIM(${deps.esc(ident)})) THEN 2
                    ELSE 3
                  END,
                  id ASC
                 LIMIT 1`
            );
            full = fusionarFilasPadron(full, byIdent);
        }

        const tid = deps.tenantIdActual();
        if (ident && Number.isFinite(tid)) {
            const rCf = await deps.sqlSimple(
                `SELECT id, nombre, apellido, calle, numero_puerta, barrio, localidad, nis, medidor, numero_cliente, telefono
                 FROM clientes_finales
                 WHERE COALESCE(activo, TRUE) = TRUE AND cliente_id = ${deps.esc(tid)}
                   AND (
                     UPPER(TRIM(COALESCE(nis,''))) = UPPER(TRIM(${deps.esc(ident)}))
                     OR UPPER(TRIM(COALESCE(medidor,''))) = UPPER(TRIM(${deps.esc(ident)}))
                     OR UPPER(TRIM(COALESCE(numero_cliente,''))) = UPPER(TRIM(${deps.esc(ident)}))
                   )
                 LIMIT 1`
            );
            const cf = rCf.rows?.[0];
            if (cf) {
                const nom = [cf.nombre, cf.apellido]
                    .map((x) => (x != null ? String(x).trim() : ''))
                    .filter(Boolean)
                    .join(' ');
                full = fusionarFilasPadron(full, {
                    id: cf.id,
                    nombre: nom || full.nombre,
                    calle: cf.calle,
                    numero: cf.numero_puerta,
                    barrio: cf.barrio,
                    localidad: cf.localidad,
                    nis: cf.nis,
                    medidor: cf.medidor,
                    nis_medidor: cf.medidor || cf.nis || cf.numero_cliente,
                    telefono: cf.telefono,
                });
            }
        }
    } catch (e) {
        console.warn('[padron-fetch-socio-completo]', e?.message || e);
    }
    return full;
}
