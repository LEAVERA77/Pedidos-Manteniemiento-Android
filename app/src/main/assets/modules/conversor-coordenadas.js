/**
 * Barra header `#web-coords-converter`: un valor en A, resultado en B (modo según selector).
 * made by leavera77
 */

import { decimalToDmsLite, dmsToDecimalLite } from './utils.js';

/** Heurística sur/cono sur: |lon| suele > ~54; |lat| suele ≤ ~54. */
function inferEsLatitudParaDms(dec) {
    const a = Math.abs(Number(dec));
    if (!Number.isFinite(a)) return true;
    if (a > 90) return false;
    if (a > 54.5) return false;
    return true;
}

function parseDecimalUnCampo(raw) {
    const t = String(raw || '').trim().replace(/\s/g, '').replace(',', '.');
    if (!t) return Number.NaN;
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : Number.NaN;
}

/**
 * Convierte según modo actual: entrada en A, salida en B.
 * @returns {{ ok: boolean, message?: string }}
 */
export function convertirWebCoordsUnCampo(mode, aEl, bEl) {
    if (mode === 'dec_to_dms') {
        const dec = parseDecimalUnCampo(aEl?.value);
        if (!Number.isFinite(dec)) {
            return { ok: false, message: 'Ingresá un decimal válido en el primer campo.' };
        }
        const isLat = inferEsLatitudParaDms(dec);
        bEl.value = decimalToDmsLite(dec, isLat);
        return { ok: true, message: `${bEl.value}` };
    }
    const rawGms = String(aEl?.value || '').trim();
    if (!rawGms) {
        return { ok: false, message: 'Ingresá grados minutos segundos en el primer campo.' };
    }
    const dec = dmsToDecimalLite(rawGms);
    if (!Number.isFinite(dec)) {
        return { ok: false, message: 'Formato GMS no reconocido (ej. 31°33\'57.6"S).' };
    }
    bEl.value = dec.toFixed(7);
    return { ok: true, message: bEl.value };
}

function limpiarCampos(a, b, out) {
    if (a) a.value = '';
    if (b) b.value = '';
    if (out) out.textContent = '';
}

function applyPlaceholders(mode, a, b) {
    if (!a || !b) return;
    if (mode === 'dec_to_dms') {
        a.placeholder = 'Decimal (ej. -31.566)';
        b.placeholder = 'Resultado GMS';
    } else {
        a.placeholder = 'GMS (ej. 31°33\'57.6"S)';
        b.placeholder = 'Decimal resultante';
    }
}

/**
 * ↔: convierte A→B con el modo actual, cambia el modo e intercambia contenidos de A/B
 * (queda coherente con el nuevo modo: lo que era resultado pasa a ser entrada).
 */
function intercambiarModoYValores(modeEl, a, b, out, ctx) {
    const cur = modeEl.value;
    const r = convertirWebCoordsUnCampo(cur, a, b);
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
    const ta = a.value;
    a.value = b.value;
    b.value = ta;
    applyPlaceholders(next, a, b);
}

/** Enter: solo rellena B desde A, sin cambiar modo. */
function soloConvertir(modeEl, a, b, out) {
    const r = convertirWebCoordsUnCampo(modeEl.value, a, b);
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
    out.style.display = visible ? 'inline' : 'none';
    if (!visible || run.dataset.bound === '1') return;
    run.dataset.bound = '1';

    let prevMode = mode.value;
    const ctx = { syncingMode: false };
    applyPlaceholders(mode.value, a, b);

    run.addEventListener('click', () => {
        try {
            intercambiarModoYValores(mode, a, b, out, ctx);
            prevMode = mode.value;
        } catch (_) {}
    });

    mode.addEventListener('change', () => {
        if (ctx.syncingMode) {
            prevMode = mode.value;
            applyPlaceholders(mode.value, a, b);
            return;
        }
        if (mode.value === prevMode) return;
        limpiarCampos(a, b, out);
        prevMode = mode.value;
        applyPlaceholders(mode.value, a, b);
    });

    a.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            soloConvertir(mode, a, b, out);
        }
    });
    b.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            soloConvertir(mode, a, b, out);
        }
    });
}
