/**
 * Campo «Barrio» auxiliar en Nuevo pedido (cooperativa eléctrica / agua): Nominatim como en municipio (di2).
 * made by leavera77
 */
import { rubroCatalogoTiposReclamo } from './catalogoReclamoPorRubro.js';

function rubroActual() {
    return rubroCatalogoTiposReclamo();
}

/** Barrio en texto además de distribuidor/ramal (eléctrica y agua). */
export function rubroMuestraBarrioAuxNuevoPedido() {
    const r = rubroActual();
    return r === 'cooperativa_electrica' || r === 'cooperativa_agua';
}

export function syncPedidoBarrioAuxWrapperVisibility() {
    const wrap = document.getElementById('ped-barrio-aux-wrap');
    if (!wrap) return;
    wrap.style.display = rubroMuestraBarrioAuxNuevoPedido() ? '' : 'none';
}

/**
 * @param {Record<string, unknown>} addr — Nominatim `address`
 */
export function aplicarBarrioNominatimEnFormularioNuevoPedido(addr) {
    const barrio =
        addr?.suburb || addr?.neighbourhood || addr?.quarter || addr?.city_district || '';
    const bTrim = String(barrio || '').trim();
    if (!bTrim) return;
    const r = rubroActual();
    if (r === 'municipio') {
        const di2 = document.getElementById('di2');
        if (di2 && bTrim) {
            let opt = Array.from(di2.options).find((o) => o.value === bTrim);
            if (!opt) {
                opt = document.createElement('option');
                opt.value = bTrim;
                opt.textContent = bTrim;
                di2.appendChild(opt);
            }
            di2.value = bTrim;
        }
        return;
    }
    if (rubroMuestraBarrioAuxNuevoPedido()) {
        const inp = document.getElementById('ped-cli-barrio');
        if (inp) inp.value = bTrim;
    }
}
