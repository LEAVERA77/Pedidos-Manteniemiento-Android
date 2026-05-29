/**
 * Pobla #trafo-pedido con transformadores distintos del catálogo de socios (datalist).
 * made by leavera77
 */

import {
    getSociosCatalogoSchema,
    andFragmentSociosCatalogoDesdeSchema,
} from './socios-catalogo-schema-cache.js';

const DATALIST_ID = 'ped-trafo-socios-datalist';

/**
 * @param {{
 *   sqlSimple: (q: string) => Promise<{ rows?: { valor?: string }[] }>;
 *   sqlSimpleSelectAllPages?: (q: string, order?: string) => Promise<{ rows?: { valor?: string }[] }>;
 *   esc?: (v: unknown) => string;
 *   tenantIdActual?: () => number;
 * }} deps
 * @returns {Promise<string[]>}
 */
export async function fetchTrafosDistintosSociosCatalogo(deps) {
    try {
        const schema = await getSociosCatalogoSchema(deps.sqlSimple);
        const andSoc = andFragmentSociosCatalogoDesdeSchema(
            schema,
            deps.esc,
            deps.tenantIdActual,
            typeof window !== 'undefined' ? window.EMPRESA_CFG : {}
        );
        const q = `SELECT DISTINCT TRIM(transformador) AS valor FROM socios_catalogo WHERE 1=1${andSoc} AND TRIM(COALESCE(transformador::text, '')) <> ''`;
        const r = deps.sqlSimpleSelectAllPages
            ? await deps.sqlSimpleSelectAllPages(q, 'ORDER BY valor')
            : await deps.sqlSimple(`${q} ORDER BY valor LIMIT 2500`);
        const seen = new Set();
        const out = [];
        for (const row of r.rows || []) {
            const v = String(row.valor || '').trim();
            if (!v) continue;
            const k = v.toUpperCase();
            if (seen.has(k)) continue;
            seen.add(k);
            out.push(v);
        }
        out.sort((a, b) => a.localeCompare(b, 'es'));
        return out;
    } catch (e) {
        console.warn('[pedido-trafo-socios]', e?.message || e);
        return [];
    }
}

/**
 * @param {string[]} valores
 */
export function renderTrafoPedidoDatalistSocios(valores) {
    const inp = document.getElementById('trafo-pedido');
    if (!inp) return;
    let dl = document.getElementById(DATALIST_ID);
    if (!dl) {
        dl = document.createElement('datalist');
        dl.id = DATALIST_ID;
        inp.closest('.fg')?.appendChild(dl) || inp.parentElement?.appendChild(dl);
    }
    dl.innerHTML = '';
    for (const v of valores) {
        const o = document.createElement('option');
        o.value = v;
        dl.appendChild(o);
    }
    if (valores.length) inp.setAttribute('list', DATALIST_ID);
    else inp.removeAttribute('list');
}

/**
 * @param {{
 *   esCooperativaElectricaRubro: () => boolean;
 *   sqlSimple: (q: string) => Promise<{ rows?: unknown[] }>;
 *   sqlSimpleSelectAllPages?: (q: string, order?: string) => Promise<{ rows?: Record<string, unknown>[] }>;
 *   esc?: (v: unknown) => string;
 *   tenantIdActual?: () => number;
 * }} deps
 */
export async function cargarTrafoPedidoDesdeSociosCatalogo(deps) {
    if (!deps.esCooperativaElectricaRubro()) {
        renderTrafoPedidoDatalistSocios([]);
        return [];
    }
    const valores = await fetchTrafosDistintosSociosCatalogo(deps);
    renderTrafoPedidoDatalistSocios(valores);
    return valores;
}
