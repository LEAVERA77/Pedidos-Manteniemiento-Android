/**
 * Toasts al aplicar padrón al pedido (éxito / campos faltantes).
 * made by leavera77
 */

import { toastPedidoPadron } from './pedido-nuevo-padron-toast.js';
import {
    camposPadronFaltantesParaPedido,
    mensajeCamposPadronFaltantes,
    mensajeExitoPadronCargado,
} from './padron-campos-requeridos-pedido.js';
import { resolverDistribuidorCodigoSocio } from './padron-socio-campos-resolver.js';

/**
 * @param {{
 *   row: Record<string, unknown>,
 *   rubro: { esCooperativaElectrica?: boolean, esMunicipio?: boolean, esAgua?: boolean },
 *   distribuidorOk?: boolean,
 *   identKey?: string,
 *   mismoSocio?: boolean,
 * }} p
 */
export function notificarResultadoAplicarPadron(p) {
    if (p.mismoSocio) return;

    const missing = camposPadronFaltantesParaPedido(p.row, p.rubro);
    const ident = p.identKey || '';

    if (missing.length) {
        toastPedidoPadron(
            `Socio cargado. ${mensajeCamposPadronFaltantes(missing)}`,
            'warning',
            6500,
            `padron-miss-${ident}-${missing.map((m) => m.key).join(',')}`
        );
        return;
    }

    if (p.rubro.esCooperativaElectrica && p.distribuidorOk === false && resolverDistribuidorCodigoSocio(p.row)) {
        toastPedidoPadron(
            'Socio cargado. El distribuidor del catálogo no coincide con la lista de red; revisá el desplegable Dist.',
            'warning',
            5500,
            `padron-dist-lista-${ident}`
        );
        return;
    }

    toastPedidoPadron(
        mensajeExitoPadronCargado(p.row, p.rubro),
        'success',
        3200,
        `padron-ok-${ident}`
    );
}
