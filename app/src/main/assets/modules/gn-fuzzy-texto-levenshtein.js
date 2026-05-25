/**
 * Normalización (NFD), distancia de Levenshtein y coincidencia flexible en nombres/apellidos.
 * Usado en búsqueda por socio y filtros de históricos (todos los rubros / tenants).
 * made by leavera77
 */

/** Máximo de reclamos cerrados/derivados/desestimados en la pestaña «Cerrados» del panel principal. */
export const GN_MAX_HISTORICOS_EN_PANEL_PEDIDOS = 30;

/**
 * @param {unknown} s
 * @returns {string}
 */
export function normalizarTextoFuzzy(s) {
    let t = String(s ?? '')
        .normalize('NFD')
        .toLowerCase();
    try {
        t = t.replace(/\p{M}/gu, '');
    } catch (_) {
        t = t.replace(/[\u0300-\u036f]/g, '');
    }
    return t.replace(/\s+/g, ' ').trim();
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function distanciaLevenshtein(a, b) {
    const s = String(a);
    const t = String(b);
    const m = s.length;
    const n = t.length;
    if (!m) return n;
    if (!n) return m;
    const v0 = new Array(n + 1);
    const v1 = new Array(n + 1);
    for (let j = 0; j <= n; j++) v0[j] = j;
    for (let i = 0; i < m; i++) {
        v1[0] = i + 1;
        for (let j = 0; j < n; j++) {
            const c = s[i] === t[j] ? 0 : 1;
            v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + c);
        }
        for (let j = 0; j <= n; j++) v0[j] = v1[j];
    }
    return v0[n];
}

/**
 * @param {number} len
 * @returns {number}
 */
export function umbralLevenshteinParaNeedle(len) {
    const n = Math.max(0, Math.floor(Number(len) || 0));
    if (n <= 2) return 1;
    if (n <= 5) return 2;
    if (n <= 12) return 3;
    return 4;
}

/**
 * Coincidencia de apellido/nombre con tolerancia a tildes, orden de tokens y errores de tipeo.
 * @param {string} needleRaw
 * @param {string} nombreCompletoRaw
 * @returns {boolean}
 */
export function nombreCoincideFuzzy(needleRaw, nombreCompletoRaw) {
    const needle = normalizarTextoFuzzy(needleRaw);
    if (!needle) return true;
    const hay = normalizarTextoFuzzy(nombreCompletoRaw);
    if (!hay) return false;
    if (hay.includes(needle)) return true;
    const words = hay.split(' ').filter((w) => w.length > 0);
    const maxD = umbralLevenshteinParaNeedle(needle.length);
    for (const w of words) {
        if (w.includes(needle) || needle.includes(w)) return true;
        if (Math.abs(w.length - needle.length) > maxD + 2) continue;
        if (distanciaLevenshtein(needle, w) <= maxD) return true;
    }
    if (Math.abs(hay.length - needle.length) <= maxD + 3 && distanciaLevenshtein(needle, hay) <= maxD + 1) return true;
    return false;
}

/**
 * Texto de domicilio unificado para fuzzy (calle, nº, barrio, localidad, provincia).
 * @param {Record<string, unknown>|null|undefined} row
 * @returns {string}
 */
export function construirTextoDireccionPadron(row) {
    if (!row || typeof row !== 'object') return '';
    const parts = [row.calle, row.numero, row.barrio, row.localidad, row.provincia]
        .map((x) => (x != null ? String(x).trim() : ''))
        .filter(Boolean);
    return parts.join(' ');
}

/**
 * Coincidencia de dirección en padrón (todos los rubros): calle y domicilio completo con Levenshtein.
 * @param {string} needleRaw
 * @param {Record<string, unknown>|null|undefined} row
 * @returns {boolean}
 */
export function direccionCoincideFuzzy(needleRaw, row) {
    const needle = normalizarTextoFuzzy(needleRaw);
    if (!needle) return true;
    const calle = normalizarTextoFuzzy(row?.calle);
    const full = normalizarTextoFuzzy(construirTextoDireccionPadron(row));
    if (!full && !calle) return false;
    if (calle && nombreCoincideFuzzy(needleRaw, calle)) return true;
    if (full && nombreCoincideFuzzy(needleRaw, full)) return true;
    const tokens = needle.split(' ').filter((t) => t.length >= 2);
    if (tokens.length > 1) {
        const hay = full || calle;
        if (!hay) return false;
        return tokens.every((tok) => nombreCoincideFuzzy(tok, hay));
    }
    return false;
}

/**
 * Timestamp de resolución para ordenar históricos (cierre o derivación).
 * @param {Record<string, unknown>|null|undefined} p
 * @returns {number}
 */
export function tsResolucionPedidoMs(p) {
    if (!p || typeof p !== 'object') return 0;
    const es = String(p.es || '');
    if (es === 'Derivado externo' && p.fder) {
        const t = new Date(String(p.fder)).getTime();
        if (Number.isFinite(t)) return t;
    }
    if (p.fc) {
        const t = new Date(String(p.fc)).getTime();
        if (Number.isFinite(t)) return t;
    }
    if (p.f) {
        const t = new Date(String(p.f)).getTime();
        if (Number.isFinite(t)) return t;
    }
    return 0;
}
