/**
 * Resuelve distribuidor del catálogo de socios (ej. "D123 - Red Perdices") al código del &lt;select id="di2"&gt; (DIS01C…).
 * made by leavera77
 */

import { asegurarOpcionDi2, seleccionarDistribuidorPorCodigo } from './pedido-nuevo-aplicar-padron.js';

/** @param {string} s */
function norm(s) {
    return String(s || '')
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/** @param {string} catalogo */
function partesDistribuidorCatalogo(catalogo) {
    const raw = String(catalogo || '').trim();
    if (!raw) return { raw: '', codePart: '', namePart: '' };
    const split = raw.split(/\s*[-–—]\s*/);
    return {
        raw,
        codePart: (split[0] || '').trim(),
        namePart: split.slice(1).join(' - ').trim(),
    };
}

/** @param {string} trafo */
function variantesCodigoTrafo(trafo) {
    const t = String(trafo || '').trim();
    if (!t) return [];
    const out = [t];
    const core = t.replace(/^TR-?/i, '').trim();
    if (core && core !== t) {
        out.push(`TR-${core}`, core);
    }
    return [...new Set(out)];
}

/**
 * @param {HTMLSelectElement|null} di2
 * @param {string} codigoDi2
 */
function fijarDi2(di2, codigoDi2) {
    if (!di2 || !codigoDi2) return false;
    return seleccionarDistribuidorPorCodigo(codigoDi2, di2, { retriesLeft: 0 });
}

/**
 * @param {HTMLSelectElement|null} di2
 * @param {string} namePart
 */
function matchDi2PorNombreRed(di2, namePart) {
    if (!di2 || !namePart) return false;
    const np = norm(namePart);
    const words = np.split(/\s+/).filter((w) => w.length >= 3);
    const options = Array.from(di2.options).filter((o) => o.value);
    let best = null;
    let bestScore = 0;
    for (const o of options) {
        const t = norm(o.textContent || '');
        const after = t.includes(' - ') ? t.split(' - ').slice(1).join(' - ') : t;
        let score = 0;
        if (after === np || t.includes(np) || np.includes(after)) score = 100;
        else {
            for (const w of words) {
                if (after.includes(w) || t.includes(w)) score += w.length;
            }
        }
        if (score > bestScore) {
            bestScore = score;
            best = o;
        }
    }
    if (best && bestScore >= 4) {
        di2.value = best.value;
        try {
            di2.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (_) {}
        return true;
    }
    return false;
}

/**
 * @param {HTMLSelectElement|null} di2
 * @param {string} localidad
 */
function matchDi2PorLocalidadUnica(di2, localidad) {
    if (!di2 || !localidad) return false;
    const loc = norm(localidad);
    if (!loc) return false;
    const options = Array.from(di2.options).filter((o) => o.value);
    const cands = options.filter((o) => {
        const t = norm(o.textContent || '');
        const after = t.includes(' - ') ? t.split(' - ').slice(1).join(' - ').trim() : t;
        return after === loc;
    });
    if (cands.length === 1) {
        di2.value = cands[0].value;
        try {
            di2.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (_) {}
        return true;
    }
    return false;
}

/**
 * @param {{
 *   sqlSimple?: Function,
 *   esc?: (v: unknown) => string,
 *   tenantIdActual?: () => number,
 * }} deps
 * @param {string} trafo
 */
async function codigoDistribuidorPorTrafo(deps, trafo) {
    if (!trafo || typeof deps.sqlSimple !== 'function' || typeof deps.esc !== 'function') return null;
    const tid = deps.tenantIdActual?.();
    const conTenant =
        Number.isFinite(Number(tid)) && Number(tid) > 0
            ? ` AND t.tenant_id = ${deps.esc(tid)}`
            : '';
    const variantes = variantesCodigoTrafo(trafo);
    const intentos = conTenant ? [conTenant, ''] : [''];
    for (const wf of intentos) {
        for (const tv of variantes) {
            try {
                const r = await deps.sqlSimple(
                    `SELECT d.codigo
                     FROM infra_transformadores t
                     INNER JOIN distribuidores d ON d.id = t.distribuidor_id
                     WHERE COALESCE(t.activo, TRUE) = TRUE AND COALESCE(d.activo, TRUE) = TRUE${wf}
                       AND UPPER(TRIM(t.codigo)) = UPPER(TRIM(${deps.esc(tv)}))
                     LIMIT 1`
                );
                const cod = r.rows?.[0]?.codigo;
                if (cod) return String(cod).trim();
            } catch (_) {}
        }
    }
    return null;
}

/**
 * @param {HTMLSelectElement|null} di2
 * @param {string} catalogo
 */
function fijarDi2DesdeCatalogo(di2, catalogo) {
    const { raw } = partesDistribuidorCatalogo(catalogo);
    if (!raw) return false;
    return asegurarOpcionDi2(di2, raw, raw);
}

/**
 * @param {{
 *   sqlSimple?: Function,
 *   esc?: (v: unknown) => string,
 *   tenantIdActual?: () => number,
 * }} deps
 * @param {{
 *   distribuidorCatalogo?: string|null,
 *   transformador?: string|null,
 *   localidad?: string|null,
 *   di2?: HTMLSelectElement|null,
 * }} p
 * @returns {Promise<boolean>}
 */
export async function resolverYSeleccionarDistribuidorDi2(deps, p) {
    const di2 = p.di2 || document.getElementById('di2');
    if (!di2) return false;
    const cat = p.distribuidorCatalogo != null ? String(p.distribuidorCatalogo).trim() : '';
    const trafo = p.transformador != null ? String(p.transformador).trim() : '';
    const localidad = p.localidad != null ? String(p.localidad).trim() : '';

    if (cat && fijarDi2(di2, cat)) return true;

    const { codePart, namePart } = partesDistribuidorCatalogo(cat);

    if (trafo) {
        const codTrafo = await codigoDistribuidorPorTrafo(deps, trafo);
        if (codTrafo && fijarDi2(di2, codTrafo)) return true;
    }

    if (typeof deps.sqlSimple === 'function' && typeof deps.esc === 'function' && cat) {
        try {
            const conds = [];
            if (codePart) {
                conds.push(`UPPER(TRIM(codigo)) = UPPER(TRIM(${deps.esc(codePart)}))`);
            }
            if (namePart) {
                conds.push(`nombre ILIKE ${deps.esc(`%${namePart}%`)}`);
                for (const w of namePart.split(/\s+/).filter((x) => x.length >= 4)) {
                    conds.push(`nombre ILIKE ${deps.esc(`%${w}%`)}`);
                }
            }
            if (conds.length) {
                const r = await deps.sqlSimple(
                    `SELECT codigo, nombre FROM distribuidores
                     WHERE COALESCE(activo, TRUE) = TRUE AND (${conds.join(' OR ')})
                     ORDER BY codigo LIMIT 8`
                );
                for (const row of r.rows || []) {
                    if (fijarDi2(di2, row.codigo)) return true;
                    if (row.nombre && matchDi2PorNombreRed(di2, row.nombre)) return true;
                }
            }
        } catch (_) {}
    }

    if (namePart && matchDi2PorNombreRed(di2, namePart)) return true;
    if (localidad && matchDi2PorLocalidadUnica(di2, localidad)) return true;
    if (cat && seleccionarDistribuidorPorCodigo(cat, di2, { retriesLeft: 2 })) return true;
    if (cat) return fijarDi2DesdeCatalogo(di2, cat);
    return false;
}
