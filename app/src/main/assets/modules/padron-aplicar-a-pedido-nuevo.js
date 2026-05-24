/**
 * Aplica padrón al modal #pm (admin / técnico Android) con trafo, distribuidor y barrio/ramal.
 * made by leavera77
 */

import { aplicarPadronAlFormularioNuevoPedido } from './pedido-nuevo-aplicar-padron.js';
import { cargarFilaPadronCompletaDesdeBd } from './padron-fetch-socio-completo.js';
import { seleccionarBarrioMunicipioDi2 } from './padron-barrio-municipio.js';
import { rubroPadronActivo } from './padron-rubro-helpers.js';
import {
    aplicarDistribuidorCoopDesdeSocioCatalogo,
} from './padron-distribuidor-socio-di2.js';
import { resolverDistribuidorCodigoSocio } from './padron-socio-campos-resolver.js';
import {
    aplicarSuministroElectricoDesdePadron,
    guardarSuministroPadronDesdeFila,
} from './pedido-nuevo-suministro-padron.js';
import { aplicarCoordsPadronPedidoOficinaSiHay } from './pedido-nuevo-oficina.js';

/** @param {unknown} v */
function txt(v) {
    return v != null ? String(v).trim() : '';
}

/**
 * @param {{
 *   sqlSimple: Function,
 *   esc: (v: unknown) => string,
 *   tenantIdActual: () => number,
 *   sociosCatalogoTieneTenantId: () => Promise<boolean>,
 *   normalizarRubroEmpresa: () => string|null,
 *   esCooperativaElectricaRubro?: () => boolean,
 *   esMunicipioRubro?: () => boolean,
 *   esCooperativaAguaRubro?: () => boolean,
 *   ensureDistribuidoresCargados?: () => Promise<void>,
 * }} deps
 * @param {Record<string, unknown>} row
 */
export async function aplicarPadronAlPedidoNuevo(deps, row) {
    let full = await cargarFilaPadronCompletaDesdeBd(deps, row);
    full = { ...full, distribuidor_codigo: resolverDistribuidorCodigoSocio(full) || full.distribuidor_codigo };
    if (typeof deps.ensureDistribuidoresCargados === 'function') {
        try {
            await deps.ensureDistribuidoresCargados();
        } catch (_) {}
    }
    const rubro = rubroPadronActivo(deps);
    const opts = {
        esCooperativaElectrica:
            typeof deps.esCooperativaElectricaRubro === 'function'
                ? deps.esCooperativaElectricaRubro()
                : rubro === 'cooperativa_electrica',
        esMunicipio:
            typeof deps.esMunicipioRubro === 'function' ? deps.esMunicipioRubro() : rubro === 'municipio',
        esAgua:
            typeof deps.esCooperativaAguaRubro === 'function'
                ? deps.esCooperativaAguaRubro()
                : rubro === 'cooperativa_agua',
        delegarZonaDi2: true,
    };

    const ident = aplicarPadronAlFormularioNuevoPedido(full, opts);

    let distribuidorOk = true;

    if (opts.esCooperativaElectrica) {
        const tf = document.getElementById('trafo-pedido');
        const trafoTxt = txt(full.transformador);
        if (tf) {
            tf.value = trafoTxt;
            tf.removeAttribute('placeholder');
        }
        const distTxt = txt(resolverDistribuidorCodigoSocio(full) || full.distribuidor_codigo);
        if (distTxt) {
            const res = await aplicarDistribuidorCoopDesdeSocioCatalogo(deps, {
                distribuidor_codigo: distTxt,
            });
            distribuidorOk = !!res.ok;
        } else {
            distribuidorOk = false;
        }
        const barrioAux = document.getElementById('ped-cli-barrio');
        if (barrioAux && txt(full.barrio)) barrioAux.value = txt(full.barrio);
        guardarSuministroPadronDesdeFila(full);
        try {
            if (typeof window.syncSuministroElectricoUI === 'function') {
                window.syncSuministroElectricoUI();
            } else {
                aplicarSuministroElectricoDesdePadron(full);
            }
        } catch (_) {
            aplicarSuministroElectricoDesdePadron(full);
        }
    }

    if (opts.esMunicipio || opts.esAgua) {
        await seleccionarBarrioMunicipioDi2(deps, full);
    }

    try {
        await aplicarCoordsPadronPedidoOficinaSiHay(full);
    } catch (_) {}

    return { ident, distribuidorOk, row: full };
}
