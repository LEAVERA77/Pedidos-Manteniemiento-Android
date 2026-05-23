/**
 * Filtros en vivo para pestaña Admin → Históricos (tipo, NIS/medidor, nombre).
 * made by leavera77
 */

import { nombreCoincideFuzzy } from './gn-fuzzy-texto-levenshtein.js';

/**
 * @param {string} needle
 * @param {string} tipoTrabajo
 */
export function historicoTipoCoincideFuzzy(needle, tipoTrabajo) {
    const q = String(needle || '').trim();
    if (!q) return true;
    return nombreCoincideFuzzy(q, String(tipoTrabajo || '').trim());
}

/**
 * NIS, medidor, N° pedido, id — texto parcial y solo dígitos (ej. «56» → medidor 19656).
 * @param {string} idQ raw lowercased
 * @param {Record<string, unknown>} p pedido normalizado
 */
export function historicoIdCoincideParcial(idQ, p) {
    const q = String(idQ || '').trim().toLowerCase();
    if (!q) return true;
    const campos = [
        p.id,
        p.nis,
        p.med,
        p.nis_med,
        p.np,
        p._histTenantNom,
        p._histTenantId,
    ];
    for (const f of campos) {
        const s = String(f ?? '').toLowerCase();
        if (s && s.includes(q)) return true;
    }
    const digitsQ = q.replace(/\D/g, '');
    if (digitsQ.length >= 1) {
        for (const f of campos) {
            const d = String(f ?? '').replace(/\D/g, '');
            if (d && d.includes(digitsQ)) return true;
        }
    }
    return false;
}

/**
 * N° de reclamo (numero_pedido): parcial, solo dígitos o año (ej. 2025).
 * @param {string} qRaw
 * @param {Record<string, unknown>} p
 */
export function historicoNumeroReclamoCoincide(qRaw, p) {
    const q = String(qRaw || '').trim().toLowerCase();
    if (!q) return true;
    const np = String(p.np ?? p.numero_pedido ?? '').trim().toLowerCase();
    if (np && np.includes(q)) return true;
    const digitsQ = q.replace(/\D/g, '');
    if (digitsQ.length >= 1 && np) {
        const dNp = np.replace(/\D/g, '');
        if (dNp.includes(digitsQ)) return true;
    }
    if (/^\d{4}$/.test(digitsQ)) {
        if (np.includes(digitsQ)) return true;
        if (p.f) {
            try {
                const yr = new Date(String(p.f)).getFullYear();
                if (String(yr) === digitsQ) return true;
            } catch (_) {}
        }
        if (p.fc) {
            try {
                const yr = new Date(String(p.fc)).getFullYear();
                if (String(yr) === digitsQ) return true;
            } catch (_) {}
        }
    }
    return false;
}
