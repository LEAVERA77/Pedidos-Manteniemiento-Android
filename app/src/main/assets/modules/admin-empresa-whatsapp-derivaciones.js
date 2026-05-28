/**
 * Config empresa: áreas WhatsApp AR y formulario derivaciones.
 * made by leavera77
 */
import { quitarMovil9Tras54Digitos } from './normalizar-telefono.js';
import {
    poblarDerivacionesListasDesdeCfg,
    refreshDerivacionListaWaButtons,
} from './derivaciones-reclamos-admin.js';

/** @type {Record<string, unknown> | null} */
let _deps = null;

export function setAdminEmpresaWhatsappDerivacionesDeps(d) {
    _deps = d && typeof d === 'object' ? d : null;
}

function toast(msg, type) {
    _deps?.toast?.(msg, type);
}

function setDerivacionesInlineError(msg) {
    _deps?.setDerivacionesInlineError?.(msg);
}

export function wireAbrirWhatsappDerivacionFormWindow() {
    if (typeof window !== 'undefined') window.abrirWhatsappDerivacionForm = abrirWhatsappDerivacionForm;
}

/** Mapa localidad → característica (solo dígitos de área) para normalizar móviles AR en difusiones. */
export function parseWhatsappArAreasPorLocalidadTextarea(text) {
    const out = {};
    for (const line0 of String(text || '').split(/\r?\n/)) {
        const line = line0.trim();
        if (!line || line.startsWith('#')) continue;
        let loc = '';
        let area = '';
        const tab = line.indexOf('\t');
        if (tab !== -1) {
            loc = line.slice(0, tab).trim();
            area = (line.slice(tab + 1).trim().match(/^\d+/) || [''])[0];
        } else if (line.includes('|')) {
            const pipe = line.indexOf('|');
            loc = line.slice(0, pipe).trim();
            area = (line.slice(pipe + 1).trim().match(/^\d+/) || [''])[0];
        } else {
            const m = line.match(/^(.+?)[\s,]+(\d{2,6})\s*$/);
            if (m) {
                loc = m[1].trim();
                area = m[2];
            }
        }
        if (loc && area) out[loc] = area;
    }
    return out;
}

export function serializeWhatsappArAreasPorLocalidadTextarea(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return '';
    return Object.entries(obj)
        .map(([k, v]) => `${String(k).trim()}\t${String(v).trim().replace(/\D/g, '')}`)
        .filter((row) => row.length > 1)
        .join('\n');
}

export function parseWhatsappArAreaPrefixesInput(text) {
    return String(text || '')
        .split(/[,;\s]+/)
        .map((s) => s.replace(/\D/g, ''))
        .filter((s) => s.length >= 2);
}

export function sincronizarCamposWhatsappArAreaDesdeEmpresaCfg() {
    const ec = window.EMPRESA_CFG || {};
    const d = document.getElementById('cfg-wa-ar-default-area');
    if (d) {
        const v = ec.whatsapp_ar_default_area != null ? ec.whatsapp_ar_default_area : ec.ar_default_area;
        d.value = String(v != null ? v : '')
            .replace(/\D/g, '')
            .slice(0, 6);
    }
    const p = document.getElementById('cfg-wa-ar-area-prefixes');
    if (p) {
        const raw = ec.whatsapp_ar_area_prefixes;
        p.value = Array.isArray(raw) ? raw.join(', ') : typeof raw === 'string' ? raw : '';
    }
    const ta = document.getElementById('cfg-wa-ar-areas-por-localidad');
    if (ta) {
        const m = ec.whatsapp_ar_areas_por_localidad;
        ta.value = m && typeof m === 'object' && !Array.isArray(m) ? serializeWhatsappArAreasPorLocalidadTextarea(m) : '';
    }
}
export function normalizarWhatsappInternacionalDesdeInput(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    const digits = quitarMovil9Tras54Digitos(s.replace(/\D/g, ''));
    if (!digits) return '';
    return `+${digits}`;
}

