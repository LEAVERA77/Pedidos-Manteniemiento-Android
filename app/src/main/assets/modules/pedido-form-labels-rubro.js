/**
 * Etiquetas del formulario «Nuevo pedido» (#pm) según rubro (municipio / eléctrica / agua).
 * made by leavera77
 */

import { rubroCatalogoTiposReclamo } from './catalogoReclamoPorRubro.js';

function rubroForm() {
    return rubroCatalogoTiposReclamo();
}

/** Texto de la primera opción del &lt;select id="di2"&gt;. */
export function textoOpcionPlaceholderDistribuidor() {
    const r = rubroForm();
    if (r === 'municipio') return '— Elegir barrio —';
    if (r === 'cooperativa_agua') return '— Elegir ramal —';
    return '— Elegir distribuidor —';
}

/** &lt;label for="di2"&gt; */
export function etiquetaCampoZonaDistribuidor() {
    const r = rubroForm();
    if (r === 'municipio') return 'Barrio';
    if (r === 'cooperativa_agua') return 'Ramal';
    return 'Distribuidor';
}

/** &lt;label for="nis"&gt; (sin asterisco; el caller agrega * si aplica). */
export function etiquetaCampoIdentificadorServicio() {
    const r = rubroForm();
    if (r === 'municipio') return 'ID Vecino';
    if (r === 'cooperativa_agua') return 'N° de Socio / Medidor';
    return 'NIS / Medidor';
}

export function placeholderNisCampo({ requerido }) {
    const r = rubroForm();
    const req = !!requerido;
    if (r === 'municipio') {
        return req
            ? 'Obligatorio — ID vecino o dato de credencial'
            : 'Opcional — al salir del campo se completa domicilio desde padrón si existe';
    }
    if (r === 'cooperativa_agua') {
        return req
            ? 'Obligatorio — N° de socio o medidor'
            : 'Opcional — al salir del campo se completa domicilio desde padrón si existe';
    }
    return req
        ? 'Obligatorio — NIS o medidor del socio'
        : 'Opcional (obligatorio en conexión / medidor / factibilidad según tipo)';
}

/**
 * @param {{ requiereNis: boolean, esMunicipio: boolean }} opts
 */
export function syncPedidoFormNisYClienteLabels(opts) {
    const { requiereNis, esMunicipio } = opts;
    const base = etiquetaCampoIdentificadorServicio();
    const lbN = document.getElementById('lbl-nis');
    const inpN = document.getElementById('nis');
    if (lbN) lbN.textContent = requiereNis ? `${base} *` : base;
    if (inpN) {
        if (requiereNis) inpN.setAttribute('required', 'required');
        else inpN.removeAttribute('required');
        inpN.placeholder = placeholderNisCampo({ requerido: requiereNis });
    }
    const lb = document.getElementById('lbl-cl');
    const inp = document.getElementById('cl');
    const etiquetaPersona = esMunicipio ? 'Vecino' : 'Cliente';
    if (lb) lb.textContent = requiereNis ? `${etiquetaPersona} *` : etiquetaPersona;
    if (inp) {
        if (requiereNis) inp.setAttribute('required', 'required');
        else inp.removeAttribute('required');
        inp.placeholder = esMunicipio ? 'Nombre del vecino (si aplica)' : 'Nombre o razón social del socio';
    }
}

export function syncPedidoFormZonaDistribuidorLabels() {
    const di2 = document.getElementById('di2');
    const lb = document.getElementById('lbl-di2-zona') || di2?.closest('.fg')?.querySelector('label[for="di2"]');
    if (lb) lb.textContent = etiquetaCampoZonaDistribuidor();
    if (di2 && di2.options && di2.options[0]) {
        di2.options[0].textContent = textoOpcionPlaceholderDistribuidor();
    }
}
