/**
 * Cooperativa eléctrica: #di2 desde distribuidor_codigo del socio (socios_catalogo).
 * made by leavera77
 */

import { seleccionarDistribuidorPorCodigo, asegurarOpcionDi2 } from './pedido-nuevo-aplicar-padron.js';

/** @param {string} raw */
export function codigoDistribuidorDesdeSocio(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    const part = s.split(/\s*[-–—]\s*/)[0];
    return String(part || s).trim();
}

/**
 * @param {{
 *   ensureDistribuidoresCargados?: () => Promise<void>,
 * }} deps
 * @param {{
 *   distribuidor_codigo?: string|null,
 *   di2?: HTMLSelectElement|null,
 * }} p
 * @returns {Promise<{ ok: boolean, motivo?: string, fuente?: string, codigo?: string }>}
 */
export async function aplicarDistribuidorCoopDesdeSocioCatalogo(deps, p) {
    const di2 = p.di2 || document.getElementById('di2');
    const raw = String(p.distribuidor_codigo || '').trim();
    const codigo = codigoDistribuidorDesdeSocio(raw);
    if (!di2) return { ok: false, motivo: 'sin_di2' };
    if (!codigo) return { ok: false, motivo: 'sin_codigo' };

    if (typeof deps.ensureDistribuidoresCargados === 'function') {
        try {
            await deps.ensureDistribuidoresCargados();
        } catch (_) {}
    }

    const etiqueta = raw.includes(' - ') ? raw : codigo;
    if (seleccionarDistribuidorPorCodigo(raw, di2, { retriesLeft: 2 })) {
        return { ok: true, fuente: 'lista', codigo };
    }
    if (seleccionarDistribuidorPorCodigo(codigo, di2, { retriesLeft: 1 })) {
        return { ok: true, fuente: 'lista', codigo };
    }
    if (asegurarOpcionDi2(di2, codigo, etiqueta)) {
        return { ok: true, fuente: 'catalogo_socio', codigo };
    }
    return { ok: false, motivo: 'no_en_lista', codigo };
}
