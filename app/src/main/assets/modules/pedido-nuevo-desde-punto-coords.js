/**
 * Pedido nuevo desde coordenadas: admin web → #pm-oficina; app/técnicos → #pm.
 * Unifica goto «Nuevo reclamo», abrirNuevoPedidoEnCoordenadas y clic en mapa.
 * made by leavera77
 */

import { getApp } from './gn-app-global-bridge.js';
import { gnRequestClearGotoPreviewMarker } from './gn-map-goto-preview-marker.js';
import {
    mountPedidoFormularioEnDom,
    resetPedidoNuevoOficinaUi,
    abrirPedidoNuevoOficinaEnCoordenadas,
    esAdminWebPedidoNuevoOficina,
} from './pedido-nuevo-oficina.js';
import { resetPadronNuevoPedidoNisTimers } from './pedido-nuevo-padron-busqueda.js';

/** @type {Record<string, unknown>|null} */
let _deps = null;

/**
 * @param {Record<string, unknown>} deps
 */
export function initPedidoNuevoDesdePunto(deps) {
    _deps = deps;
    if (typeof window !== 'undefined') {
        window.abrirNuevoPedidoDesdePunto = (lat, lng, acc) =>
            abrirNuevoPedidoDesdePunto(lat, lng, acc);
    }
}

function programarReverse(lat, lng) {
    const la = Number(lat);
    const lo = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return;
    const fn = _deps?.programarReverseNominatimFormularioNuevoPedidoDesdeMapa;
    if (typeof fn === 'function') fn(la, lo);
    else if (typeof window.programarReverseNominatimFormularioNuevoPedidoDesdeMapa === 'function') {
        window.programarReverseNominatimFormularioNuevoPedidoDesdeMapa(la, lo);
    }
}

/**
 * Modal #pm (mapa / WebView técnicos).
 * @param {number} lat
 * @param {number} lng
 * @param {unknown} [acc]
 */
async function abrirNuevoPedidoModalMapa(lat, lng, acc) {
    const deps = _deps || {};
    if (typeof deps.ensureMapReady === 'function') await deps.ensureMapReady();
    const app = getApp();
    if (!app?.map) {
        const t = deps.toast || (typeof window.toast === 'function' ? window.toast : null);
        if (t) t('No se pudo cargar el mapa', 'error');
        return;
    }
    const latN = Number(lat);
    const lngN = Number(lng);
    if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
        const t = deps.toast || window.toast;
        if (typeof t === 'function') t('Coordenadas no válidas', 'error');
        return;
    }

    const Lref = window.L;
    if (!Lref || typeof Lref.latLng !== 'function') {
        const t = deps.toast || window.toast;
        if (typeof t === 'function') t('Mapa no listo', 'error');
        return;
    }

    app.sel = Lref.latLng(latN, lngN);
    if (typeof deps.limpiarFotosYPreviewNuevoPedido === 'function') deps.limpiarFotosYPreviewNuevoPedido();
    try {
        resetPedidoNuevoOficinaUi();
    } catch (_) {}
    try {
        resetPadronNuevoPedidoNisTimers();
    } catch (_) {}

    const li = document.getElementById('li');
    const gi = document.getElementById('gi');
    const pm = document.getElementById('pm');
    if (!li || !gi || !pm) return;

    mountPedidoFormularioEnDom();
    const pfHome = document.getElementById('pm-form-home');
    const pf = document.getElementById('pf');
    if (pf && pfHome && pf.parentElement !== pfHome) pfHome.appendChild(pf);

    li.value = String(latN);
    gi.value = String(lngN);
    if (typeof deps.syncWrapCoordsDisplayNuevoPedido === 'function') deps.syncWrapCoordsDisplayNuevoPedido();

    const ui = document.getElementById('ui');
    if (ui && typeof deps.htmlLineaUbicacionFormulario === 'function') {
        ui.innerHTML = deps.htmlLineaUbicacionFormulario(
            latN,
            lngN,
            acc != null && acc !== '' ? acc : null
        );
        ui.className = 'ud sel';
    }

    try {
        if (typeof deps.poblarSelectTiposReclamo === 'function') deps.poblarSelectTiposReclamo();
        if (typeof deps.syncNisClienteReclamoConexionUI === 'function') deps.syncNisClienteReclamoConexionUI();
    } catch (_) {}

    pm.classList.add('active');
    try {
        document.getElementById('pm-oficina')?.classList.remove('active');
    } catch (_) {}

    try {
        if (typeof deps.esAndroidWebViewMapa === 'function' && deps.esAndroidWebViewMapa()) {
            if (typeof deps.desarmarMapTapNuevoPedido === 'function') deps.desarmarMapTapNuevoPedido();
        }
    } catch (_) {}

    let z = 16;
    if (typeof deps.mostrarMarcadorUbicacion === 'function') {
        z = deps.mostrarMarcadorUbicacion(latN, lngN, acc != null ? acc : null) || 16;
    }
    app.map.invalidateSize({ animate: false });
    const ligero = typeof deps.gnMapaLigero === 'function' && deps.gnMapaLigero();
    app.map.setView([latN, lngN], z || 16, { animate: !ligero });
    try {
        const zEl = document.getElementById('zoom-altura');
        if (zEl && typeof deps.calcularEscalaReal === 'function') {
            zEl.textContent = deps.calcularEscalaReal(app.map.getZoom());
        }
    } catch (_) {}
}

/**
 * Abre pedido nuevo en el modal que corresponda y programa reverse Nominatim (tres rubros).
 * @param {number} lat
 * @param {number} lng
 * @param {unknown} [acc]
 */
export async function abrirNuevoPedidoDesdePunto(lat, lng, acc = null) {
    if (!_deps) return;

    try {
        if (typeof window !== 'undefined') window._gnSuppressMapClickUntil = Date.now() + 500;
    } catch (_) {}

    const latN = Number(lat);
    const lngN = Number(lng);
    if (!Number.isFinite(latN) || !Number.isFinite(lngN)) return;

    try {
        gnRequestClearGotoPreviewMarker();
    } catch (_) {}

    if (esAdminWebPedidoNuevoOficina(_deps)) {
        await abrirPedidoNuevoOficinaEnCoordenadas(_deps, latN, lngN);
    } else {
        await abrirNuevoPedidoModalMapa(latN, lngN, acc);
    }

    programarReverse(latN, lngN);
}
