/**
 * Barra header `#web-coords-converter`: lat + lon en A/B; resultado en `#web-coords-converter-out`.
 * made by leavera77
 */

import { decimalToDmsLite, dmsToDecimalLite } from './utils.js';

function parseDecimalUnCampo(raw) {
    const t = String(raw || '').trim().replace(/\s/g, '').replace(',', '.');
    if (!t) return Number.NaN;
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : Number.NaN;
}

/** Convierte par lat/lon según modo; resultado solo en texto (para `#web-coords-converter-out`). */
function convertirParEnTexto(mode, aEl, bEl) {
    const rawA = String(aEl?.value || '').trim();
    const rawB = String(bEl?.value || '').trim();
    if (!rawA && !rawB) {
        return { ok: false, message: 'Ingresá latitud y/o longitud.' };
    }
    if (mode === 'dec_to_dms') {
        const piezas = [];
        if (rawA) {
            const dec = parseDecimalUnCampo(rawA);
            if (!Number.isFinite(dec)) return { ok: false, message: 'Latitud decimal inválida.' };
            piezas.push(decimalToDmsLite(dec, true));
        }
        if (rawB) {
            const dec = parseDecimalUnCampo(rawB);
            if (!Number.isFinite(dec)) return { ok: false, message: 'Longitud decimal inválida.' };
            piezas.push(decimalToDmsLite(dec, false));
        }
        return { ok: true, message: piezas.join(' · ') };
    }
    const piezas = [];
    if (rawA) {
        const dec = dmsToDecimalLite(rawA);
        if (!Number.isFinite(dec)) return { ok: false, message: 'Latitud GMS inválida.' };
        piezas.push(dec.toFixed(7));
    }
    if (rawB) {
        const dec = dmsToDecimalLite(rawB);
        if (!Number.isFinite(dec)) return { ok: false, message: 'Longitud GMS inválida.' };
        piezas.push(dec.toFixed(7));
    }
    return { ok: true, message: piezas.join(' · ') };
}

function limpiar(a, b, out) {
    if (a) a.value = '';
    if (b) b.value = '';
    if (out) out.textContent = '';
}

function applyPlaceholders(mode, a, b) {
    if (!a || !b) return;
    if (mode === 'dec_to_dms') {
        a.placeholder = 'Lat decimal';
        b.placeholder = 'Lon decimal';
    } else {
        a.placeholder = 'Lat GMS';
        b.placeholder = 'Lon GMS';
    }
}

function ejecutarConversion(modeEl, a, b, out) {
    const r = convertirParEnTexto(modeEl.value, a, b);
    if (out) out.textContent = r.ok ? r.message || '' : r.message || 'Error';
}

export function installWebCoordsConverterBar(esAndroidWebViewMapaFn) {
    const wrap = document.getElementById('web-coords-converter');
    const mode = document.getElementById('web-coords-converter-mode');
    const a = document.getElementById('web-coords-converter-a');
    const b = document.getElementById('web-coords-converter-b');
    const run = document.getElementById('web-coords-converter-run');
    const out = document.getElementById('web-coords-converter-out');
    if (!wrap || !mode || !a || !b || !run || !out) return;

    const visible = typeof esAndroidWebViewMapaFn !== 'function' || !esAndroidWebViewMapaFn();
    wrap.style.display = visible ? 'inline-flex' : 'none';
    if (out) out.style.display = visible ? 'block' : 'none';
    if (!visible || run.dataset.bound === '1') return;
    run.dataset.bound = '1';

    let prevMode = mode.value;
    applyPlaceholders(mode.value, a, b);

    run.addEventListener('click', () => {
        try {
            ejecutarConversion(mode, a, b, out);
        } catch (_) {}
    });

    mode.addEventListener('change', () => {
        if (mode.value === prevMode) return;
        limpiar(a, b, out);
        prevMode = mode.value;
        applyPlaceholders(mode.value, a, b);
    });

    const onEnter = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            ejecutarConversion(mode, a, b, out);
        }
    };
    a.addEventListener('keydown', onEnter);
    b.addEventListener('keydown', onEnter);
}
