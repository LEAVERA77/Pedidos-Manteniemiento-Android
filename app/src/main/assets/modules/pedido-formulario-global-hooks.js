/**
 * Funciones del formulario #pf expuestas a onchange inline en index.html.
 * made by leavera77
 */

import { prioridadPredeterminadaPorTipoTrabajoUI } from './catalogoReclamoPorRubro.js';
import { reaplicarSuministroPadronPendiente } from './pedido-nuevo-suministro-padron.js';
import {
    installTrafoPedidoNuevoListeners,
    syncTrafoPedidoNuevoEditable,
} from './pedido-nuevo-trafo-editable.js';

function esCooperativaElectricaRubro() {
    const t = String(window.EMPRESA_CFG?.tipo || '')
        .trim()
        .toLowerCase();
    return (
        t === 'cooperativa_electrica' ||
        t === 'cooperativa eléctrica' ||
        t === 'cooperativa electrica'
    );
}

/** Alineado con api/services/tiposReclamo.js */
export function tipoReclamoElectricoPideSuministroWhatsapp(tipoTrabajo) {
    const v = String(tipoTrabajo || '').trim();
    return (
        v === 'Problemas de Tensión' ||
        v === 'Consumo elevado' ||
        v === 'Corte de Energía' ||
        v === 'Alumbrado Público (Mantenimiento)' ||
        v === 'Pedido de factibilidad (nuevo servicio)'
    );
}

export function syncPrioridadConTipoReclamo() {
    const tt = document.getElementById('tt');
    const pr = document.getElementById('pr');
    if (!tt || !pr) return;
    const v = prioridadPredeterminadaPorTipoTrabajoUI(tt.value);
    if (Array.from(pr.options).some((o) => o.value === v)) pr.value = v;
}

export function syncSuministroElectricoUI() {
    const w = document.getElementById('ped-suministro-wrap');
    if (!w) return;
    const tt = document.getElementById('tt')?.value || '';
    const show = esCooperativaElectricaRubro() && tipoReclamoElectricoPideSuministroWhatsapp(tt);
    w.style.display = show ? '' : 'none';
    if (!show) {
        const a = document.getElementById('ped-sum-conexion');
        const b = document.getElementById('ped-sum-fases');
        if (a) a.value = '';
        if (b) b.value = '';
    } else {
        reaplicarSuministroPadronPendiente();
    }
    try {
        syncTrafoPedidoNuevoEditable();
    } catch (_) {}
}

export function installPedidoFormularioGlobalHooks() {
    if (typeof window === 'undefined') return;
    window.syncPrioridadConTipoReclamo = syncPrioridadConTipoReclamo;
    window.syncSuministroElectricoUI = syncSuministroElectricoUI;
    installTrafoPedidoNuevoListeners();
}
