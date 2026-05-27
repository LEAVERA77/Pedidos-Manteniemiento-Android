/**
 * Normaliza distribuidor/trafo/barrio al INSERT de pedido nuevo (sin vaciar trafo manual sin NIS).
 * made by leavera77
 */

/**
 * @param {{
 *   esCooperativaElectrica: boolean,
 *   esMunicipio: boolean,
 *   esAgua: boolean,
 *   nisVal: string,
 *   disVal: string,
 *   trafoVal: string,
 * }} p
 */
export function normalizarTrafoDistribuidorAlGuardarPedido(p) {
    let disVal = String(p.disVal || '').trim();
    let trafoVal = String(p.trafoVal || '').trim();
    let barrioVal = null;
    if (p.esCooperativaElectrica) {
        /* Sin NIS: conservar trafo y distribuidor elegidos a mano en el mapa. */
    } else if (p.esMunicipio) {
        barrioVal = disVal || null;
        disVal = '';
        trafoVal = '';
    } else if (p.esAgua) {
        trafoVal = '';
    }
    return { disVal, trafoVal, barrioVal };
}
