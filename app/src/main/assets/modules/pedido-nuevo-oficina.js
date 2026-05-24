/**
 * Pedido nuevo en oficina (admin web): modal sin clic previo en mapa; geocodificación Nominatim.
 * made by leavera77
 */

import { toast } from './ui-utils.js';
import { getApp } from './gn-app-global-bridge.js';
import { resetPadronNuevoPedidoNisTimers } from './pedido-nuevo-padron-busqueda.js';

let _modoOficina = false;
let _mapPickHandler = null;
/** @type {((r: { ok: boolean, lat?: number, lng?: number, cancelado?: boolean }) => void)|null} */
let _mapPickResolver = null;
let _formMontado = false;
/** @type {Record<string, unknown>|null} */
let _depsOficina = null;
/** @type {Parameters<typeof aplicarCoordenadasPedidoOficina>[0]|null} */
let _coordDepsRegistrados = null;

/** Monta #pf desde &lt;template id="pm-form-template"&gt; en #pm-form-home. */
export function mountPedidoFormularioEnDom() {
    if (_formMontado || document.getElementById('pf')) {
        _formMontado = true;
        return;
    }
    const tpl = document.getElementById('pm-form-template');
    const home = document.getElementById('pm-form-home');
    if (!tpl || !home) return;
    home.appendChild(tpl.content.cloneNode(true));
    _formMontado = true;
}

export function esPedidoNuevoModoOficina() {
    if (_modoOficina) return true;
    try {
        const mo = document.getElementById('pm-oficina');
        if (mo?.classList.contains('active')) return true;
    } catch (_) {}
    return false;
}

