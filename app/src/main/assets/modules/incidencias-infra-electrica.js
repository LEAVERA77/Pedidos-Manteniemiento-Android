/**
 * Desactivado: en cooperativa eléctrica no hay asociación por trafo/distribuidor.
 * Solo el administrador asocia manualmente desde `modules/incidencias.js`.
 * made by leavera77
 */

export function incidenciasInfraDetalleHook() {}

export async function abrirAsociacionPorInfraDesdePedido() {}

export function installIncidenciasInfraElectrica() {}

if (typeof window !== 'undefined') {
    window._gnInitIncidenciasInfraElectrica = installIncidenciasInfraElectrica;
}
