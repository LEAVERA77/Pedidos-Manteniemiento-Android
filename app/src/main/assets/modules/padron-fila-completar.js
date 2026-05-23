/**
 * Completa fila del padrón desde BD (distribuidor, trafo, barrio) antes de aplicar al formulario #pm.
 * made by leavera77
 */

import { sqlWhereSocioCatalogoCoincideIdentificador } from './gn-socio-catalogo-match-sql.js';

/**
 * @param {{
 *   sqlSimple: Function,
 *   esc: (v: unknown) => string,
 *   tenantIdActual: () => number,
 *   sociosCatalogoTieneTenantId: () => Promise<boolean>,
 *   normalizarRubroEmpresa: () => string|null,
 * }} deps
 * @param {Record<string, unknown>} row
 */
export async function completarFilaPadronDesdeBd(deps, row) {
    if (!row || typeof deps.sqlSimple !== 'function') return row;
    const rubro = deps.normalizarRubroEmpresa?.() || null;
    const ident = String(
        row.nis_medidor || row.medidor || row.nis || row.numero_cliente || row.identificador || ''
    ).trim();
    if (!ident) return row;

    if (rubro === 'municipio' || rubro === 'cooperativa_agua') {
        if (row.barrio != null && String(row.barrio).trim()) return row;
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

    try {
        const hasT = await deps.sociosCatalogoTieneTenantId();
        const wf = hasT ? ` AND tenant_id = ${deps.esc(deps.tenantIdActual())}` : '';
        const idMatch = sqlWhereSocioCatalogoCoincideIdentificador(deps.esc, ident, '');
        const r = await deps.sqlSimple(
            `SELECT nombre, telefono, transformador, distribuidor_codigo, tipo_conexion, fases,
                    calle, numero, localidad, barrio, nis, medidor, nis_medidor
             FROM socios_catalogo
             WHERE COALESCE(activo, TRUE) = TRUE${wf}
               AND ${idMatch}
             LIMIT 1`
        );
        const db = r.rows?.[0];
        if (!db) return row;
        return {
            ...row,
            nombre: row.nombre || db.nombre,
            telefono: row.telefono ?? db.telefono,
            transformador: row.transformador || db.transformador,
            distribuidor_codigo: row.distribuidor_codigo || db.distribuidor_codigo,
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
