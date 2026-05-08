/**
 * Recordatorio quincenal + opción de ocultar históricos resueltos solo en la lista #bp2 (vista local).
 * No borra datos en Neon.
 */

const LS_QUINCENA_HIST = 'pmg_historicos_quincena_recordatorio_ts';
/** Si es '1', los admin no ven Cerrados / Desestimados / Derivados en el panel #bp2 (siguen en datos y en Admin → Históricos). */
const LS_BP2_OCULTAR_HIST = 'pmg_bp2_ocultar_hist_resueltos';
const MS_15_DIAS = 15 * 24 * 60 * 60 * 1000;

export function bp2OcultarHistoricosResueltosActivo() {
    try {
        return String(localStorage.getItem(LS_BP2_OCULTAR_HIST) || '') === '1';
    } catch (_) {
        return false;
    }
}

export function activarOcultarHistoricosResueltosBp2() {
    try {
        localStorage.setItem(LS_BP2_OCULTAR_HIST, '1');
    } catch (_) {}
}

export function desactivarOcultarHistoricosResueltosBp2() {
    try {
        localStorage.removeItem(LS_BP2_OCULTAR_HIST);
    } catch (_) {}
}

/**
 * Si ya hubo un “ancla” y pasaron ≥15 días, actualiza la ancla, muestra toast y activa la vista sin históricos en #bp2.
 */
export function runQuincenaHistCheck(toast) {
    let last = 0;
    try {
        last = parseInt(String(localStorage.getItem(LS_QUINCENA_HIST) || '0'), 10) || 0;
    } catch (_) {
        last = 0;
    }
    const now = Date.now();
    if (!last) {
        try {
            localStorage.setItem(LS_QUINCENA_HIST, String(now));
        } catch (_) {}
        return;
    }
    if (now - last < MS_15_DIAS) return;
    try {
        localStorage.setItem(LS_QUINCENA_HIST, String(now));
    } catch (_) {}
    activarOcultarHistoricosResueltosBp2();
    if (typeof toast === 'function') {
        toast(
            'Recordatorio quincenal: los cerrados, desestimados y derivados dejaron de mostrarse en el panel de pedidos (solo vista). Seguís viéndolos en Admin → Históricos.',
            'info',
            7200
        );
    }
}

/** Botón manual: adelanta la ancla y activa la misma vista compacta en #bp2. */
export function marcarVaciadoQuincenaHecho(toast) {
    try {
        localStorage.setItem(LS_QUINCENA_HIST, String(Date.now()));
    } catch (_) {}
    activarOcultarHistoricosResueltosBp2();
    if (typeof toast === 'function') {
        toast(
            'Listo: históricos resueltos ocultos en el panel de pedidos (solo vista). Próximo recordatorio quincenal dentro de 15 días. Los datos no se borran en Neon.',
            'success',
            4200
        );
    }
}
