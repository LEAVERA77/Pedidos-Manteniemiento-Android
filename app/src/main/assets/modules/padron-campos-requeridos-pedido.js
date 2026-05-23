/**
 * Campos faltantes del catálogo al cargar pedido (por rubro).
 * made by leavera77
 */

import {
    resolverDistribuidorCodigoSocio,
    resolverFasesSocio,
    resolverTipoConexionSocio,
    resolverTransformadorSocio,
} from './padron-socio-campos-resolver.js';

/** @param {unknown} v */
function txt(v) {
    return v != null ? String(v).trim() : '';
}

/**
 * @param {Record<string, unknown>|null|undefined} row
 * @param {{ esCooperativaElectrica?: boolean, esMunicipio?: boolean, esAgua?: boolean }} rubro
 * @returns {Array<{ key: string, label: string }>}
 */
export function camposPadronFaltantesParaPedido(row, rubro) {
    /** @type {Array<{ key: string, label: string }>} */
    const missing = [];
    if (!row) return missing;

    if (rubro.esCooperativaElectrica) {
        if (!resolverDistribuidorCodigoSocio(row)) missing.push({ key: 'dist', label: 'Dist. (distribuidor)' });
        if (!resolverTransformadorSocio(row)) missing.push({ key: 'trafo', label: 'Transformador' });
        if (!txt(row.nombre)) missing.push({ key: 'nombre', label: 'Nombre del socio' });
        if (!txt(row.calle) && !txt(row.localidad)) {
            missing.push({ key: 'domicilio', label: 'Calle o localidad' });
        }
    } else if (rubro.esMunicipio) {
        if (!txt(row.barrio) && !txt(row.distribuidor_codigo)) {
            missing.push({ key: 'barrio', label: 'Barrio' });
        }
        if (!txt(row.nombre)) missing.push({ key: 'nombre', label: 'Nombre del vecino' });
    } else if (rubro.esAgua) {
        if (!txt(row.barrio) && !txt(row.distribuidor_codigo)) {
            missing.push({ key: 'ramal', label: 'Ramal' });
        }
        if (!txt(row.nombre)) missing.push({ key: 'nombre', label: 'Nombre del socio' });
    }

    return missing;
}

/**
 * @param {Array<{ label: string }>} missing
 */
export function mensajeCamposPadronFaltantes(missing) {
    if (!missing?.length) return '';
    const labels = missing.map((m) => m.label).join(', ');
    return `Faltan datos en el catálogo de socios: ${labels}. Completalos en Socios / NIS o cargá el pedido igual.`;
}

/**
 * @param {Record<string, unknown>|null|undefined} row
 * @param {{ esCooperativaElectrica?: boolean }} rubro
 */
export function mensajeExitoPadronCargado(row, rubro) {
    if (rubro.esCooperativaElectrica) {
        const p = [];
        const d = resolverDistribuidorCodigoSocio(row);
        if (d) p.push('distribuidor');
        if (resolverTransformadorSocio(row)) p.push('trafo');
        if (resolverTipoConexionSocio(row)) p.push('conexión');
        if (resolverFasesSocio(row)) p.push('fases');
        if (p.length) return `Socio cargado (${p.join(', ')}).`;
    }
    if (rubro.esMunicipio && txt(row.barrio)) {
        return `Vecino cargado (barrio ${txt(row.barrio)}).`;
    }
    if (rubro.esAgua && (txt(row.barrio) || txt(row.distribuidor_codigo))) {
        const z = txt(row.barrio) || txt(row.distribuidor_codigo);
        return `Socio cargado (ramal ${z}).`;
    }
    return 'Socio cargado en el formulario.';
}
