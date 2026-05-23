/**
 * Ubicación al guardar pedido en oficina: coords en #ped-oficina-estado, Nominatim y mapa.
 * made by leavera77
 */

import { toast } from './ui-utils.js';
import {
    aplicarCoordenadasPedidoOficina,
    esPedidoNuevoModoOficina,
    geocodificarDireccionPedidoOficina,
    pedirUbicacionAproximadaEnMapaPromesa,
} from './pedido-nuevo-oficina.js';

/** @param {string} s */
function parseCoordNum(s) {
    const n = parseFloat(String(s || '').trim().replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
}

/** Lee lat/lng desde #li/#gi, #ped-oficina-estado.sel o app.sel. */
export function leerCoordenadasPedidoOficinaDesdeDom() {
    try {
        if (window.app?.sel) {
            const la = Number(window.app.sel.lat);
            const lo = Number(window.app.sel.lng);
            if (Number.isFinite(la) && Number.isFinite(lo)) return { lat: la, lng: lo };
        }
    } catch (_) {}

    const la = parseCoordNum(document.getElementById('li')?.value);
    const lo = parseCoordNum(document.getElementById('gi')?.value);
    if (Number.isFinite(la) && Number.isFinite(lo)) return { lat: la, lng: lo };

    const est = document.getElementById('ped-oficina-estado');
    if (est?.classList.contains('sel')) {
        const text = est.textContent || '';
        const m = text.match(/(-?\d+[,.]\d+)\s*,\s*(-?\d+[,.]\d+)/);
        if (m) {
            const lat = parseCoordNum(m[1]);
            const lng = parseCoordNum(m[2]);
            if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
        }
    }
    return null;
}

/**
 * @param {Parameters<typeof aplicarCoordenadasPedidoOficina>[0]} deps
 */
export async function sincronizarSelDesdeDomPedidoOficina(deps) {
    const c = leerCoordenadasPedidoOficinaDesdeDom();
    if (!c) return false;
    return aplicarCoordenadasPedidoOficina(deps, c.lat, c.lng, { silencioso: true });
}

/**
 * @param {Parameters<typeof aplicarCoordenadasPedidoOficina>[0]} deps
 * @returns {Promise<{ ok: boolean, lat?: number, lng?: number, fuente?: string }>}
 */
export async function prepararUbicacionSubmitPedidoOficina(deps) {
    if (!esPedidoNuevoModoOficina()) {
        if (!window.app?.sel) return { ok: false };
        return { ok: true, lat: window.app.sel.lat, lng: window.app.sel.lng, fuente: 'mapa' };
    }

    let coords = leerCoordenadasPedidoOficinaDesdeDom();
    if (coords) {
        await aplicarCoordenadasPedidoOficina(deps, coords.lat, coords.lng, { silencioso: true });
        return { ok: true, lat: coords.lat, lng: coords.lng, fuente: 'estado' };
    }

    const okGeo = await geocodificarDireccionPedidoOficina(deps);
    if (okGeo && window.app?.sel) {
        return { ok: true, lat: window.app.sel.lat, lng: window.app.sel.lng, fuente: 'nominatim' };
    }

    coords = leerCoordenadasPedidoOficinaDesdeDom();
    if (coords) {
        await aplicarCoordenadasPedidoOficina(deps, coords.lat, coords.lng, { silencioso: true });
        return { ok: true, lat: coords.lat, lng: coords.lng, fuente: 'estado' };
    }

    toast(
        'Falta la ubicación del reclamo. Usá «Buscar dirección» o «Marcar en mapa» para indicar dónde está el problema.',
        'warning',
        6000
    );

    const pick = await pedirUbicacionAproximadaEnMapaPromesa(deps);
    if (pick?.ok && Number.isFinite(pick.lat) && Number.isFinite(pick.lng)) {
        return { ok: true, lat: pick.lat, lng: pick.lng, fuente: 'mapa' };
    }

    if (pick?.cancelado) {
        toast('Guardado cancelado: indicá una ubicación para el reclamo.', 'info');
    }
    return { ok: false };
}

/**
 * @param {Parameters<typeof aplicarCoordenadasPedidoOficina>[0] & {
 *   esc?: (v: unknown) => string,
 *   ejecutarSql?: (q: string) => Promise<unknown>,
 *   neonOk?: boolean,
 *   modoOffline?: boolean,
 *   cargarPedidos?: () => void,
 *   render?: () => void,
 * }} deps
 * @param {{
 *   lat: number,
 *   lng: number,
 *   numPedido?: string,
 *   calleVal?: string,
 *   numVal?: string,
 *   locVal?: string,
 * }} ctx
 */
export async function finalizarPedidoOficinaTrasGuardar(deps, ctx) {
    let la = Number(ctx.lat);
    let lo = Number(ctx.lng);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return;

    const calle = String(ctx.calleVal || '').trim();
    const num = String(ctx.numVal || '').trim();
    const loc = String(ctx.locVal || '').trim();
    const prov =
        String(
            window.EMPRESA_CFG?.provincia ||
                window.EMPRESA_CFG?.state ||
                window.EMPRESA_CFG?.provincia_nominatim ||
                'Entre Ríos'
        ).trim() || 'Entre Ríos';

    if ((calle || loc) && typeof deps.nominatimFetchSearch === 'function') {
        try {
            const calleNum = [calle, num].filter(Boolean).join(' ');
            const q = [calleNum, loc, prov, 'Argentina'].filter(Boolean).join(', ');
            const raw = await deps.nominatimFetchSearch({
                q,
                countrycodes: 'ar',
                limit: '5',
                addressdetails: '1',
            });
            const arr = Array.isArray(raw) ? raw : [];
            let hit = arr[0];
            if (loc && arr.length > 1) {
                const locL = loc.toLowerCase();
                hit =
                    arr.find((r) => String(r?.display_name || '').toLowerCase().includes(locL)) ||
                    hit;
            }
            if (hit?.lat != null && hit?.lon != null) {
                la = Number(hit.lat);
                lo = Number(hit.lon);
            }
        } catch (e) {
            console.warn('[pedido-oficina-post-nominatim]', e?.message || e);
        }
    }

    const np = ctx.numPedido;
    if (
        np &&
        typeof deps.ejecutarSql === 'function' &&
        typeof deps.esc === 'function' &&
        deps.neonOk &&
        !deps.modoOffline
    ) {
        try {
            await deps.ejecutarSql(
                `UPDATE pedidos SET lat = ${deps.esc(la)}, lng = ${deps.esc(lo)} WHERE numero_pedido = ${deps.esc(np)}`
            );
        } catch (e) {
            console.warn('[pedido-oficina-update-coords]', e?.message || e);
        }
    }

    await aplicarCoordenadasPedidoOficina(deps, la, lo, { silencioso: true });

    try {
        if (typeof deps.cargarPedidos === 'function') deps.cargarPedidos();
        if (typeof deps.render === 'function') deps.render();
    } catch (_) {}

    toast('Reclamo ubicado en el mapa.', 'success', 3500);
}
