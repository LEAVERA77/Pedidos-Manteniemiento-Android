/**
 * Barra header `#web-coords-converter`: par Lat / Lon (columna A entrada, B resultado).
 * made by leavera77
 */

import { decimalToDmsLite, dmsToDecimalLite } from './utils.js';

function parseDecimalUnCampo(raw) {
    const t = String(raw || '').trim().replace(/\s/g, '').replace(',', '.');
    if (!t) return Number.NaN;
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : Number.NaN;
}

/**
 * @param {'lat'|'lon'} eje — GMS con N/S vs E/O
 */
function convertirFila(mode, aEl, bEl, eje) {
    const ejeLat = eje === 'lat';
    const rawA = String(aEl?.value || '').trim();
    if (!rawA) {
        if (bEl) bEl.value = '';
        return { ok: true, skip: true };
    }
    if (mode === 'dec_to_dms') {
        const dec = parseDecimalUnCampo(rawA);
        if (!Number.isFinite(dec)) {
            return {
                ok: false,
                skip: false,
                message: ejeLat ? 'Lat: decimal inválido.' : 'Lon: decimal inválido.',
            };
        }
        bEl.value = decimalToDmsLite(dec, ejeLat);
        return { ok: true, skip: false, out: bEl.value };
    }
    const dec = dmsToDecimalLite(rawA);
    if (!Number.isFinite(dec)) {
        return {
            ok: false,
            skip: false,
            message: ejeLat ? 'Lat: GMS inválido (ej. 31°34\'8.4"S).' : 'Lon: GMS inválido (ej. 60°30\'0"O).',
        };
    }
    bEl.value = dec.toFixed(7);
    return { ok: true, skip: false, out: bEl.value };
}

function obtenerParInputs() {
    return {
        aLat: document.getElementById('web-coords-converter-a-lat'),
        bLat: document.getElementById('web-coords-converter-b-lat'),
        aLon: document.getElementById('web-coords-converter-a-lon'),
        bLon: document.getElementById('web-coords-converter-b-lon'),
    };
}

function limpiarPar(par, out) {
    if (par.aLat) par.aLat.value = '';
    if (par.bLat) par.bLat.value = '';
    if (par.aLon) par.aLon.value = '';
    if (par.bLon) par.bLon.value = '';
    if (out) out.textContent = '';
}

function applyPlaceholders(mode, par) {
    const { aLat, bLat, aLon, bLon } = par;
    if (!aLat || !bLat || !aLon || !bLon) return;
    if (mode === 'dec_to_dms') {
        aLat.placeholder = 'Lat decimal';
        bLat.placeholder = 'Lat GMS';
        aLon.placeholder = 'Lon decimal';
        bLon.placeholder = 'Lon GMS';
    } else {
        aLat.placeholder = 'Lat GMS';
        bLat.placeholder = 'Lat decimal';
        aLon.placeholder = 'Lon GMS';
        bLon.placeholder = 'Lon decimal';
    }
}

/** Convierte todas las filas con A no vacío; exige al menos una. */
function convertirParCompleto(mode, par) {
    const hasLat = String(par.aLat?.value || '').trim();
    const hasLon = String(par.aLon?.value || '').trim();
    if (!hasLat && !hasLon) {
        return { ok: false, message: 'Ingresá latitud y/o longitud en la columna izquierda.' };
    }
    const piezas = [];
    if (hasLat) {
        const r = convertirFila(mode, par.aLat, par.bLat, 'lat');
        if (!r.ok) return { ok: false, message: r.message || 'Error latitud' };
        if (!r.skip && r.out) piezas.push(r.out);
    } else if (par.bLat) par.bLat.value = '';
    if (hasLon) {
        const r = convertirFila(mode, par.aLon, par.bLon, 'lon');
        if (!r.ok) return { ok: false, message: r.message || 'Error longitud' };
        if (!r.skip && r.out) piezas.push(r.out);
    } else if (par.bLon) par.bLon.value = '';
    return { ok: true, message: piezas.join(' · ') };
}

function intercambiarModoYValores(modeEl, par, out, ctx) {
    const cur = modeEl.value;
    const r = convertirParCompleto(cur, par);
    if (!r.ok) {
        if (out) out.textContent = r.message || 'Error';
        return;
    }
    if (out) out.textContent = r.message || '';
    const next = cur === 'dec_to_dms' ? 'dms_to_dec' : 'dec_to_dms';
    ctx.syncingMode = true;
    try {
        modeEl.value = next;
    } finally {
        ctx.syncingMode = false;
    }
    for (const [ae, be] of [
        [par.aLat, par.bLat],
        [par.aLon, par.bLon],
    ]) {
        if (!ae || !be) continue;
        const ta = ae.value;
        ae.value = be.value;
        be.value = ta;
    }
    applyPlaceholders(next, par);
}

function soloConvertir(modeEl, par, out) {
    const r = convertirParCompleto(modeEl.value, par);
    if (out) out.textContent = r.ok ? r.message || '' : r.message || 'Error';
}

export function installWebCoordsConverterBar(esAndroidWebViewMapaFn) {
    const wrap = document.getElementById('web-coords-converter');
    const mode = document.getElementById('web-coords-converter-mode');
    const run = document.getElementById('web-coords-converter-run');
    const out = document.getElementById('web-coords-converter-out');
    const par = obtenerParInputs();
    if (!wrap || !mode || !run || !out || !par.aLat || !par.bLat || !par.aLon || !par.bLon) return;

    const visible = typeof esAndroidWebViewMapaFn !== 'function' || !esAndroidWebViewMapaFn();
    wrap.style.display = visible ? 'inline-flex' : 'none';
    out.style.display = visible ? 'inline' : 'none';
    if (!visible || run.dataset.bound === '1') return;
    run.dataset.bound = '1';

    let prevMode = mode.value;
    const ctx = { syncingMode: false };
    applyPlaceholders(mode.value, par);

    run.addEventListener('click', () => {
        try {
            intercambiarModoYValores(mode, par, out, ctx);
            prevMode = mode.value;
        } catch (_) {}
    });

    mode.addEventListener('change', () => {
        if (ctx.syncingMode) {
            prevMode = mode.value;
            applyPlaceholders(mode.value, par);
            return;
        }
        if (mode.value === prevMode) return;
        limpiarPar(par, out);
        prevMode = mode.value;
        applyPlaceholders(mode.value, par);
    });

    const onEnter = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            soloConvertir(mode, par, out);
        }
    };
    par.aLat.addEventListener('keydown', onEnter);
    par.bLat.addEventListener('keydown', onEnter);
    par.aLon.addEventListener('keydown', onEnter);
    par.bLon.addEventListener('keydown', onEnter);
}
