/**
 * Completa fila del padrón desde BD (distribuidor, trafo, barrio) antes de aplicar al formulario #pm.
 * made by leavera77
 */

import { sqlWhereSocioCatalogoCoincideIdentificador } from './gn-socio-catalogo-match-sql.js';
import { rubroPadronActivo } from './padron-rubro-helpers.js';

const COLS_SOCIO = `nombre, telefono, transformador, distribuidor_codigo, tipo_conexion, fases,
        calle, numero, localidad, barrio, nis, medidor, nis_medidor`;

/**
 * @param {{
 *   sqlSimple: Function,
 *   esc: (v: unknown) => string,
 *   tenantIdActual: () => number,
 *   sociosCatalogoTieneTenantId: () => Promise<boolean>,
 *   normalizarRubroEmpresa?: (tipo?: unknown) => string|null,
 *   esCooperativaElectricaRubro?: () => boolean,
 *   esMunicipioRubro?: () => boolean,
 *   esCooperativaAguaRubro?: () => boolean,
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
 *   normalizarRubroEmpresa?: (tipo?: unknown) => string|null,
 *   esCooperativaElectricaRubro?: () => boolean,
 *   esMunicipioRubro?: () => boolean,
 *   esCooperativaAguaRubro?: () => boolean,
 * }} deps
 * @param {Record<string, unknown>} row
 */
export async function completarFilaPadronDesdeBd(deps, row) {
    if (!row || typeof deps.sqlSimple !== 'function') return row;
    const rubro = rubroPadronActivo(deps);

    if (Number(row.id) > 0 && rubro === 'cooperativa_electrica') {
        try {
            const dbId = await fetchSocioCatalogoPorId(deps, row.id);
            if (dbId) row = { ...row, ...dbId };
        } catch (_) {}
    }

    const ident = String(
        row.nis_medidor || row.medidor || row.nis || row.numero_cliente || row.identificador || ''
    ).trim();

    if (rubro === 'municipio' || rubro === 'cooperativa_agua') {
        if (row.barrio != null && String(row.barrio).trim()) return row;
        if (!ident) return row;
        const tid = deps.tenantIdActual();
        try {
            const r = await deps.sqlSimple(
                `SELECT nombre, apellido, calle, numero_puerta, barrio, localidad, nis, medidor, numero_cliente, telefono
                 FROM clientes_finales
                 WHERE COALESCE(activo, TRUE) = TRUE AND cliente_id = ${deps.esc(tid)}
                   AND (
                     UPPER(TRIM(COALESCE(nis,''))) = UPPER(TRIM(${deps.esc(ident)}))
                     OR UPPER(TRIM(COALESCE(medidor,''))) = UPPER(TRIM(${deps.esc(ident)}))
                     OR UPPER(TRIM(COALESCE(numero_cliente,''))) = UPPER(TRIM(${deps.esc(ident)}))
                   )
                 LIMIT 1`
            );
            const db = r.rows?.[0];
            if (!db) return row;
            const nom = [db.nombre, db.apellido]
                .map((x) => (x != null ? String(x).trim() : ''))
                .filter(Boolean)
                .join(' ');
            return {
                ...row,
                nombre: row.nombre || nom,
                calle: row.calle ?? db.calle,
                numero: row.numero ?? db.numero_puerta,
                barrio: row.barrio ?? db.barrio,
                localidad: row.localidad ?? db.localidad,
                nis: row.nis ?? db.nis,
                medidor: row.medidor ?? db.medidor,
                nis_medidor: row.nis_medidor || db.medidor || db.nis || db.numero_cliente,
                numero_cliente: row.numero_cliente ?? db.numero_cliente,
                telefono: row.telefono ?? db.telefono,
            };
        } catch (_) {
            return row;
        }
    }

    if (rubro !== 'cooperativa_electrica') return row;
    if (!ident && !(Number(row.id) > 0)) return row;

    try {
        let db = null;
        if (Number(row.id) > 0) {
            db = await fetchSocioCatalogoPorId(deps, row.id);
        }
        if (!db && ident) {
            const hasT = await deps.sociosCatalogoTieneTenantId();
            const wf = hasT ? ` AND tenant_id = ${deps.esc(deps.tenantIdActual())}` : '';
            const idMatch = sqlWhereSocioCatalogoCoincideIdentificador(deps.esc, ident, '');
            const r = await deps.sqlSimple(
                `SELECT ${COLS_SOCIO}
                 FROM socios_catalogo
                 WHERE COALESCE(activo, TRUE) = TRUE${wf}
                   AND ${idMatch}
                 LIMIT 1`
            );
            db = r.rows?.[0] || null;
        }
        if (!db) return row;
        return {
            ...row,
            nombre: row.nombre || db.nombre,
            telefono: row.telefono ?? db.telefono,
            transformador: db.transformador != null ? String(db.transformador).trim() : row.transformador,
            distribuidor_codigo:
                db.distribuidor_codigo != null ? String(db.distribuidor_codigo).trim() : row.distribuidor_codigo,
            tipo_conexion: row.tipo_conexion ?? db.tipo_conexion,
            fases: row.fases ?? db.fases,
            calle: row.calle ?? db.calle,
            numero: row.numero ?? db.numero,
            localidad: row.localidad ?? db.localidad,
            barrio: row.barrio ?? db.barrio,
            nis: row.nis ?? db.nis,
            medidor: row.medidor ?? db.medidor,
            nis_medidor: row.nis_medidor || db.nis_medidor || db.medidor || db.nis,
        };
    } catch (_) {
        return row;
    }
}
