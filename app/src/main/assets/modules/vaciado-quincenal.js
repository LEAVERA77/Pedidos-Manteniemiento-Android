/**
 * Recordatorio quincenal para revisar reclamos resueltos en Admin → Históricos.
 * No modifica Neon ni mueve filas: solo localStorage + toast.
 */

const LS_QUINCENA_HIST = 'pmg_historicos_quincena_recordatorio_ts';
const MS_15_DIAS = 15 * 24 * 60 * 60 * 1000;

/**
 * Si ya hubo un “ancla” y pasaron ≥15 días, actualiza la ancla y muestra un toast (una vez por ventana de 15 días).
 * Si no hay ancla, guarda ahora sin toast (primera visita).
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
    if (typeof toast === 'function') {
        toast(
            'Recordatorio quincenal: los reclamos cerrados, desestimados o derivados siguen en el servidor; revisalos en Admin → Históricos.',
            'info',
            7200
        );
    }
}

/** Botón manual: adelanta la ancha de recordatorio y avisa. */
export function marcarVaciadoQuincenaHecho(toast) {
    try {
        localStorage.setItem(LS_QUINCENA_HIST, String(Date.now()));
    } catch (_) {}
    if (typeof toast === 'function') {
        toast('Listo: próximo recordatorio quincenal dentro de 15 días. Los datos no se borran en Neon.', 'success', 4200);
    }
}
