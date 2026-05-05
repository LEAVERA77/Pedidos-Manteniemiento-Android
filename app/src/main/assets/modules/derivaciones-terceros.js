/**
 * Derivación opcional a terceros al crear pedido (WhatsApp), según tipo de trabajo y `derivaciones_terceros` en configuración del cliente.
 * made by leavera77
 */

import { rubroCatalogoTiposReclamo } from './catalogoReclamoPorRubro.js';

/** Motivo de reclamo → clave en `clientes.configuracion.derivaciones_terceros`. */
const SLOT_BY_TIPO_TRABAJO = {
    'Alumbrado Público': 'alumbrado_publico',
    'Alumbrado público apagado': 'alumbrado_publico',
    'Rotura de cañería / Pérdida de agua': 'rotura_caneria',
};

export function configSlotDerivacionTerceroPorTipoTrabajo(tipoTrabajo) {
    return SLOT_BY_TIPO_TRABAJO[String(tipoTrabajo || '').trim()] || null;
}

function derivacionTerceroAplicaParaCatalogoActual(slot) {
    const cat = rubroCatalogoTiposReclamo();
    if (slot === 'alumbrado_publico') return cat === 'municipio';
    if (slot === 'rotura_caneria') return cat === 'cooperativa_agua';
    return false;
}

export function leerDerivacionesTercerosDesdeEmpresaCfg() {
    const raw =
        (typeof window !== 'undefined' && window.EMPRESA_CFG && window.EMPRESA_CFG.derivaciones_terceros) || {};
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}

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
            });
        }
    };
    if (Array.isArray(entry)) {
        entry.forEach(pushValid);
        return out;
    }
    pushValid(entry);
    return out;
}

export function syncDerivacionTerceroNuevoPedidoUI() {
    const wrap = document.getElementById('pf-deriv-tercero-wrap');
    const chk = document.getElementById('pf-deriv-tercero-chk');
    const sel = document.getElementById('pf-deriv-tercero-sel');
    const hint = document.getElementById('pf-deriv-tercero-hint');
    const tt = document.getElementById('tt');
    if (!wrap || !chk || !sel || !tt) return;

    const tipo = String(tt.value || '').trim();
    const slot = configSlotDerivacionTerceroPorTipoTrabajo(tipo);
    const aplica = slot && derivacionTerceroAplicaParaCatalogoActual(slot);

    if (!aplica) {
        wrap.style.display = 'none';
        chk.checked = false;
        chk.disabled = false;
        sel.innerHTML = '';
        sel.style.display = 'none';
        if (hint) hint.textContent = '';
        return;
    }

    const lista = normalizeListaTerceros(leerDerivacionesTercerosDesdeEmpresaCfg()[slot]);
    wrap.style.display = '';

    if (!lista.length) {
        chk.checked = false;
        chk.disabled = true;
        sel.innerHTML = '';
        sel.style.display = 'none';
        if (hint) {
            hint.textContent =
                'Definí el contacto en configuración del cliente (Neon: clientes.configuracion → derivaciones_terceros → ' +
                slot +
                ').';
        }
        return;
    }

    chk.disabled = false;
    sel.innerHTML = '';
    lista.forEach((e, i) => {
        const o = document.createElement('option');
        o.value = String(i);
        o.textContent = e.nombre || `WhatsApp ${e.whatsapp.slice(-4)}`;
        sel.appendChild(o);
    });
    sel.style.display = chk.checked ? '' : 'none';
    if (hint) {
        hint.textContent =
            'Si marcás la casilla, al guardar el pedido se abrirá WhatsApp con un texto sugerido para el tercero.';
    }
}

export function resetDerivacionTerceroNuevoPedidoUI() {
    const wrap = document.getElementById('pf-deriv-tercero-wrap');
    const chk = document.getElementById('pf-deriv-tercero-chk');
    const sel = document.getElementById('pf-deriv-tercero-sel');
    const hint = document.getElementById('pf-deriv-tercero-hint');
    if (chk) {
        chk.checked = false;
        chk.disabled = false;
    }
    if (sel) {
        sel.innerHTML = '';
        sel.style.display = 'none';
    }
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

/**
 * Tras guardar el pedido con éxito: si el usuario marcó derivación y hay WhatsApp configurado, abre wa.me.
 */
export function afterPedidoGuardadoIntentarWhatsappDerivacionTercero(payload) {
    try {
        const chk = document.getElementById('pf-deriv-tercero-chk');
        const sel = document.getElementById('pf-deriv-tercero-sel');
        if (!chk?.checked) return;

        const slot = configSlotDerivacionTerceroPorTipoTrabajo(payload.tipoTr);
        if (!slot || !derivacionTerceroAplicaParaCatalogoActual(slot)) return;

        const lista = normalizeListaTerceros(leerDerivacionesTercerosDesdeEmpresaCfg()[slot]);
        if (!lista.length) return;

        const idx = Math.min(Math.max(parseInt(String(sel?.value || '0'), 10) || 0, 0), lista.length - 1);
        const ent = lista[idx];
        if (!ent?.whatsapp) return;

        const body = construirTextoWhatsappDerivacion(payload, ent.nombre);
        const url = `https://wa.me/${ent.whatsapp}?text=${encodeURIComponent(body)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    } catch (_) {}
}

/** Registra listeners una sola vez (modal nuevo pedido). */
export function initDerivacionesTercerosNuevoPedido() {
    const chk = document.getElementById('pf-deriv-tercero-chk');
    const sel = document.getElementById('pf-deriv-tercero-sel');
    const tt = document.getElementById('tt');
    if (chk && sel && !chk.dataset.gnDerivTercBound) {
        chk.dataset.gnDerivTercBound = '1';
        chk.addEventListener('change', () => {
            sel.style.display = chk.checked ? '' : 'none';
        });
    }
    if (tt && !tt.dataset.gnDerivTercBound) {
        tt.dataset.gnDerivTercBound = '1';
        tt.addEventListener('change', () => syncDerivacionTerceroNuevoPedidoUI());
    }
}
