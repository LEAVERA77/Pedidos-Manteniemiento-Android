/**
 * Panel #bp2 técnico: pestañas, «ver todos» y límite de cerrados (sin mezclar estados).
 * made by leavera77
 */

import { GN_MAX_HISTORICOS_EN_PANEL_PEDIDOS, tsResolucionPedidoMs } from './gn-fuzzy-texto-levenshtein.js';
import { usuarioIdSesionOperadorPedidos } from './pedido-detalle-puede-ejecutar.js';

function parseIdUsuario(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v | 0;
    const n = parseInt(String(v).trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
}

/** @param {object} p */
function usuarioCierreIdDesdePedido(p) {
    if (!p || typeof p !== 'object') return null;
    return parseIdUsuario(p.uci ?? p.usuario_cierre_id ?? p.usuarioCierreId);
}

/**
 * Lista del panel según rol y pestaña.
 * @param {{
 *   vis: object[],
 *   tab: string,
 *   esTecnicoOSupervisor: boolean,
 *   verTodosEmpresa: boolean,
 *   pasaSoloAgrupadosToolbar: (p: object) => boolean,
 *   soloDesLista: boolean,
 *   soloDerivLista: boolean,
 *   pedidoEsDerivadoFuera: (p: object) => boolean,
 * }} opts
 */
export function filtrarListaPanelPedidosRender(opts) {
    const {
        vis,
        tab,
        esTecnicoOSupervisor,
        verTodosEmpresa,
        pasaSoloAgrupadosToolbar,
        soloDesLista,
        soloDerivLista,
        pedidoEsDerivadoFuera,
    } = opts;

    if (esTecnicoOSupervisor) {
        let fl = (vis || []).filter((p) => {
            if (!pasaSoloAgrupadosToolbar(p)) return false;
            if (tab === 'p') return p.es === 'Pendiente';
            if (tab === 'a') return p.es === 'Asignado' || p.es === 'En ejecución';
            if (soloDesLista) return p.es === 'Desestimado';
            if (soloDerivLista) return pedidoEsDerivadoFuera(p);
            if (p.es !== 'Cerrado' && p.es !== 'Derivado externo') return false;
            if (!verTodosEmpresa) {
                const uid = usuarioIdSesionOperadorPedidos();
                const uci = usuarioCierreIdDesdePedido(p);
                if (uid == null || uci == null) return false;
                return uci === uid;
            }
            return true;
        });
        if (tab === 'c' && fl.length > GN_MAX_HISTORICOS_EN_PANEL_PEDIDOS) {
            fl = [...fl]
                .sort((a, b) => tsResolucionPedidoMs(b) - tsResolucionPedidoMs(a))
                .slice(0, GN_MAX_HISTORICOS_EN_PANEL_PEDIDOS);
        } else if (verTodosEmpresa && (tab === 'p' || tab === 'a')) {
            fl = [...fl].sort((a, b) => {
                const ta = a.f ? new Date(a.f).getTime() : 0;
                const tb = b.f ? new Date(b.f).getTime() : 0;
                return tb - ta;
            });
        }
        return fl;
    }

    if (verTodosEmpresa) {
        return [...(vis || [])]
            .filter((p) => pasaSoloAgrupadosToolbar(p))
            .sort((a, b) => {
                const ta = a.f ? new Date(a.f).getTime() : 0;
                const tb = b.f ? new Date(b.f).getTime() : 0;
                return tb - ta;
            });
    }

    let fl = (vis || []).filter((p) => {
        if (!pasaSoloAgrupadosToolbar(p)) return false;
        if (tab === 'p') return p.es === 'Pendiente';
        if (tab === 'a') return p.es === 'Asignado' || p.es === 'En ejecución';
        if (soloDesLista) return p.es === 'Desestimado';
        if (soloDerivLista) return pedidoEsDerivadoFuera(p);
        return p.es === 'Cerrado' || p.es === 'Derivado externo';
    });
    if (tab === 'c' && fl.length > GN_MAX_HISTORICOS_EN_PANEL_PEDIDOS) {
        fl = [...fl]
            .sort((a, b) => tsResolucionPedidoMs(b) - tsResolucionPedidoMs(a))
            .slice(0, GN_MAX_HISTORICOS_EN_PANEL_PEDIDOS);
    }
    return fl;
}

/**
 * Conteo de cerrados/derivados para badge de pestaña (técnico sin «ver todos»: solo cerrados por él).
 * @param {object[]} vis
 * @param {boolean} esTecnicoOSupervisor
 * @param {boolean} verTodosEmpresa
 * @param {(p: object) => boolean} pasaSoloAgrupadosToolbar
 * @param {boolean} soloDesLista
 * @param {boolean} soloDerivLista
 * @param {(p: object) => boolean} pedidoEsDerivadoFuera
 */
export function contarCerradosPanelPedidos(
    vis,
    esTecnicoOSupervisor,
    verTodosEmpresa,
    pasaSoloAgrupadosToolbar,
    soloDesLista,
    soloDerivLista,
    pedidoEsDerivadoFuera
) {
    return (vis || []).filter((p) => {
        if (!pasaSoloAgrupadosToolbar(p)) return false;
        if (soloDesLista) return p.es === 'Desestimado';
        if (soloDerivLista) return pedidoEsDerivadoFuera(p);
        if (p.es !== 'Cerrado' && p.es !== 'Derivado externo') return false;
        if (esTecnicoOSupervisor && !verTodosEmpresa) {
            const uid = usuarioIdSesionOperadorPedidos();
            const uci = usuarioCierreIdDesdePedido(p);
            if (uid == null || uci == null) return false;
            return uci === uid;
        }
        return true;
    }).length;
}
