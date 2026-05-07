/**
 * Texto del identificador en listas (NIS / ID vecino / N° socio) según rubro.
 * made by leavera77
 */

export function etiquetaIdentificadorPedidoLista() {
    try {
        if (typeof window.esMunicipioRubro === 'function' && window.esMunicipioRubro()) return 'ID Vecino';
        if (typeof window.esCooperativaAguaRubro === 'function' && window.esCooperativaAguaRubro()) return 'N° Socio';
    } catch (_) {}
    return 'NIS';
}

/** Título del bloque resumen en PDF / impresión estadísticas. */
export function tituloResumenReferenciaEstadisticas() {
    try {
        if (typeof window.esCooperativaElectricaRubro === 'function' && window.esCooperativaElectricaRubro()) {
            return 'Resumen y referencia ENRE';
        }
    } catch (_) {}
    return 'Resumen y referencia';
}
