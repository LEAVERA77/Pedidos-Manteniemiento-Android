/**
 * Dist., Conex. y Fases desde socios_catalogo (columnas + datos_extra JSON).
 * made by leavera77
 */

/** @param {unknown} v */
function txt(v) {
    return v != null ? String(v).trim() : '';
}

/**
 * @param {unknown} raw
 * @returns {Record<string, string>}
 */
export function parseDatosExtraSocio(raw) {
    if (raw == null || raw === '') return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) {
        /** @type {Record<string, string>} */
        const o = {};
        for (const [k, v] of Object.entries(raw)) {
            const s = txt(v);
            if (s) o[String(k)] = s;
        }
        return o;
    }
    try {
        const j = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (j && typeof j === 'object' && !Array.isArray(j)) {
            return parseDatosExtraSocio(j);
        }
    } catch (_) {}
    return {};
}

/**
 * @param {Record<string, unknown>|null|undefined} row
 * @param {string[]} keys
 */
function pickCampo(row, keys) {
    if (!row) return '';
    const extra = parseDatosExtraSocio(row.datos_extra);
    for (const k of keys) {
        const v = txt(row[k]);
        if (v) return v;
    }
    for (const k of keys) {
        const v = txt(extra[k]);
        if (v) return v;
    }
    const normExtra = {};
    for (const [ek, ev] of Object.entries(extra)) {
        normExtra[String(ek).toLowerCase().replace(/\./g, '')] = ev;
    }
    for (const k of keys) {
        const nk = k.toLowerCase().replace(/\./g, '');
        const v = txt(normExtra[nk]);
        if (v) return v;
    }
    return '';
}

/**
 * @param {Record<string, unknown>|null|undefined} row
 */
export function resolverDistribuidorCodigoSocio(row) {
    return pickCampo(row, [
        'distribuidor_codigo',
        'distribuidor',
        'distribuidor_',
        'dist',
        'Dist',
        'codigo_distribuidor',
    ]);
}

/**
 * @param {Record<string, unknown>|null|undefined} row
 */
export function resolverTipoConexionSocio(row) {
    return pickCampo(row, [
        'tipo_conexion',
        'conexion',
        'Conex',
        'conex',
        'tipo_de_conexion',
    ]);
}

/**
 * @param {Record<string, unknown>|null|undefined} row
 */
export function resolverFasesSocio(row) {
    return pickCampo(row, ['fases', 'Fases', 'fase', 'cantidad_fases']);
}

/**
 * @param {Record<string, unknown>|null|undefined} row
 */
export function resolverTransformadorSocio(row) {
    return pickCampo(row, ['transformador', 'trafo', 'Transf', 'transf', 'transformador_codigo']);
}

/**
 * @param {Record<string, unknown>|null|undefined} row
 * @returns {Record<string, unknown>}
 */
export function normalizarFilaPadronSocio(row) {
    if (!row || typeof row !== 'object') return row || {};
    const dist = resolverDistribuidorCodigoSocio(row);
    const tc = resolverTipoConexionSocio(row);
    const fa = resolverFasesSocio(row);
    const tr = resolverTransformadorSocio(row);
    return {
        ...row,
        distribuidor_codigo: dist || row.distribuidor_codigo,
        tipo_conexion: tc || row.tipo_conexion,
        fases: fa || row.fases,
        transformador: tr || row.transformador,
    };
}
