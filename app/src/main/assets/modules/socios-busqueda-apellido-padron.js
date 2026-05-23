/**
 * Búsqueda fuzzy por apellido en padrón: socios_catalogo (todos los rubros) + clientes_finales (municipio/agua).
 * made by leavera77
 */

import { nombreCoincideFuzzy } from './gn-fuzzy-texto-levenshtein.js';

/** @typedef {'socios_catalogo'|'clientes_finales'} PadronSource */

/**
 * @param {{ sqlSimple: Function, tenantIdActual: () => number|string, esc: (v: unknown) => string }} deps
 * @param {string} alias
 */
async function sociosWhereTenantSql(deps, alias = 's') {
    try {
        const chk = await deps.sqlSimple(
            `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='socios_catalogo' AND column_name='tenant_id' LIMIT 1`
        );
        if (chk.rows && chk.rows.length) {
            return ` AND ${alias}.tenant_id = ${deps.esc(deps.tenantIdActual())}`;
        }
    } catch (_) {}
    return '';
}

/**
 * @param {{
 *   sqlSimple: Function,
 *   tenantIdActual: () => number|string,
 *   esc: (v: unknown) => string,
 *   normalizarRubroEmpresa?: () => string|null,
 * }} deps
 * @param {string} raw apellido o fragmento de nombre
 * @returns {Promise<Array<Record<string, unknown> & { padronSource: PadronSource }>>}
 */
export async function buscarPersonasPadronPorApellidoFuzzy(deps, raw) {
    const needle = String(raw || '').trim();
    if (!needle) return [];

    const rubro = typeof deps.normalizarRubroEmpresa === 'function' ? deps.normalizarRubroEmpresa() : null;
    const tid = Number(deps.tenantIdActual());
    const out = [];
    const seen = new Set();

    const push = (row) => {
        const key = `${row.padronSource}:${row.id}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push(row);
    };

    const wSoc = await sociosWhereTenantSql(deps, 's');
    const LIM = 3200;
    try {
        const r = await deps.sqlSimple(
            `SELECT s.id, s.nis_medidor, s.nis, s.medidor, s.nombre, s.calle, s.numero, s.barrio, s.telefono, s.localidad, s.provincia
             FROM socios_catalogo s
             WHERE COALESCE(s.activo, TRUE) = TRUE
             ${wSoc}
             ORDER BY s.nombre NULLS LAST
             LIMIT ${LIM}`
        );
        for (const row of r.rows || []) {
            if (!nombreCoincideFuzzy(needle, row.nombre)) continue;
            push({ ...row, padronSource: 'socios_catalogo' });
            if (out.length >= 80) break;
        }
    } catch (_) {}

    if (out.length < 80 && (rubro === 'municipio' || rubro === 'cooperativa_agua') && Number.isFinite(tid) && tid > 0) {
        try {
            const rCf = await deps.sqlSimple(
                `SELECT id, nombre, apellido, nis, medidor, numero_cliente, calle, numero_puerta, localidad, barrio, telefono
                 FROM clientes_finales
                 WHERE COALESCE(activo, TRUE) = TRUE AND cliente_id = ${deps.esc(tid)}
                 ORDER BY apellido NULLS LAST, nombre NULLS LAST
                 LIMIT ${LIM}`
            );
            for (const row of rCf.rows || []) {
                const nom = [row.nombre, row.apellido]
                    .map((x) => (x != null ? String(x).trim() : ''))
                    .filter(Boolean)
                    .join(' ');
                if (!nombreCoincideFuzzy(needle, nom)) continue;
                push({
                    id: row.id,
                    nombre: nom,
                    nis_medidor: row.medidor || row.nis || row.numero_cliente,
                    nis: row.nis,
                    medidor: row.medidor,
                    numero_cliente: row.numero_cliente,
                    calle: row.calle,
                    numero: row.numero_puerta,
                    barrio: row.barrio,
                    telefono: row.telefono,
                    localidad: row.localidad,
                    provincia: null,
                    padronSource: 'clientes_finales',
                });
                if (out.length >= 80) break;
            }
        } catch (_) {}
    }

    return out;
}
