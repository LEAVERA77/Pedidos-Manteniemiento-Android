/**
 * Conexión y fases en pedido nuevo desde columnas del padrón (Conex. / Fases).
 * made by leavera77
 */

import { resolverFasesSocio, resolverTipoConexionSocio } from './padron-socio-campos-resolver.js';

/** @type {{ tipo_conexion?: string, fases?: string }|null} */
let _padronSuministroPendiente = null;

/** @param {string} s */
function norm(s) {
    return String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

/**
 * @param {HTMLSelectElement|null} sel
 * @param {string} raw
 */
function asignarValorSelectPadron(sel, raw) {
    if (!sel) return;
    const v = String(raw || '').trim();
    if (!v) return;
    const n = norm(v);
    const options = Array.from(sel.options).filter((o) => o.value);
    let opt = options.find((o) => norm(o.value) === n || norm(o.textContent) === n);
    if (!opt && (n.includes('subter') || n === 'st')) {
        opt = options.find((o) => norm(o.value).includes('subter'));
    }
    if (!opt && (n.includes('aer') || n.includes('aere') || n === 'at' || n === 'mt')) {
        opt = options.find((o) => norm(o.value).includes('aer'));
    }
    if (!opt && (n.includes('tri') || n === '3f')) {
        opt = options.find((o) => norm(o.value).includes('tri'));
    }
    if (!opt && (n.includes('mono') || n === '1f')) {
        opt = options.find((o) => norm(o.value).includes('mono'));
    }
    if (!opt) {
        opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        sel.appendChild(opt);
    }
    sel.value = opt.value;
    try {
        sel.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (_) {}
}

/**
 * @param {Record<string, unknown>|null|undefined} row
 */
export function guardarSuministroPadronDesdeFila(row) {
    if (!row) {
        _padronSuministroPendiente = null;
        return;
    }
    _padronSuministroPendiente = {
        tipo_conexion: resolverTipoConexionSocio(row),
        fases: resolverFasesSocio(row),
    };
}

export function limpiarSuministroPadronPendiente() {
    _padronSuministroPendiente = null;
}

/** Reaplica conexión/fases del último socio cargado (p. ej. al elegir tipo de reclamo). */
export function reaplicarSuministroPadronPendiente() {
    if (!_padronSuministroPendiente) return false;
    aplicarSuministroElectricoDesdePadron(_padronSuministroPendiente);
    return !!(
        _padronSuministroPendiente.tipo_conexion && _padronSuministroPendiente.fases
    );
}

/**
 * @param {Record<string, unknown>|null|undefined} row
 */
export function aplicarSuministroElectricoDesdePadron(row) {
    const tc = resolverTipoConexionSocio(row);
    const fa = resolverFasesSocio(row);
    asignarValorSelectPadron(document.getElementById('ped-sum-conexion'), tc);
    asignarValorSelectPadron(document.getElementById('ped-sum-fases'), fa);
}
