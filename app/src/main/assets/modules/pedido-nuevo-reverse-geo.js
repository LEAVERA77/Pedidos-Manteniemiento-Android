/**
 * Reverse Nominatim al cargar pedido nuevo (#pm mapa / #pm-oficina): dirección, provincia, CP y barrio (municipio).
 * made by leavera77
 */
import { toast } from './ui-utils.js';
import { extraerProvinciaCpDesdeNominatimAddress } from './pedido-detalle-infer-ubicacion-nominatim.js';
import { aplicarDireccionNominatimRespetandoPadron } from './pedido-nuevo-nominatim-padron-guard.js';
import { aplicarBarrioNominatimEnFormularioNuevoPedido } from './pedido-nuevo-barrio-nominatim.js';

/** @type {Record<string, unknown>|null} */
let _deps = null;
/** @type {string} */
let _ultimaReverseKey = '';

export function setPedidoNuevoReverseGeoDeps(deps) {
    _deps = deps || null;
}

function normBarrio(s) {
    return String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

/** Barrio válido si coincide con una opción de #di2 (catálogo / mapa de barrios). */
export function barrioExisteEnCatalogoMapa(barrio) {
    const b = normBarrio(barrio);
    if (!b) return false;
    const di2 = document.getElementById('di2');
    if (!di2) return false;
    return Array.from(di2.options).some((o) => {
        const v = normBarrio(o.value);
        if (!v) return false;
        return v === b || v.includes(b) || b.includes(v);
    });
}

function barrioDesdeAddress(addr) {
    const a = addr && typeof addr === 'object' ? addr : {};
    return String(a.suburb || a.neighbourhood || a.quarter || a.city_district || '').trim();
}

export function leerProvinciaCpNuevoPedido() {
    const prov = String(document.getElementById('ped-cli-provincia')?.value || '').trim();
    const cp = String(document.getElementById('ped-cli-cp')?.value || '').trim();
    return { provincia: prov || null, codigo_postal: cp || null };
}

function aplicarProvinciaCpEnFormulario(addr) {
    const { provincia, codigo_postal } = extraerProvinciaCpDesdeNominatimAddress(addr);
    const pEl = document.getElementById('ped-cli-provincia');
    const cEl = document.getElementById('ped-cli-cp');
    if (pEl && provincia) pEl.value = provincia;
    if (cEl && codigo_postal) cEl.value = codigo_postal;
}

function aplicarBarrioMunicipioSiEnCatalogo(barrio) {
    const bTrim = String(barrio || '').trim();
    if (!bTrim || !barrioExisteEnCatalogoMapa(bTrim)) return null;
    const di2 = document.getElementById('di2');
    if (!di2) return null;
    let opt = Array.from(di2.options).find((o) => normBarrio(o.value) === normBarrio(bTrim));
    if (!opt) {
        opt = Array.from(di2.options).find(
            (o) =>
                normBarrio(o.textContent).includes(normBarrio(bTrim)) ||
                normBarrio(bTrim).includes(normBarrio(o.value))
        );
    }
    if (!opt) {
        opt = document.createElement('option');
        opt.value = bTrim;
        opt.textContent = bTrim;
        di2.appendChild(opt);
    }
    di2.value = opt.value;
    try {
        di2.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (_) {}
    return opt.value;
}

/**
 * Persiste barrio (solo si está en catálogo), provincia y CP en socios_catalogo si hay NIS/medidor.
 */
export async function enriquecerSociosCatalogoGeoDesdeFormularioNuevoPedido() {
    if (!_deps?.NEON_OK || _deps?.modoOffline?.()) return;
    if (typeof _deps.sqlSimple !== 'function' || typeof _deps.esc !== 'function') return;
    const esMun = typeof _deps.esMunicipioRubro === 'function' && _deps.esMunicipioRubro();
    const nisVal = String(document.getElementById('nis')?.value || '').trim();
    if (!nisVal) return;

    const { provincia, codigo_postal } = leerProvinciaCpNuevoPedido();
    let barrioVal = null;
    if (esMun) {
        const br = String(document.getElementById('di2')?.value || '').trim();
        if (br && barrioExisteEnCatalogoMapa(br)) barrioVal = br;
    }

    if (!barrioVal && !provincia && !codigo_postal) return;

    const sets = [];
    if (barrioVal) {
        sets.push(
            `barrio = CASE WHEN barrio IS NULL OR TRIM(COALESCE(barrio::text, '')) = '' THEN ${_deps.esc(barrioVal)} ELSE barrio END`
        );
    }
    if (provincia) {
        sets.push(
            `provincia = CASE WHEN provincia IS NULL OR TRIM(COALESCE(provincia::text, '')) = '' THEN ${_deps.esc(provincia)} ELSE provincia END`
        );
    }
    if (codigo_postal) {
        sets.push(
            `codigo_postal = CASE WHEN codigo_postal IS NULL OR TRIM(COALESCE(codigo_postal::text, '')) = '' THEN ${_deps.esc(codigo_postal)} ELSE codigo_postal END`
        );
    }
    if (!sets.length) return;

    try {
        let wf = '';
        if (typeof _deps.sociosCatalogoTieneTenantId === 'function' && _deps.sociosCatalogoTieneTenantId()) {
            const tid = typeof _deps.tenantIdActual === 'function' ? _deps.tenantIdActual() : null;
            if (tid != null) wf += ` AND tenant_id = ${_deps.esc(tid)}`;
        }
        await _deps.sqlSimple(
            `UPDATE socios_catalogo SET ${sets.join(', ')}
             WHERE UPPER(TRIM(COALESCE(nis_medidor::text,''))) = UPPER(TRIM(${_deps.esc(nisVal)}))
             AND COALESCE(activo, TRUE) = TRUE${wf}`
        );
    } catch (e) {
        console.warn('[pedido-nuevo-reverse-geo socios]', e?.message || e);
    }
}

async function fetchReverseNominatim(lat, lng) {
    const la = Number(lat);
    const lo = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
    if (typeof fetch !== 'function') return null;
    const apiUrl = _deps?.apiUrl;
    const asegurarJwt = _deps?.asegurarJwtApiRest;
    const getToken = _deps?.getApiToken;
    if (typeof apiUrl !== 'function' || typeof asegurarJwt !== 'function') return null;
    if (_deps?.modoOffline?.()) return null;
    try {
        await asegurarJwt();
        const token = typeof getToken === 'function' ? getToken() : '';
        if (!token) return null;
        const r = await fetch(apiUrl('/api/geocode/nominatim/reverse'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ lat: la, lon: lo, zoom: 18 }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok || !j.result) return null;
        return j.result;
    } catch (e) {
        console.warn('[pedido-nuevo-reverse-geo]', e?.message || e);
        return null;
    }
}

/**
 * Reverse Nominatim → formulario nuevo pedido (mapa, oficina, GPS).
 */
export async function reverseNominatimNuevoPedidoCore(lat, lng) {
    const la = Number(lat);
    const lo = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return;

    const key = `${la.toFixed(5)},${lo.toFixed(5)}`;
    if (_ultimaReverseKey === key) return;
    _ultimaReverseKey = key;

    const hit = await fetchReverseNominatim(la, lo);
    if (!hit) {
        try {
            _deps?.toast?.(
                'No se obtuvo dirección para ese punto. Probá otro clic o revisá la conexión/API.',
                'warning'
            );
        } catch (_) {}
        return;
    }

    const addr = hit.address || {};
    aplicarDireccionNominatimRespetandoPadron(addr, {
        esMunicipioRubro: () =>
            typeof _deps?.esMunicipioRubro === 'function' && _deps.esMunicipioRubro(),
    });
    aplicarProvinciaCpEnFormulario(addr);

    const esMun = typeof _deps?.esMunicipioRubro === 'function' && _deps.esMunicipioRubro();
    if (esMun) {
        const brNom = barrioDesdeAddress(addr);
        if (brNom) aplicarBarrioMunicipioSiEnCatalogo(brNom);
    } else {
        aplicarBarrioNominatimEnFormularioNuevoPedido(addr);
    }

    if (esMun) void enriquecerSociosCatalogoGeoDesdeFormularioNuevoPedido();
}

export function programarReverseNominatimFormularioNuevoPedidoDesdeMapa(lat, lng) {
    const la = Number(lat);
    const lo = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return;
    setTimeout(() => {
        void reverseNominatimNuevoPedidoCore(la, lo);
    }, 0);
}

export function invalidatePedidoNuevoReverseGeoKey() {
    _ultimaReverseKey = '';
}

export function resetPedidoNuevoReverseGeoCache() {
    invalidatePedidoNuevoReverseGeoKey();
    const pEl = document.getElementById('ped-cli-provincia');
    const cEl = document.getElementById('ped-cli-cp');
    if (pEl) pEl.value = '';
    if (cEl) cEl.value = '';
}

if (typeof window !== 'undefined') {
    window.programarReverseNominatimFormularioNuevoPedidoDesdeMapa =
        programarReverseNominatimFormularioNuevoPedidoDesdeMapa;
}