export function actualizarBotonesWhatsappDerivacionesUi() {
    ['energia', 'agua', 'gas', 'tel', 'policia'].forEach((slot) => {
        const btn = document.getElementById(`cfg-deriv-${slot}-btn-wa`);
        if (!btn) return;
        const act = !!document.getElementById(`cfg-deriv-${slot}-activo`)?.checked;
        const raw = (document.getElementById(`cfg-deriv-${slot}-whatsapp`)?.value || '').trim();
        const w = normalizarWhatsappInternacionalDesdeInput(raw);
        const ok = /^\+\d{8,22}$/.test(w);
        btn.disabled = !(act && ok);
    });
    try {
        refreshDerivacionListaWaButtons(normalizarWhatsappInternacionalDesdeInput);
    } catch (_) {}
}

let _cfgDerivWaInputBound = false;
(function bindPersistenciaTextosDerivacion() {
    try {
        document.addEventListener(
            'input',
            (ev) => {
                const t = ev.target;
                if (!t || !t.id) return;
                if (t.id === 'admin-derivar-motivo') {
                    const dm = document.getElementById('dm');
                    const pid = dm?.dataset?.detallePedidoId;
                    if (pid) {
                        try {
                            sessionStorage.setItem('gn-admin-deriv-motivo-' + pid, t.value);
                        } catch (_) {}
                    }
                    return;
                }
                if (String(t.id).startsWith('tec-sol-deriv-motivo-')) {
                    const pid = String(t.id).replace('tec-sol-deriv-motivo-', '');
                    try {
                        sessionStorage.setItem('gn-tec-deriv-motivo-' + pid, t.value);
                    } catch (_) {}
                }
            },
            true
        );
    } catch (_) {}
})();

export function bindDerivacionesFormInputsOnce() {
    if (_cfgDerivWaInputBound) return;
    _cfgDerivWaInputBound = true;
    ['energia', 'agua', 'gas', 'tel', 'policia'].forEach((slot) => {
        const el = document.getElementById(`cfg-deriv-${slot}-whatsapp`);
        if (el) el.addEventListener('input', () => actualizarBotonesWhatsappDerivacionesUi());
        const nm = document.getElementById(`cfg-deriv-${slot}-nombre`);
        if (nm) nm.addEventListener('input', () => actualizarBotonesWhatsappDerivacionesUi());
        const ac = document.getElementById(`cfg-deriv-${slot}-activo`);
        if (ac) ac.addEventListener('change', () => actualizarBotonesWhatsappDerivacionesUi());
    });
}