function esEntornoWebPublico() {
    try {
        if (/GestorNova\/|Nexxo\//i.test(navigator.userAgent)) return false;
        if (window.location.protocol === 'file:') return false;
        if (document.documentElement.classList.contains('gn-android-webview')) return false;
    } catch (_) {
        return false;
    }
    return true;
}

function esAdminWebPublico(deps) {
    const d = deps || _depsOficina || {};
    if (typeof d.esAdminSesionWebPublica === 'function') return d.esAdminSesionWebPublica();
    if (!esEntornoWebPublico()) return false;
    try {
        return typeof window.esAdmin === 'function' && window.esAdmin();
    } catch (_) {
        return false;
    }
}

/** Admin en navegador (no WebView): pedido nuevo desde coords usa #pm-oficina. */
export function esAdminWebPedidoNuevoOficina(deps) {
    return esAdminWebPublico(deps);
}

/**
 * Muestra u oculta el FAB «Pedido en oficina» (tras login admin en web).
 * @param {Parameters<typeof initPedidoNuevoOficina>[0]} [deps]
 */
export function syncVisibilidadBotonPedidoOficina(deps) {
    const btn = document.getElementById('btn-mapa-nuevo-oficina');
    if (!btn) return;
    const show = esAdminWebPublico(deps);
    btn.style.display = show ? 'flex' : 'none';
    btn.hidden = !show;
    btn.setAttribute('aria-hidden', show ? 'false' : 'true');
}

function bindVisibilidadFabOficina(deps) {
    const sync = () => syncVisibilidadBotonPedidoOficina(deps);
    try {
        const obs = new MutationObserver(() => {
            if (
                document.body.classList.contains('gn-sesion-activa') ||
                document.getElementById('ms')?.classList.contains('active')
            ) {
                sync();
            }
        });
        obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        const ms = document.getElementById('ms');
        if (ms) obs.observe(ms, { attributes: true, attributeFilter: ['class'] });
    } catch (_) {}
    try {
        window.addEventListener('gn-empresa-cfg-actualizada', sync);
        window.addEventListener('focus', sync);
    } catch (_) {}
    sync();
    setTimeout(sync, 400);
    setTimeout(sync, 2000);
}

function moverFormularioA(homeId) {
    const pf = document.getElementById('pf');
    const home = document.getElementById(homeId);
    if (!pf || !home) return;
    home.appendChild(pf);
}

function setModoOficinaUi(activo) {
    _modoOficina = !!activo;
    const wrapOf = document.getElementById('ped-oficina-ubicacion-wrap');
    const wrapMap = document.getElementById('ped-mapa-ubicacion-wrap');
    if (wrapOf) wrapOf.style.display = activo ? '' : 'none';
    if (wrapMap) wrapMap.style.display = activo ? 'none' : '';
    try {
        document.getElementById('pm')?.classList.toggle('pm--solo-mapa', !activo);
        document.getElementById('pm-oficina')?.classList.toggle('pm-oficina--activo', activo);
    } catch (_) {}
}

function provinciaEmpresa() {
    const ec = typeof window !== 'undefined' ? window.EMPRESA_CFG || {} : {};
    return String(ec.provincia || ec.state || ec.provincia_nominatim || 'Entre Ríos').trim();
}

function buildQueryDireccion() {
    const calle = (document.getElementById('ped-cli-calle')?.value || '').trim();
    const num = (document.getElementById('ped-cli-num')?.value || '').trim();
    const loc = (document.getElementById('ped-cli-loc')?.value || '').trim();
    const prov = provinciaEmpresa();
    const calleNum = [calle, num].filter(Boolean).join(' ');
    if (!calleNum && !loc) return null;
    const q = [calleNum, loc, prov, 'Argentina'].filter(Boolean).join(', ');
    return { q, calleNum, loc, prov };
}

/**
 * @param {{
 *   htmlLineaUbicacionFormulario: (lat: number, lng: number, acc?: unknown) => string,
 *   syncWrapCoordsDisplayNuevoPedido?: () => void,
 *   mostrarMarcadorUbicacion?: (lat: number, lng: number, acc?: unknown) => number,
 *   ensureMapReady?: () => Promise<void>,
 * }} deps
 * @param {number} lat
 * @param {number} lng
 * @param {{ silencioso?: boolean }} [opts]
 */
/** @param {number} lat @param {number} lng */
export function crearSeleccionMapaDesdeCoords(lat, lng) {
    const la = Number(lat);
    const lo = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
    const Lref = typeof window !== 'undefined' ? window.L : null;
    if (Lref && typeof Lref.latLng === 'function') {
        try {
            return Lref.latLng(la, lo);
        } catch (_) {}
    }
    return { lat: la, lng: lo };
}

export async function aplicarCoordenadasPedidoOficina(deps, lat, lng, opts = {}) {
    const la = Number(lat);
    const lo = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return false;

    const sel = crearSeleccionMapaDesdeCoords(la, lo);
    if (!sel) return false;
    const app = getApp();
    if (app) app.sel = sel;

    const li = document.getElementById('li');
    const gi = document.getElementById('gi');
    if (li) li.value = String(la);
    if (gi) gi.value = String(lo);
    if (typeof deps.syncWrapCoordsDisplayNuevoPedido === 'function') deps.syncWrapCoordsDisplayNuevoPedido();

    const est = document.getElementById('ped-oficina-estado');
    if (est && typeof deps.htmlLineaUbicacionFormulario === 'function') {
        est.innerHTML = deps.htmlLineaUbicacionFormulario(la, lo, null);
        est.className = 'ud sel';
    }

    try {
        if (typeof deps.ensureMapReady === 'function') await deps.ensureMapReady();
        if (typeof deps.mostrarMarcadorUbicacion === 'function') {
            deps.mostrarMarcadorUbicacion(la, lo, null);
        }
        const appMap = getApp()?.map;
        if (appMap) {
            appMap.invalidateSize({ animate: false });
            appMap.setView([la, lo], 16, { animate: false });
        }
    } catch (_) {}

    if (!opts.silencioso) toast('Ubicación aplicada al pedido.', 'success');
    return true;
}

/**
 * @param {{
 *   nominatimFetchSearch: (params: Record<string, unknown>) => Promise<unknown[]>,
 *   htmlLineaUbicacionFormulario: (lat: number, lng: number, acc?: unknown) => string,
 *   syncWrapCoordsDisplayNuevoPedido?: () => void,
 *   mostrarMarcadorUbicacion?: (lat: number, lng: number, acc?: unknown) => number,
 *   ensureMapReady?: () => Promise<void>,
 *   parseEmpresaCfgLatLngBase?: () => { lat: number, lng: number }|null,
 *   resolverUbicacionCentralTenantParaMapa?: () => Promise<{ lat: number, lng: number }|null>,
 * }} deps
 */
export async function geocodificarDireccionPedidoOficina(deps) {
    const built = buildQueryDireccion();
    if (!built) {
        toast('Completá al menos calle o localidad para buscar la ubicación.', 'warning');
        return false;
    }
    if (typeof deps.nominatimFetchSearch !== 'function') {
        toast('Geocodificación no disponible (sin conexión o sesión).', 'error');
        return false;
    }

    const est = document.getElementById('ped-oficina-estado');
    if (est) {
        est.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Buscando dirección…';
        est.className = 'ud';
    }

    try {
        let raw = await deps.nominatimFetchSearch({
            q: built.q,
            countrycodes: 'ar',
            limit: '8',
            addressdetails: '1',
        });
        const arr = Array.isArray(raw) ? raw : [];
        let hit = arr[0];
        if (built.loc && arr.length > 1) {
            const locL = built.loc.toLowerCase();
            hit =
                arr.find((r) => String(r?.display_name || '').toLowerCase().includes(locL)) ||
                hit;
        }
        if (hit && hit.lat != null && hit.lon != null) {
            return aplicarCoordenadasPedidoOficina(deps, Number(hit.lat), Number(hit.lon));
        }

        if (typeof deps.parseEmpresaCfgLatLngBase === 'function') {
            const base = deps.parseEmpresaCfgLatLngBase();
            if (base) {
                toast(
                    'No se encontró la dirección exacta. Se usó la ubicación base de la empresa como aproximación.',
                    'warning'
                );
                return aplicarCoordenadasPedidoOficina(deps, base.lat, base.lng, { silencioso: true });
            }
        }
        if (typeof deps.resolverUbicacionCentralTenantParaMapa === 'function') {
            const central = await deps.resolverUbicacionCentralTenantParaMapa();
            if (central && Number.isFinite(central.lat) && Number.isFinite(central.lng)) {
                toast(
                    'No se encontró la dirección. Se usó el centro del tenant; podés ajustar con «Marcar en mapa».',
                    'warning'
                );
                return aplicarCoordenadasPedidoOficina(deps, central.lat, central.lng, { silencioso: true });
            }
        }

        if (est) {
            est.innerHTML =
                '<i class="fas fa-exclamation-triangle"></i> Sin resultados — usá «Marcar en mapa» para elegir un punto aproximado.';
            est.className = 'ud';
        }
        toast('No se encontró la dirección. Marcá un punto aproximado en el mapa.', 'warning');
        return false;
    } catch (e) {
        if (est) {
            est.innerHTML = '<i class="fas fa-times-circle"></i> Error al geocodificar.';
            est.className = 'ud';
        }
        toast('No se pudo buscar la dirección.', 'error');
        console.warn('[pedido-oficina-geocode]', e?.message || e);
        return false;
    }
}

/**
 * @param {{
 *   ensureMapReady?: () => Promise<void>,
 *   htmlLineaUbicacionFormulario: (lat: number, lng: number, acc?: unknown) => string,
 *   syncWrapCoordsDisplayNuevoPedido?: () => void,
 *   mostrarMarcadorUbicacion?: (lat: number, lng: number, acc?: unknown) => number,
 * }} deps
 */
/**
 * @param {Parameters<typeof aplicarCoordenadasPedidoOficina>[0]} deps
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<{ ok: boolean, lat?: number, lng?: number, cancelado?: boolean }>}
 */
export function pedirUbicacionAproximadaEnMapaPromesa(deps, opts = {}) {
    return new Promise((resolve) => {
        const timeoutMs = opts.timeoutMs ?? 120000;
        let settled = false;
        const finish = (r) => {
            if (settled) return;
            settled = true;
            _mapPickResolver = null;
            clearTimeout(timer);
            resolve(r);
        };

        const timer = setTimeout(() => {
            if (_mapPickHandler && window.app?.map) {
                try {
                    window.app.map.off('click', _mapPickHandler);
                } catch (_) {}
            }
            _mapPickHandler = null;
            const mo = document.getElementById('pm-oficina');
            mo?.classList.remove('pm-oficina--elegir-mapa');
            finish({ ok: false, cancelado: true });
        }, timeoutMs);

        _mapPickResolver = finish;
        void pedirUbicacionAproximadaEnMapa(deps, { onResolved: finish });
    });
}

/**
 * @param {Parameters<typeof aplicarCoordenadasPedidoOficina>[0]} deps
 * @param {{ onResolved?: (r: { ok: boolean, lat?: number, lng?: number }) => void }} [opts]
 */
export async function pedirUbicacionAproximadaEnMapa(deps, opts = {}) {
    try {
        if (typeof deps.ensureMapReady === 'function') await deps.ensureMapReady();
    } catch (_) {}
    const map = window.app?.map;
    const mo = document.getElementById('pm-oficina');
    if (!map || typeof map.once !== 'function') {
        toast('El mapa no está listo.', 'error');
        return;
    }
    if (_mapPickHandler) {
        try {
            map.off('click', _mapPickHandler);
        } catch (_) {}
        _mapPickHandler = null;
    }
    toast('Tocá el mapa en la ubicación aproximada del reclamo.', 'info');
    const est = document.getElementById('ped-oficina-estado');
    if (est) {
        est.innerHTML = '<i class="fas fa-hand-pointer"></i> Esperando clic en el mapa…';
        est.className = 'ud';
    }
    if (mo) {
        mo.classList.add('pm-oficina--elegir-mapa');
        mo.classList.remove('active');
    }

    _mapPickHandler = (e) => {
        const handler = _mapPickHandler;
        _mapPickHandler = null;
        if (mo) {
            mo.classList.remove('pm-oficina--elegir-mapa');
            mo.classList.add('active');
        }
        const la = Number(e?.latlng?.lat);
        const lo = Number(e?.latlng?.lng);
        if (!Number.isFinite(la) || !Number.isFinite(lo)) {
            if (typeof opts.onResolved === 'function') opts.onResolved({ ok: false });
            else if (_mapPickResolver) _mapPickResolver({ ok: false });
            return;
        }
        void aplicarCoordenadasPedidoOficina(deps, la, lo).then(() => {
            const res = { ok: true, lat: la, lng: lo };
            if (typeof opts.onResolved === 'function') opts.onResolved(res);
            else if (_mapPickResolver) _mapPickResolver(res);
        });
    };
    map.once('click', _mapPickHandler);
}

/**
 * Si el socio del padrón trae lat/lon, aplicarlas al pedido en oficina.
 * @param {Record<string, unknown>} row
 */
export async function aplicarCoordsPadronPedidoOficinaSiHay(row) {
    if (!esPedidoNuevoModoOficina() || !_coordDepsRegistrados || !row) return;
    const la = Number(row.latitud ?? row.lat);
    const lo = Number(row.longitud ?? row.lng ?? row.lon);
    if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) < 1e-6 || Math.abs(lo) < 1e-6) {
        return;
    }
    await aplicarCoordenadasPedidoOficina(_coordDepsRegistrados, la, lo, { silencioso: true });
}

