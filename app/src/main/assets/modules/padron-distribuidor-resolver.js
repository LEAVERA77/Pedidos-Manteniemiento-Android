/**
 * Resuelve distribuidor del catálogo de socios (ej. "D123 - Red Perdices") al código del &lt;select id="di2"&gt; (DIS01C…).
 * made by leavera77
 */

import { seleccionarDistribuidorPorCodigo } from './pedido-nuevo-aplicar-padron.js';

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
 * @param {{
 *   sqlSimple?: Function,
 *   esc?: (v: unknown) => string,
 *   tenantIdActual?: () => number,
 * }} deps
 * @param {{ distribuidorCatalogo?: string|null, transformador?: string|null, di2?: HTMLSelectElement|null }} p
 * @returns {Promise<boolean>}
 */
export async function resolverYSeleccionarDistribuidorDi2(deps, p) {
    const di2 = p.di2 || document.getElementById('di2');
    if (!di2) return false;
    const cat = p.distribuidorCatalogo != null ? String(p.distribuidorCatalogo).trim() : '';
    const trafo = p.transformador != null ? String(p.transformador).trim() : '';

    if (cat && fijarDi2(di2, cat)) return true;

    const { codePart, namePart } = partesDistribuidorCatalogo(cat);

    if (typeof deps.sqlSimple === 'function' && typeof deps.esc === 'function') {
        if (trafo) {
            try {
                const tid = deps.tenantIdActual?.();
                const wf =
                    Number.isFinite(Number(tid)) && Number(tid) > 0
                        ? ` AND t.tenant_id = ${deps.esc(tid)}`
                        : '';
                const r = await deps.sqlSimple(
                    `SELECT d.codigo
                     FROM infra_transformadores t
                     INNER JOIN distribuidores d ON d.id = t.distribuidor_id
                     WHERE COALESCE(t.activo, TRUE) = TRUE AND COALESCE(d.activo, TRUE) = TRUE${wf}
                       AND UPPER(TRIM(t.codigo)) = UPPER(TRIM(${deps.esc(trafo)}))
                     LIMIT 1`
                );
                const cod = r.rows?.[0]?.codigo;
                if (cod && fijarDi2(di2, String(cod))) return true;
            } catch (_) {}
        }

        if (cat) {
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
    }

    if (namePart && matchDi2PorNombreRed(di2, namePart)) return true;
    if (cat) return seleccionarDistribuidorPorCodigo(cat, di2, { retriesLeft: 8 });
    return false;
}