export function poblarFormDerivacionesDesdeEmpresaCfg() {
    const dr = (window.EMPRESA_CFG && window.EMPRESA_CFG.derivacion_reclamos) || null;
    let energia = { activo: false, nombre: '', whatsapp: '' };
    let agua = { activo: false, nombre: '', whatsapp: '' };
    let gas = { activo: false, nombre: '', whatsapp: '' };
    let tel = { activo: false, nombre: '', whatsapp: '' };
    let policia = { activo: false, nombre: '', whatsapp: '' };
    if (dr && typeof dr === 'object' && !Array.isArray(dr)) {
        const ee = dr.empresa_energia || {};
        const ca = dr.cooperativa_agua || {};
        energia = {
            activo: !!(ee.whatsapp || ee.nombre),
            nombre: String(ee.nombre != null ? ee.nombre : ''),
            whatsapp: String(ee.whatsapp != null ? ee.whatsapp : ''),
        };
        agua = {
            activo: !!(ca.whatsapp || ca.nombre),
            nombre: String(ca.nombre != null ? ca.nombre : ''),
            whatsapp: String(ca.whatsapp != null ? ca.whatsapp : ''),
        };
        const gsn = dr.empresa_gas_natural || {};
        const tlf = dr.empresa_telefonia || {};
        gas = {
            activo: !!(gsn.whatsapp || gsn.nombre),
            nombre: String(gsn.nombre != null ? gsn.nombre : ''),
            whatsapp: String(gsn.whatsapp != null ? gsn.whatsapp : ''),
        };
        tel = {
            activo: !!(tlf.whatsapp || tlf.nombre),
            nombre: String(tlf.nombre != null ? tlf.nombre : ''),
            whatsapp: String(tlf.whatsapp != null ? tlf.whatsapp : ''),
        };
        const pol = dr.policia || {};
        policia = {
            activo: !!(pol.whatsapp || pol.nombre),
            nombre: String(pol.nombre != null ? pol.nombre : ''),
            whatsapp: String(pol.whatsapp != null ? pol.whatsapp : ''),
        };
    } else {
        const der = (window.EMPRESA_CFG && window.EMPRESA_CFG.derivaciones) || {};
        const e = der.energia || {};
        const a = der.agua || {};
        energia = {
            activo: !!e.activo,
            nombre: String(e.nombre != null ? e.nombre : ''),
            whatsapp: String(e.whatsapp != null ? e.whatsapp : ''),
        };
        agua = {
            activo: !!a.activo,
            nombre: String(a.nombre != null ? a.nombre : ''),
            whatsapp: String(a.whatsapp != null ? a.whatsapp : ''),
        };
    }
    const slots = [
        { key: 'energia', s: energia },
        { key: 'agua', s: agua },
        { key: 'gas', s: gas },
        { key: 'tel', s: tel },
        { key: 'policia', s: policia },
    ];
    slots.forEach(({ key, s }) => {
        const ca = document.getElementById(`cfg-deriv-${key}-activo`);
        const cn = document.getElementById(`cfg-deriv-${key}-nombre`);
        const cw = document.getElementById(`cfg-deriv-${key}-whatsapp`);
        if (ca) ca.checked = !!s.activo;
        if (cn) cn.value = s.nombre;
        if (cw) cw.value = s.whatsapp;
    });
    try {
        poblarDerivacionesListasDesdeCfg(dr && typeof dr === 'object' ? dr : {}, {
            normalizarWhatsappInternacionalDesdeInput,
            toast,
            setDerivacionesInlineError,
            onChange: actualizarBotonesWhatsappDerivacionesUi,
        });
    } catch (_) {}
    actualizarBotonesWhatsappDerivacionesUi();
}

export function abrirWhatsappDerivacionForm(slot) {
    const act = !!document.getElementById(`cfg-deriv-${slot}-activo`)?.checked;
    const raw = (document.getElementById(`cfg-deriv-${slot}-whatsapp`)?.value || '').trim();
    const w = normalizarWhatsappInternacionalDesdeInput(raw);
    if (!act) {
        toast('Activá la derivación para usar WhatsApp.', 'info');
        return;
    }
    if (!w || !/^\+\d{8,22}$/.test(w)) {
        toast('WhatsApp no válido: usá formato internacional con + (8 a 22 dígitos).', 'error');
        return;
    }
    window.open(`https://wa.me/${w.slice(1)}`, '_blank', 'noopener,noreferrer');
}


/** Dígitos wa.me desde `EMPRESA_CFG.derivaciones` (+ opcional o solo dígitos). */
export function digitosWhatsAppDerivacionEmpresaCfg(slot) {
    const d = (window.EMPRESA_CFG?.derivaciones || {})[slot];
    if (!d || !d.activo) return '';
    const raw = String(d.whatsapp || '').trim();
    if (!raw) return '';
    const dg = raw.replace(/\D/g, '');
    if (dg.length >= 10 && dg.length <= 15) return dg;
    return '';
}

export function obtenerWaMeUrlDerivacionEmpresaCfg(slot) {
    const dg = digitosWhatsAppDerivacionEmpresaCfg(slot);
    return dg ? `https://wa.me/${dg}` : '';
}
