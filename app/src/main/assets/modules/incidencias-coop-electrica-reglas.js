/**
 * Cooperativa eléctrica: asociación de reclamos solo manual y solo administrador.
 * Sin sugerencias por trafo/distribuidor ni asociación automática.
 * made by leavera77
 */

export const MSG_ASOCIACION_SOLO_ADMIN_COOP =
    'En cooperativas eléctricas solo el administrador puede asociar reclamos manualmente.';

/** @returns {boolean} */
export function esCooperativaElectricaRubroInc() {
    try {
        const t = String(
            (typeof window !== 'undefined' && window.EMPRESA_CFG?.tipo) || ''
        ).toLowerCase();
        return (
            t === 'cooperativa_electrica' ||
            t.includes('electric') ||
            t.includes('eléctrica')
        );
    } catch (_) {
        return false;
    }
}

/**
 * ¿Puede crear/asociar reclamos en incidencias (checkboxes, FAB, modal)?
 * Coop. eléctrica → solo admin. Otros rubros → admin o técnico/supervisor.
 * @param {{ esAdmin: () => boolean, esTecnicoOSupervisor: () => boolean }} rol
 */
export function puedeAsociarReclamosIncidenciasManual(rol) {
    const esAdmin = typeof rol?.esAdmin === 'function' && rol.esAdmin();
    if (esCooperativaElectricaRubroInc()) return esAdmin;
    const esTec =
        typeof rol?.esTecnicoOSupervisor === 'function' && rol.esTecnicoOSupervisor();
    return esAdmin || esTec;
}
