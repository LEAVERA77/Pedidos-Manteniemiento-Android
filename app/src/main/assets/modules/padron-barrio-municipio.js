/**
 * Selección de barrio en #di2 para municipio desde padrón de socios / clientes finales.
 * made by leavera77
 */

import { seleccionarDistribuidorPorCodigo } from './pedido-nuevo-aplicar-padron.js';

/** @param {string} s */
function norm(s) {
    return String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

/**
 * @param {{ sqlSimple?: Function, esc?: Function, tenantIdActual?: () => number }} _deps
 * @param {{ barrio?: unknown, distribuidor_codigo?: unknown, localidad?: unknown }} row
 */
export async function seleccionarBarrioMunicipioDi2(_deps, row) {
    const di2 = document.getElementById('di2');
    if (!di2) return false;
    let br = String(row.barrio || row.distribuidor_codigo || '').trim();
    if (!br && typeof _deps.sqlSimple === 'function') return false;

    if (seleccionarDistribuidorPorCodigo(br, di2, { retriesLeft: 3 })) return true;

    const nbr = norm(br);
    if (!nbr) return false;
    const opt = Array.from(di2.options).find((o) => {
        const v = norm(o.value);
        const t = norm(o.textContent);
        return v === nbr || t === nbr || t.includes(nbr) || nbr.includes(v);
    });
    if (opt) {
        di2.value = opt.value;
        try {
            di2.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (_) {}
        return true;
    }
    return false;
}