/**
 * @param {Parameters<typeof geocodificarDireccionPedidoOficina>[0]} deps
 * @returns {Promise<boolean>}
 */
/** @deprecated Usar prepararUbicacionSubmitPedidoOficina desde pedido-oficina-guardar-ubicacion.js */
export async function asegurarUbicacionAntesGuardarPedidoOficina(deps) {
    const { prepararUbicacionSubmitPedidoOficina } = await import('./pedido-oficina-guardar-ubicacion.js');
    const r = await prepararUbicacionSubmitPedidoOficina(deps);
    return r.ok;
}

export function resetPedidoNuevoOficinaUi() {
    _modoOficina = false;
    setModoOficinaUi(false);
    document.getElementById('pm-oficina')?.classList.remove('pm-oficina--elegir-mapa', 'active');
    if (_mapPickHandler && window.app?.map) {
        try {
            window.app.map.off('click', _mapPickHandler);
        } catch (_) {}
    }
    _mapPickHandler = null;
    if (_mapPickResolver) {
        _mapPickResolver({ ok: false, cancelado: true });
        _mapPickResolver = null;
    }
    moverFormularioA('pm-form-home');
    const est = document.getElementById('ped-oficina-estado');
    if (est) {
        est.innerHTML =
            '<i class="fas fa-info-circle"></i> Sin coordenadas aún — usá «Buscar dirección» o «Marcar en mapa».';
        est.className = 'ud';
    }
}

