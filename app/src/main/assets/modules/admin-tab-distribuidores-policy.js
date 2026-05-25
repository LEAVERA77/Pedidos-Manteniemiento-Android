/**
 * Visibilidad pestaña admin «Distribuidores» / SAIDI Excel (coop. eléctrica usa Red Eléctrica).
 * made by leavera77
 */

/**
 * @param {{ esMunicipioRubro?: () => boolean; esCooperativaElectricaRubro?: () => boolean }} [deps]
 */
export function debeOcultarTabDistribuidoresAdmin(deps = {}) {
    const esMuni =
        typeof deps.esMunicipioRubro === 'function'
            ? deps.esMunicipioRubro()
            : typeof window.esMunicipioRubro === 'function' && window.esMunicipioRubro();
    if (esMuni) return true;

    const esCoop =
        typeof deps.esCooperativaElectricaRubro === 'function'
            ? deps.esCooperativaElectricaRubro()
            : typeof window.esCooperativaElectricaRubro === 'function' && window.esCooperativaElectricaRubro();
    /** Catálogo zona legacy (`distribuidores`): reemplazado por pestaña Red Eléctrica (`distribuidores_red`). */
    if (esCoop) return true;

    const cfg = typeof window !== 'undefined' ? window.EMPRESA_CFG || {} : {};
    const o = cfg.ocultar_modulos_redes;
    return o === true || o === 1 || String(o).toLowerCase() === 'true' || String(o) === '1';
}
