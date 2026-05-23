/**
 * Rubro activo (municipio / eléctrica / agua) para módulos de padrón.
 * made by leavera77
 */

/**
 * @param {{
 *   normalizarRubroEmpresa?: (tipo?: unknown) => string|null,
 *   esCooperativaElectricaRubro?: () => boolean,
 *   esMunicipioRubro?: () => boolean,
 *   esCooperativaAguaRubro?: () => boolean,
 * }} [deps]
 */
export function rubroPadronActivo(deps = {}) {
    if (typeof deps.esCooperativaElectricaRubro === 'function' && deps.esCooperativaElectricaRubro()) {
        return 'cooperativa_electrica';
    }
    if (typeof deps.esMunicipioRubro === 'function' && deps.esMunicipioRubro()) {
        return 'municipio';
    }
    if (typeof deps.esCooperativaAguaRubro === 'function' && deps.esCooperativaAguaRubro()) {
        return 'cooperativa_agua';
    }
    const tipo =
        typeof window !== 'undefined' && window.EMPRESA_CFG?.tipo != null ? window.EMPRESA_CFG.tipo : null;
    if (typeof deps.normalizarRubroEmpresa === 'function') {
        return deps.normalizarRubroEmpresa(tipo) || null;
    }
    return null;
}