/**
 * @param {{
 *   esAdminSesionWebPublica?: () => boolean,
 *   limpiarFotosYPreviewNuevoPedido?: () => void,
 *   poblarSelectTiposReclamo?: () => void,
 *   syncNisClienteReclamoConexionUI?: () => void,
 *   cargarDistribuidores?: () => Promise<void>,
 *   htmlLineaUbicacionFormulario: (lat: number, lng: number, acc?: unknown) => string,
 *   syncWrapCoordsDisplayNuevoPedido?: () => void,
 *   mostrarMarcadorUbicacion?: (lat: number, lng: number, acc?: unknown) => number,
 *   ensureMapReady?: () => Promise<void>,
 *   nominatimFetchSearch: (params: Record<string, unknown>) => Promise<unknown[]>,
 *   parseEmpresaCfgLatLngBase?: () => { lat: number, lng: number }|null,
 *   resolverUbicacionCentralTenantParaMapa?: () => Promise<{ lat: number, lng: number }|null>,
 * }} deps
 */
export function initPedidoNuevoOficina(deps) {
    _depsOficina = deps;
    _coordDepsRegistrados = deps;
    mountPedidoFormularioEnDom();
    bindVisibilidadFabOficina(deps);

    const btnFab = document.getElementById('btn-mapa-nuevo-oficina');
    btnFab?.addEventListener('click', () => void abrirPedidoNuevoOficina(deps));
    if (typeof window !== 'undefined') {
        window.abrirPedidoNuevoOficina = () => void abrirPedidoNuevoOficina(deps);
        window.syncVisibilidadBotonPedidoOficina = () => syncVisibilidadBotonPedidoOficina(deps);
    }

    document.getElementById('ped-oficina-btn-geocode')?.addEventListener('click', () => {
        void geocodificarDireccionPedidoOficina(deps);
    });
    document.getElementById('ped-oficina-btn-mapa')?.addEventListener('click', () => {
        void pedirUbicacionAproximadaEnMapa(deps);
    });
}

