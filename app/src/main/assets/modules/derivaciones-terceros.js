/**
 * Derivación opcional a terceros al crear pedido (#pm), usando `derivaciones_terceros` en configuración del cliente.
 * made by leavera77
 */

import { quitarMovil9Tras54Digitos } from './normalizar-telefono.js';

function normalizeListaTerceros(entry) {
    if (!entry) return [];
    const out = [];
    const pushValid = (x) => {
        if (!x || typeof x !== 'object') return;
        const dg = String(x.whatsapp || '').replace(/\D/g, '');
        if (dg.length >= 8) {
            out.push({
                nombre: String(x.nombre || '').trim(),
                whatsapp: dg,
                slotKey: null,
            });
        }
    };
    if (Array.isArray(entry)) {
        entry.forEach((x) => pushValid(x));
        return out;
    }
    pushValid(entry);
    return out;
}

export function leerDerivacionesTercerosDesdeEmpresaCfg() {
    const raw =
        (typeof window !== 'undefined' && window.EMPRESA_CFG && window.EMPRESA_CFG.derivaciones_terceros) || {};
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}

/** Todas las empresas terceras configuradas (cualquier clave del objeto). */
export function listarTodosTercerosDerivacionCfg() {
    const raw = leerDerivacionesTercerosDesdeEmpresaCfg();
    const out = [];
    for (const slotKey of Object.keys(raw)) {
        const chunk = normalizeListaTerceros(raw[slotKey]);
        for (const e of chunk) {
            out.push({ ...e, slotKey });
        }
    }
    return out;
}

/** Dígitos para wa.me (sin +). Aplica quitar 9 móvil tras 54 para coincidir con formato esperado en AR. */
export function digitosParaWaMeDesdeRaw(raw) {
    let d = String(raw || '').replace(/\D/g, '');
    if (!d) return '';
    while (d.startsWith('00')) d = d.slice(2);
    d = quitarMovil9Tras54Digitos(d);
    return d;
}

/** +54… para API `whatsapp_tercero` (mínimo 8 dígitos tras +). */
export function internacionalMasDesdeDigitosOTexto(raw) {
    const d = digitosParaWaMeDesdeRaw(raw);
    if (d.length < 10 || d.length > 15) return '';
    return `+${d}`;
}

export function syncDerivacionTerceroNuevoPedidoUI() {
    const wrap = document.getElementById('pf-deriv-tercero-wrap');
    const chk = document.getElementById('pf-deriv-tercero-chk');
    const sel = document.getElementById('pf-deriv-tercero-sel');
    const hint = document.getElementById('pf-deriv-tercero-hint');
    const manual = document.getElementById('pf-deriv-tercero-manual');
    const tt = document.getElementById('tt');
    if (!wrap || !chk || !sel || !tt) return;

    const tipo = String(tt.value || '').trim();
    const debe =
        typeof window.debeMostrarBotonDerivacion === 'function' && window.debeMostrarBotonDerivacion(tipo);

    if (!debe) {
        wrap.style.display = 'none';
        chk.checked = false;
        chk.disabled = false;
        sel.innerHTML = '';
        sel.style.display = 'none';
        if (manual) manual.style.display = 'none';
        if (hint) hint.textContent = '';
        return;
    }

    const lista = listarTodosTercerosDerivacionCfg();
    wrap.style.display = '';
    chk.disabled = false;

    if (lista.length) {
        if (manual) manual.style.display = 'none';
        sel.innerHTML = '';
        lista.forEach((e, i) => {
            const o = document.createElement('option');
            o.value = String(i);
            o.textContent = e.nombre || `WhatsApp …${String(e.whatsapp).slice(-4)}`;
            sel.appendChild(o);
        });
        sel.style.display = chk.checked ? '' : 'none';
        if (hint) {
            hint.textContent =
                'Si marcás la casilla, al guardar se deriva el pedido al tercero: mensaje por WhatsApp (servidor) y seguimiento en el panel.';
        }
    } else {
        sel.innerHTML = '';
        sel.style.display = 'none';
        if (manual) manual.style.display = chk.checked ? '' : 'none';
        if (hint) {
            hint.textContent =
                'Completá *nombre* y *WhatsApp* del tercero (formato internacional, ej. +543434540250) o cargá contactos en Admin → Empresa → derivaciones_terceros.';
        }
    }
}

