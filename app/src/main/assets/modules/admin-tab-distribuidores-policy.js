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

/**
 * Pestañas admin coop. eléctrica: solo Red Eléctrica; ocultar Distribuidores y SAIDI Excel legacy.
 * @param {{ esCooperativaElectricaRubro?: () => boolean; esMunicipioRubro?: () => boolean }} [deps]
 */
export function syncCooperativaElectricaAdminTabs(deps = {}) {
    const esCoop =
        typeof deps.esCooperativaElectricaRubro === 'function'
            ? deps.esCooperativaElectricaRubro()
            : typeof window.esCooperativaElectricaRubro === 'function' && window.esCooperativaElectricaRubro();
    const hideLegacy = debeOcultarTabDistribuidoresAdmin(deps);
    const tabDist = document.getElementById('admin-tab-distribuidores');
    const tabSaidi = document.getElementById('admin-tab-saidi-excel');
    const tabRed = document.getElementById('admin-tab-red-electrica');
    if (tabDist) tabDist.style.display = hideLegacy ? 'none' : '';
    if (tabSaidi) tabSaidi.style.display = esCoop && hideLegacy ? 'none' : tabSaidi.style.display;
    if (tabRed) tabRed.style.display = esCoop ? '' : 'none';
}