/**
 * @param {Parameters<typeof initPedidoNuevoOficina>[0]} deps
 */
export async function abrirPedidoNuevoOficina(deps) {
    if (!esAdminWebPublico(deps)) {
        toast('Pedido en oficina solo está disponible para administrador en la versión web.', 'info');
        return;
    }
    mountPedidoFormularioEnDom();
    try {
        resetPadronNuevoPedidoNisTimers();
    } catch (_) {}
    if (_mapPickHandler && window.app?.map) {
        try {
            window.app.map.off('click', _mapPickHandler);
        } catch (_) {}
    }
    _mapPickHandler = null;
    _modoOficina = true;

    if (typeof deps.limpiarFotosYPreviewNuevoPedido === 'function') deps.limpiarFotosYPreviewNuevoPedido();
    const appRef = getApp();
    if (appRef) appRef.sel = null;

    const li = document.getElementById('li');
    const gi = document.getElementById('gi');
    if (li) li.value = '';
    if (gi) gi.value = '';

    const est = document.getElementById('ped-oficina-estado');
    if (est) {
        est.innerHTML =
            '<i class="fas fa-info-circle"></i> Sin coordenadas aún — usá «Buscar dirección» o «Marcar en mapa».';
        est.className = 'ud';
    }

    moverFormularioA('pm-oficina-form-home');
    setModoOficinaUi(true);

    try {
        if (typeof deps.cargarDistribuidores === 'function') await deps.cargarDistribuidores();
    } catch (_) {}
    try {
        if (typeof deps.poblarSelectTiposReclamo === 'function') deps.poblarSelectTiposReclamo();
        if (typeof deps.syncNisClienteReclamoConexionUI === 'function') deps.syncNisClienteReclamoConexionUI();
    } catch (_) {}

    document.getElementById('pm-oficina')?.classList.add('active');
    try {
        document.getElementById('pm')?.classList.remove('active');
    } catch (_) {}
}

/**
 * Igual que oficina vacía, con WGS84 precargado (goto «Nuevo reclamo», Ir en panel coords).
 * @param {Parameters<typeof initPedidoNuevoOficina>[0]} deps
 */
export async function abrirPedidoNuevoOficinaEnCoordenadas(deps, lat, lng) {
    await abrirPedidoNuevoOficina(deps);
    const la = Number(lat);
    const lo = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return;
    await aplicarCoordenadasPedidoOficina(deps, la, lo, { silencioso: true });
}