export function resetDerivacionTerceroNuevoPedidoUI() {
    const wrap = document.getElementById('pf-deriv-tercero-wrap');
    const chk = document.getElementById('pf-deriv-tercero-chk');
    const sel = document.getElementById('pf-deriv-tercero-sel');
    const hint = document.getElementById('pf-deriv-tercero-hint');
    const manual = document.getElementById('pf-deriv-tercero-manual');
    const nom = document.getElementById('pf-deriv-manual-nom');
    const wa = document.getElementById('pf-deriv-manual-wa');
    if (chk) {
        chk.checked = false;
        chk.disabled = false;
    }
    if (sel) {
        sel.innerHTML = '';
        sel.style.display = 'none';
    }
    if (nom) nom.value = '';
    if (wa) wa.value = '';
    if (manual) manual.style.display = 'none';
    if (wrap) wrap.style.display = 'none';
    if (hint) hint.textContent = '';
}

function construirTextoWhatsappDerivacion(payload, terceroNombre) {
    const entidad = String((typeof window !== 'undefined' && window.EMPRESA_CFG?.nombre) || 'GestorNova').trim();
    const lines = [
        `Hola${terceroNombre ? ` ${terceroNombre}` : ''},`,
        '',
        `${entidad} les informa un reclamo para derivación / coordinación.`,
        '',
        `Pedido: ${payload.numPedido}`,
        `Tipo: ${payload.tipoTr}`,
    ];
    if (payload.cliNomVal) lines.push(`Vecino/cliente: ${payload.cliNomVal}`);
    if (payload.desc) lines.push(`Detalle: ${payload.desc}`);
    if (payload.domicilio) lines.push(`Ubicación: ${payload.domicilio}`);
    if (payload.telVal) lines.push(`Tel. contacto: ${payload.telVal}`);
    if (payload.lat != null && payload.lng != null) {
        lines.push(`Coordenadas (WGS84): ${payload.lat}, ${payload.lng}`);
    }
    lines.push('', '— Mensaje generado desde GestorNova');
    return lines.join('\n');
}

/** Tercero elegido si el checkbox está marcado; si no, null. */
export function leerTerceroDerivacionNuevoPedidoSiActivo() {
    const chk = document.getElementById('pf-deriv-tercero-chk');
    if (!chk?.checked) return null;
    const lista = listarTodosTercerosDerivacionCfg();
    const sel = document.getElementById('pf-deriv-tercero-sel');
    if (lista.length) {
        const idx = Math.min(Math.max(parseInt(String(sel?.value || '0'), 10) || 0, 0), lista.length - 1);
        const ent = lista[idx];
        if (!ent?.whatsapp) return null;
        return { nombre: ent.nombre || '', whatsappDigitos: ent.whatsapp, slotKey: ent.slotKey };
    }
    const nom = String(document.getElementById('pf-deriv-manual-nom')?.value || '').trim();
    const waRaw = String(document.getElementById('pf-deriv-manual-wa')?.value || '').trim();
    const intl = internacionalMasDesdeDigitosOTexto(waRaw);
    if (!nom || intl.length < 9) return null;
    return { nombre: nom, whatsappDigitos: intl.replace(/\D/g, ''), slotKey: null };
}

/**
 * Tras guardar el pedido con éxito: abre wa.me al tercero (solo cliente; la derivación operativa va por API si aplica).
 */
export function afterPedidoGuardadoIntentarWhatsappDerivacionTercero(payload) {
    try {
        const t = leerTerceroDerivacionNuevoPedidoSiActivo();
        if (!t?.whatsappDigitos) return;
        const d = digitosParaWaMeDesdeRaw(t.whatsappDigitos);
        if (d.length < 10) return;
        const body = construirTextoWhatsappDerivacion(payload, t.nombre);
        const url = `https://wa.me/${d}?text=${encodeURIComponent(body)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    } catch (_) {}
}

export function initDerivacionesTercerosNuevoPedido() {
    const chk = document.getElementById('pf-deriv-tercero-chk');
    const sel = document.getElementById('pf-deriv-tercero-sel');
    const tt = document.getElementById('tt');
    const manual = document.getElementById('pf-deriv-tercero-manual');
    if (chk && sel && !chk.dataset.gnDerivTercBound) {
        chk.dataset.gnDerivTercBound = '1';
        chk.addEventListener('change', () => {
            const lista = listarTodosTercerosDerivacionCfg();
            if (lista.length) sel.style.display = chk.checked ? '' : 'none';
            if (manual) manual.style.display = !lista.length && chk.checked ? '' : 'none';
        });
    }
    if (tt && !tt.dataset.gnDerivTercBound) {
        tt.dataset.gnDerivTercBound = '1';
        tt.addEventListener('change', () => syncDerivacionTerceroNuevoPedidoUI());
    }
}
