/**
 * Pedido nuevo en oficina (admin web): modal sin clic previo en mapa; geocodificación Nominatim.
 * made by leavera77
 */

import { toast } from './ui-utils.js';

let _modoOficina = false;
let _mapPickHandler = null;
let _formMontado = false;

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
    return _modoOficina;
}

function esAdminWebPublico(deps) {
    if (typeof deps.esAdminSesionWebPublica === 'function') return deps.esAdminSesionWebPublica();
    try {
        return typeof window.esAdmin === 'function' && window.esAdmin() && !/GestorNova\/|Nexxo\//i.test(navigator.userAgent);
    } catch (_) {
        return false;
    }
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
export async function aplicarCoordenadasPedidoOficina(deps, lat, lng, opts = {}) {
    const la = Number(lat);
    const lo = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return false;
    const Lref = typeof window !== 'undefined' ? window.L : null;
    if (!Lref || typeof Lref.latLng !== 'function') return false;

    if (typeof window !== 'undefined' && window.app) {
        window.app.sel = Lref.latLng(la, lo);
    }

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
        if (window.app?.map) {
            window.app.map.invalidateSize({ animate: false });
            window.app.map.setView([la, lo], 16, { animate: false });
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
export async function pedirUbicacionAproximadaEnMapa(deps) {
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
        _mapPickHandler = null;
        if (mo) {
            mo.classList.remove('pm-oficina--elegir-mapa');
            mo.classList.add('active');
        }
        const la = Number(e?.latlng?.lat);
        const lo = Number(e?.latlng?.lng);
        if (!Number.isFinite(la) || !Number.isFinite(lo)) return;
        void aplicarCoordenadasPedidoOficina(deps, la, lo);
    };
    map.once('click', _mapPickHandler);
}

/**
 * @param {Parameters<typeof geocodificarDireccionPedidoOficina>[0]} deps
 * @returns {Promise<boolean>}
 */
export async function asegurarUbicacionAntesGuardarPedidoOficina(deps) {
    if (!_modoOficina) return true;
    if (window.app?.sel) return true;
    const ok = await geocodificarDireccionPedidoOficina(deps);
    if (ok && window.app?.sel) return true;
    if (window.app?.sel) return true;
    toast(
        'Falta la ubicación del reclamo. Usá «Buscar dirección» o «Marcar en mapa» antes de guardar.',
        'error'
    );
    return false;
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
    mountPedidoFormularioEnDom();

    const btnFab = document.getElementById('btn-mapa-nuevo-oficina');
    const syncFab = () => {
        if (!btnFab) return;
        btnFab.style.display = esAdminWebPublico(deps) ? 'flex' : 'none';
    };
    syncFab();
    try {
        window.addEventListener('gn-empresa-cfg-actualizada', syncFab);
    } catch (_) {}

    btnFab?.addEventListener('click', () => void abrirPedidoNuevoOficina(deps));

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
    if (_mapPickHandler && window.app?.map) {
        try {
            window.app.map.off('click', _mapPickHandler);
        } catch (_) {}
    }
    _mapPickHandler = null;
    _modoOficina = true;

    if (typeof deps.limpiarFotosYPreviewNuevoPedido === 'function') deps.limpiarFotosYPreviewNuevoPedido();
    if (window.app) window.app.sel = null;

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
