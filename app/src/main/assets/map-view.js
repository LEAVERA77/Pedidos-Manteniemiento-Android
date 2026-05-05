/**
 * Mapa Leaflet (capa base + init): se carga con import() la primera vez que hace falta.
 * Centro: API → caché Android → EMPRESA_CFG; en WebView Android sin centro: mensaje y reintentar (sin coords fijas de ciudad).
 */
let ctx = null;

/** Marcador fijo de la ubicación central del tenant (admin). */
let _gnAdminBaseMarker = null;
/** Control de coordenadas del cursor (esquina inferior izquierda). */
let _gnCursorCoordsControl = null;
/** Android: toques en mapa sin modo «nuevo» armado; el aviso solo tras N toques (no en arrastres). */
let _gnTapsHintNuevoPedidoMapa = 0;
const GN_TAPS_ANTES_HINT_NUEVO_PEDIDO = 5;

export function setMapViewContext(c) {
    ctx = c;
}

async function resolveMapCenterLatLngZoom() {
    if (!ctx) return null;
    const tid = ctx.tenantIdActual ? Number(ctx.tenantIdActual()) : 1;
    const tidOk = Number.isFinite(tid) && tid >= 1 ? tid : 1;
    const base = ctx.getApiBaseUrl ? String(ctx.getApiBaseUrl() || '').trim() : '';
    if (base) {
        try {
            const url = `${base.replace(/\/+$/, '')}/api/config/ubicacion-central?tenant_id=${encodeURIComponent(String(tidOk))}`;
            const r = await fetch(url, { cache: 'no-store' });
            if (r.ok) {
                const j = await r.json();
                const lat = Number(j.lat);
                const lng = Number(j.lng);
                const zoom = Number(j.zoom);
                if (Number.isFinite(lat) && Number.isFinite(lng)) {
                    return {
                        lat,
                        lng,
                        zoom: Number.isFinite(zoom) && zoom > 0 && zoom <= 22 ? zoom : 13,
                        source: 'api'
                    };
                }
            }
        } catch (_) {}
    }
    if (ctx.esAndroidWebViewMapa() && ctx.window.AndroidConfig && typeof ctx.window.AndroidConfig.getUbicacionCentralCachedJson === 'function') {
        try {
            const raw = ctx.window.AndroidConfig.getUbicacionCentralCachedJson();
            if (raw && String(raw).trim()) {
                const j = JSON.parse(raw);
                const lat = Number(j.lat);
                const lng = Number(j.lng);
                if (Number.isFinite(lat) && Number.isFinite(lng)) {
                    return {
                        lat,
                        lng,
                        zoom: Number(j.zoom) > 0 && Number(j.zoom) <= 22 ? Number(j.zoom) : 13,
                        source: 'android'
                    };
                }
            }
        } catch (_) {}
    }
    const eb = ctx.window.EMPRESA_CFG || {};
    const lb =
        eb.lat_base != null && String(eb.lat_base).trim() !== ''
            ? parseFloat(eb.lat_base)
            : Number.NaN;
    const lbg =
        eb.lng_base != null && String(eb.lng_base).trim() !== ''
            ? parseFloat(eb.lng_base)
            : Number.NaN;
    if (Number.isFinite(lb) && Number.isFinite(lbg)) {
        return { lat: lb, lng: lbg, zoom: 13, source: 'empresa_cfg' };
    }
    return null;
}

function showMapCenterMissingMessage(onRetry) {
    if (!ctx) return;
    const el = ctx.document.getElementById('mc');
    if (!el) return;
    el.innerHTML = '';
    const wrap = ctx.document.createElement('div');
    wrap.className = 'gn-mapa-sin-centro';
    wrap.style.cssText =
        'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;min-height:240px;padding:1.25rem;text-align:center;background:var(--bg,#f1f5f9);color:var(--bd,#0f172a);gap:.85rem;border-radius:.5rem;box-sizing:border-box';
    wrap.innerHTML =
        '<p style="margin:0;font-size:.95rem;max-width:26rem;line-height:1.45">Falta la <strong>ubicación central</strong> definida por el administrador, o no hubo conexión con el servidor.</p>' +
        '<p style="margin:0;font-size:.8rem;opacity:.88;max-width:24rem">Configurá la ubicación en la web (administrador) o en la pantalla de mapa dedicada; luego tocá <strong>Reintentar</strong>.</p>';
    const btn = ctx.document.createElement('button');
    btn.type = 'button';
    btn.className = 'bp';
    btn.textContent = 'Reintentar';
    btn.addEventListener('click', () => {
        try {
            el.innerHTML = '';
        } catch (_) {}
        ctx.mapaInicializado = false;
        if (ctx.app.map) {
            try {
                ctx.app.map.remove();
            } catch (_) {}
            ctx.app.map = null;
        }
        onRetry();
    });
    wrap.appendChild(btn);
    el.appendChild(wrap);
}

function gnRemoveAdminBaseMarker(map) {
    if (_gnAdminBaseMarker && map) {
        try {
            map.removeLayer(_gnAdminBaseMarker);
        } catch (_) {}
    }
    _gnAdminBaseMarker = null;
}

function gnEnsurePaneAdminBase(map) {
    if (!map.getPane('gnPaneAdminBase')) {
        map.createPane('gnPaneAdminBase');
        map.getPane('gnPaneAdminBase').style.zIndex = 640;
    }
}

/**
 * Punto de referencia fijo: misma fuente que el centro del mapa (API / Android / EMPRESA_CFG).
 * No se muestra en la vista genérica web sin tenant (-34,-64).
 */
function gnDrawAdminBaseMarker(map, L, lat, lng, sourceTag) {
    gnRemoveAdminBaseMarker(map);
    const la = Number(lat);
    const lo = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return;
    gnEnsurePaneAdminBase(map);
    const icon = L.divIcon({
        className: 'gn-admin-base-marker-wrap',
        html: '<div class="gn-admin-base-marker-dot" style="width:14px;height:14px;background:#f4511e;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 5px rgba(0,0,0,.4)"></div>',
        iconSize: [14, 14],
        iconAnchor: [7, 7]
    });
    const tip =
        'Base del administrador' +
        (sourceTag ? ` (${sourceTag === 'api' ? 'API' : sourceTag === 'android' ? 'dispositivo' : sourceTag === 'empresa_cfg' ? 'config' : sourceTag})` : '');
    _gnAdminBaseMarker = L.marker([la, lo], { icon, pane: 'gnPaneAdminBase', interactive: true })
        .bindTooltip(tip, { direction: 'top' })
        .addTo(map);
}

function gnRemoveCursorCoordsControl(map) {
    if (_gnCursorCoordsControl && map) {
        try {
            map.removeControl(_gnCursorCoordsControl);
        } catch (_) {}
    }
    _gnCursorCoordsControl = null;
}

function gnAttachCursorCoordsControl(L, map) {
    if (ctx && ctx.esAndroidWebViewMapa && ctx.esAndroidWebViewMapa()) {
        gnRemoveCursorCoordsControl(map);
        return;
    }
    gnRemoveCursorCoordsControl(map);
    const CursorCoordsControl = L.Control.extend({
        options: { position: 'bottomleft' },
        onAdd(mapInstance) {
            const container = L.DomUtil.create('div', 'gn-cursor-coords leaflet-bar');
            container.id = 'gn-cursor-coords';
            container.setAttribute('role', 'region');
            container.setAttribute('aria-label', 'Coordenadas del cursor en el mapa');

            const header = L.DomUtil.create('div', 'gn-cursor-coords-header', container);
            header.title = 'Arrastrar';
            header.innerHTML =
                '<span>📍 Coordenadas</span><button type="button" class="gn-coords-toggle" aria-expanded="true" aria-label="Ocultar coordenadas">✕</button>';

            const body = L.DomUtil.create('div', 'gn-cursor-coords-body', container);
            const latSpan = document.createElement('span');
            latSpan.className = 'gn-cursor-lat';
            latSpan.textContent = '---';
            const lngSpan = document.createElement('span');
            lngSpan.className = 'gn-cursor-lng';
            lngSpan.textContent = '---';
            body.appendChild(latSpan);
            body.appendChild(document.createTextNode(', '));
            body.appendChild(lngSpan);

            const gotoWrap = L.DomUtil.create('div', 'gn-cursor-goto-wrap', body);
            const inLat = document.createElement('input');
            inLat.type = 'text';
            inLat.placeholder = 'Lat';
            inLat.className = 'gn-cursor-goto-input';
            const inLng = document.createElement('input');
            inLng.type = 'text';
            inLng.placeholder = 'Lng';
            inLng.className = 'gn-cursor-goto-input';
            const btnGo = document.createElement('button');
            btnGo.type = 'button';
            btnGo.textContent = 'Ir';
            btnGo.className = 'gn-cursor-goto-btn';
            gotoWrap.appendChild(inLat);
            gotoWrap.appendChild(inLng);
            gotoWrap.appendChild(btnGo);

            if (L.DomEvent && typeof L.DomEvent.disableClickPropagation === 'function') {
                L.DomEvent.disableClickPropagation(container);
                L.DomEvent.disableScrollPropagation(container);
            }

            const toggleBtn = header.querySelector('.gn-coords-toggle');
            let isExpanded = true;
            let isDragging = false;
            let startX = 0;
            let startY = 0;
            let startLeft = 0;
            let startTop = 0;

            const onMapMove = (e) => {
                if (!isExpanded) return;
                latSpan.textContent = e.latlng.lat.toFixed(7);
                lngSpan.textContent = e.latlng.lng.toFixed(7);
            };
            const onMapOut = () => {
                latSpan.textContent = '---';
                lngSpan.textContent = '---';
            };
            const onGoto = () => {
                const lat = parseFloat(String(inLat.value || '').trim().replace(',', '.'));
                const lng = parseFloat(String(inLng.value || '').trim().replace(',', '.'));
                if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
                    try { ctx.toast('Coordenadas inválidas para centrar mapa.', 'warning'); } catch (_) {}
                    return;
                }
                try {
                    const z = typeof ctx.mostrarMarcadorUbicacion === 'function'
                        ? ctx.mostrarMarcadorUbicacion(lat, lng, null)
                        : 16;
                    mapInstance.setView([lat, lng], Math.max(z || 16, 16), { animate: true });
                    if (typeof ctx.window.abrirNuevoPedidoEnCoordenadas === 'function') {
                        ctx.window.abrirNuevoPedidoEnCoordenadas(lat, lng, null);
                    }
                } catch (_) {}
            };

            const onWinMove = (e) => {
                if (!isDragging) return;
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                container.style.left = `${startLeft + dx}px`;
                container.style.top = `${startTop + dy}px`;
            };
            const onWinUp = () => {
                if (!isDragging) return;
                isDragging = false;
                try {
                    mapInstance.dragging.enable();
                } catch (_) {}
            };

            header.addEventListener('mousedown', (e) => {
                if (e.target && e.target.closest && e.target.closest('.gn-coords-toggle')) return;
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                const rect = container.getBoundingClientRect();
                startLeft = rect.left;
                startTop = rect.top;
                container.style.position = 'fixed';
                container.style.left = `${startLeft}px`;
                container.style.top = `${startTop}px`;
                container.style.zIndex = '10050';
                container.style.margin = '0';
                try {
                    mapInstance.dragging.disable();
                } catch (_) {}
                e.preventDefault();
            });

            window.addEventListener('mousemove', onWinMove);
            window.addEventListener('mouseup', onWinUp);

            if (toggleBtn) {
                toggleBtn.addEventListener('click', (e) => {
                    if (L.DomEvent && typeof L.DomEvent.stop === 'function') L.DomEvent.stop(e);
                    else {
                        e.preventDefault();
                        e.stopPropagation();
                    }
                    isExpanded = !isExpanded;
                    body.style.display = isExpanded ? 'flex' : 'none';
                    toggleBtn.textContent = isExpanded ? '✕' : '▼';
                    toggleBtn.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
                    toggleBtn.setAttribute('aria-label', isExpanded ? 'Ocultar coordenadas' : 'Mostrar coordenadas');
                    container.style.minWidth = isExpanded ? '' : 'auto';
                });
            }
            btnGo.addEventListener('click', onGoto);
            inLat.addEventListener('keydown', (e) => { if (e.key === 'Enter') onGoto(); });
            inLng.addEventListener('keydown', (e) => { if (e.key === 'Enter') onGoto(); });

            mapInstance.on('mousemove', onMapMove);
            mapInstance.on('mouseout', onMapOut);

            this._gnCcOnMapMove = onMapMove;
            this._gnCcOnMapOut = onMapOut;
            this._gnCcOnWinMove = onWinMove;
            this._gnCcOnWinUp = onWinUp;

            return container;
        },
        onRemove(mapInstance) {
            if (this._gnCcOnMapMove) mapInstance.off('mousemove', this._gnCcOnMapMove);
            if (this._gnCcOnMapOut) mapInstance.off('mouseout', this._gnCcOnMapOut);
            if (this._gnCcOnWinMove) window.removeEventListener('mousemove', this._gnCcOnWinMove);
            if (this._gnCcOnWinUp) window.removeEventListener('mouseup', this._gnCcOnWinUp);
            try {
                mapInstance.dragging.enable();
            } catch (_) {}
        }
    });
    _gnCursorCoordsControl = new CursorCoordsControl();
    map.addControl(_gnCursorCoordsControl);
}
/**
 * Vuelve a leer la ubicación central y redibuja el marcador (tras cambiar EMPRESA_CFG / API).
 */
export async function gnRefreshMarcadorUbicacionBaseAdmin() {
    if (!ctx || !ctx.app || !ctx.app.map) return;
    const L = ctx.L;
    const map = ctx.app.map;
    const center = await resolveMapCenterLatLngZoom();
    if (center && Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
        gnDrawAdminBaseMarker(map, L, center.lat, center.lng, center.source || '');
    } else {
        gnRemoveAdminBaseMarker(map);
    }
}

/** Capas raster de terceros (OSM / derivados) solo para admin en navegador web — superpuestas sobre la base. */
const GN_OSM_OVERLAY_LAYERS = [
    {
        id: 'topo',
        url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        opts: {
            subdomains: 'abc',
            maxZoom: 19,
            maxNativeZoom: 17,
            opacity: 0.55,
            attribution:
                'Relieve: <a href="https://opentopomap.org" rel="noopener noreferrer">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>) · © OpenStreetMap',
        },
    },
    {
        id: 'hot',
        /** Un solo host evita que Leaflet fije un subdominio “malo” para toda la sesión. */
        url: 'https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
        opts: {
            maxZoom: 19,
            /** Tiles nativos altos suelen 404 en el CDN; z17→19 escala y cubre mejor el mapa. */
            maxNativeZoom: 17,
            opacity: 0.5,
            keepBuffer: 6,
            attribution:
                'Ejidos y lugares (estilo HOT / respaldo OSM): © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://www.hotosm.org/" rel="noopener noreferrer">HOT</a>',
        },
    },
    {
        id: 'rail',
        url: 'https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png',
        opts: {
            subdomains: 'abcd',
            maxZoom: 19,
            maxNativeZoom: 18,
            opacity: 0.75,
            attribution:
                'Vías férreas: <a href="https://www.openrailwaymap.org" rel="noopener noreferrer">OpenRailwayMap</a> · © OpenStreetMap',
        },
    },
];

/** Subir si cambian URLs/opciones de overlays: fuerza nuevas instancias Leaflet en mapas ya abiertos. */
const GN_OSM_OVERLAY_INSTANCES_REV = 6;

const GN_HOT_TILE_SUBS = ['a', 'b', 'c', 'd'];

/**
 * URL de respaldo por intento: `getTileUrl` repetía el mismo host; aquí se rota a–d y luego Mapnik.
 * @param {{ z: number, x: number, y: number }} coords
 * @param {number} attempt 1-based (tras primer fallo)
 */
function gnHotRetryTileUrl(coords, attempt) {
    const z = coords.z;
    const x = coords.x;
    const y = coords.y;
    if (attempt <= 4) {
        const s = GN_HOT_TILE_SUBS[attempt % GN_HOT_TILE_SUBS.length];
        return `https://${s}.tile.openstreetmap.fr/hot/${z}/${x}/${y}.png`;
    }
    if (attempt === 5) {
        return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
    }
    return null;
}

/**
 * Reintentos ante fallos del CDN HOT (rotación real de hosts + Mapnik).
 * @param {import('leaflet').TileLayer} layer
 * @param {import('leaflet').Map} map
 */
function gnAttachHotOsmTileRetry(layer, map) {
    if (!layer || !map || typeof layer.on !== 'function') return;
    layer.on('tileerror', (ev) => {
        const tile = ev.tile;
        const coords = ev.coords;
        if (!tile || !coords || tile.tagName !== 'IMG') return;
        if (tile._gnHotRetryDead) return;
        const n = (tile._gnHotRetries = (tile._gnHotRetries || 0) + 1);
        if (n > 5) {
            tile._gnHotRetryDead = true;
            return;
        }
        const delay = Math.min(7000, 180 * 2 ** (n - 1) + Math.floor(Math.random() * 200));
        window.setTimeout(() => {
            try {
                if (!map.hasLayer(layer)) return;
                const url = gnHotRetryTileUrl(coords, n);
                if (!url) return;
                const sep = url.includes('?') ? '&' : '?';
                tile.src = `${url}${sep}_gnh=${n}&t=${Date.now()}`;
            } catch (_) {}
        }, delay);
    });
}

function gnEnsureOsmOverlayPane(map) {
    if (!map || !map.createPane) return;
    if (!map.getPane('gnPaneOsmOverlays')) {
        map.createPane('gnPaneOsmOverlays');
        const p = map.getPane('gnPaneOsmOverlays');
        p.style.zIndex = '240';
    }
}

function gnEnsureAdminOsmOverlayLayerInstances(map) {
    if (!map || !ctx || !ctx.L) return null;
    const idsOk = new Set(GN_OSM_OVERLAY_LAYERS.map((d) => d.id));
    if (map._gnOsmOverlayInstances) {
        const keys = Object.keys(map._gnOsmOverlayInstances);
        const stale =
            keys.length !== idsOk.size ||
            keys.some((k) => !idsOk.has(k)) ||
            map._gnOsmOverlayInstancesRev !== GN_OSM_OVERLAY_INSTANCES_REV;
        if (!stale) return map._gnOsmOverlayInstances;
        for (const lyr of Object.values(map._gnOsmOverlayInstances)) {
            try {
                if (map.hasLayer(lyr)) map.removeLayer(lyr);
            } catch (_) {}
        }
        map._gnOsmOverlayInstances = null;
    }
    gnEnsureOsmOverlayPane(map);
    const L = ctx.L;
    const out = {};
    const errTile =
        'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    for (const def of GN_OSM_OVERLAY_LAYERS) {
        const tileOpts = {
            pane: 'gnPaneOsmOverlays',
            tileSize: 256,
            crossOrigin: true,
            updateWhenZooming: true,
            updateWhenIdle: true,
            keepBuffer: 3,
            ...def.opts,
        };
        tileOpts.errorTileUrl = errTile;
        const layer = L.tileLayer(def.url, tileOpts);
        if (def.id === 'hot') {
            gnAttachHotOsmTileRetry(layer, map);
        }
        out[def.id] = layer;
    }
    map._gnOsmOverlayInstancesRev = GN_OSM_OVERLAY_INSTANCES_REV;
    map._gnOsmOverlayInstances = out;
    return out;
}

/** Quita del mapa las capas tile OSM de admin (p. ej. mapas secundarios que no deben heredar el panel de capas). */
export function gnClearAdminOsmOverlaysFromMap(map) {
    if (!map) return;
    try {
        const layers = map._gnOsmOverlayInstances;
        if (layers) {
            for (const lyr of Object.values(layers)) {
                try {
                    if (map.hasLayer(lyr)) map.removeLayer(lyr);
                } catch (_) {}
            }
        }
    } catch (_) {}
}

/**
 * Mapa base raster (CARTO o fallback Esri) según `localStorage` `pmg_base_map_visible` (default visible).
 * @param {import('leaflet').Map | null | undefined} map
 */
export function gnApplyBaseMapVisibilityFromStorage(map) {
    if (!map || !ctx) return;
    const androidWv = ctx.esAndroidWebViewMapa && ctx.esAndroidWebViewMapa();
    if (androidWv) return;
    if (!ctx.esAdmin || typeof ctx.esAdmin !== 'function' || !ctx.esAdmin()) return;
    let on = true;
    try {
        on = localStorage.getItem('pmg_base_map_visible') !== '0';
    } catch (_) {}
    const lyr = map._gnBaseRasterLayer;
    if (!lyr) return;
    try {
        if (on && !map.hasLayer(lyr)) lyr.addTo(map);
        if (!on && map.hasLayer(lyr)) map.removeLayer(lyr);
    } catch (_) {}
}

/**
 * Lee preferencias `pmg_overlay_osm_<id>` y añade/quita capas (solo admin web).
 * @param {import('leaflet').Map | null | undefined} map
 */
export function gnApplyAdminOsmOverlaysFromStorage(map) {
    if (!map || !ctx) return;
    const androidWv = ctx.esAndroidWebViewMapa && ctx.esAndroidWebViewMapa();
    if (androidWv) return;
    if (!ctx.esAdmin || typeof ctx.esAdmin !== 'function' || !ctx.esAdmin()) return;
    try {
        localStorage.removeItem('pmg_overlay_osm_hillshade');
        localStorage.removeItem('pmg_overlay_osm_power');
    } catch (_) {}
    const layers = gnEnsureAdminOsmOverlayLayerInstances(map);
    if (!layers) return;
    for (const def of GN_OSM_OVERLAY_LAYERS) {
        const id = def.id;
        let on = false;
        try {
            on = localStorage.getItem(`pmg_overlay_osm_${id}`) === '1';
        } catch (_) {}
        const layer = layers[id];
        if (!layer) continue;
        try {
            if (on && !map.hasLayer(layer)) layer.addTo(map);
            if (!on && map.hasLayer(layer)) map.removeLayer(layer);
        } catch (_) {}
    }
}

/**
 * @param {import('leaflet').Map} mapa
 * @param {{ applyAdminOsmOverlays?: boolean }} [opts] Si `applyAdminOsmOverlays === false`, no aplica las superposiciones del panel (solo mapa base).
 */
export function gnAttachBaseMapLayers(mapa, opts) {
    if (!mapa || !ctx) return;
    const applyOsm = !opts || opts.applyAdminOsmOverlays !== false;
    const ligero = ctx.gnMapaLigero();
    const androidWv = ctx.esAndroidWebViewMapa && ctx.esAndroidWebViewMapa();
    const L = ctx.L;
    const maxZ = androidWv ? (ligero ? 17 : 18) : ligero ? 17 : 19;
    const keepBuf = androidWv ? 1 : ligero ? 0 : 1;
    const zoomWhile = androidWv ? false : !ligero;
    const capaEsri = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
        {
            attribution:
                'Tiles &copy; Esri &mdash; Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, GIS User Community',
            maxZoom: maxZ,
            maxNativeZoom: maxZ,
            tileSize: 256,
            crossOrigin: true,
            updateWhenIdle: true,
            updateWhenZooming: zoomWhile,
            keepBuffer: keepBuf
        }
    );
    const capaCarto = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: maxZ,
        maxNativeZoom: maxZ,
        tileSize: 256,
        detectRetina: false,
        crossOrigin: true,
        updateWhenIdle: true,
        updateWhenZooming: zoomWhile,
        keepBuffer: keepBuf
    });
    mapa._gnCapaCartoBase = capaCarto;
    mapa._gnCapaEsriBase = capaEsri;
    mapa._gnBaseRasterLayer = capaCarto;
    let nErr = 0;
    capaCarto.on('tileerror', () => {
        nErr++;
        if (nErr >= 4 && !mapa._gnUsandoEsriFallback) {
            mapa._gnUsandoEsriFallback = true;
            try {
                mapa.removeLayer(capaCarto);
            } catch (_) {}
            try {
                capaEsri.addTo(mapa);
                mapa._gnBaseRasterLayer = capaEsri;
                if (applyOsm) gnApplyBaseMapVisibilityFromStorage(mapa);
            } catch (_) {}
            ctx.toast('Mapa: capa CARTO inestable — usando mapa base alternativo', 'info');
        }
    });
    capaCarto.addTo(mapa);
    if (applyOsm) {
        gnApplyAdminOsmOverlaysFromStorage(mapa);
        gnApplyBaseMapVisibilityFromStorage(mapa);
    } else {
        gnClearAdminOsmOverlaysFromMap(mapa);
    }
}

/**
 * Leaflet se carga con <script src=leaflet.js> antes del bundle; en WebView o red lenta puede no estar listo al primer initMap.
 * @param {Window} win
 * @param {number} maxMs
 * @returns {Promise<typeof import('leaflet') | null>}
 */
async function waitForLeafletOnWindow(win, maxMs = 20000) {
    const w = win || (typeof window !== 'undefined' ? window : null);
    const t0 = Date.now();
    while (true) {
        const L = w && w.L;
        if (L && typeof L.map === 'function') return L;
        if (Date.now() - t0 >= maxMs) return null;
        await new Promise((r) => setTimeout(r, 40));
    }
}

export async function runInitMap() {
    if (!ctx) return;
    if (ctx.mapaInicializado && ctx.app.map) {
        ctx.app.map.invalidateSize();
        try {
            ctx.app.map.dragging.enable();
        } catch (_) {}
        requestAnimationFrame(() => {
            try {
                ctx.app.map.invalidateSize({ animate: false });
            } catch (_) {}
        });
        setTimeout(() => {
            try {
                ctx.app.map.invalidateSize({ animate: false });
            } catch (_) {}
        }, 200);
        ctx.aplicarUIMapaPlataforma();
        ctx.renderMk();
        try {
            gnApplyAdminOsmOverlaysFromStorage(ctx.app.map);
            gnApplyBaseMapVisibilityFromStorage(ctx.app.map);
        } catch (_) {}
        return;
    }

    const el = ctx.document.getElementById('mc');
    if (!el || el.clientWidth === 0) {
        setTimeout(() => ctx.scheduleMapRetry(), 250);
        return;
    }

    if (ctx.app.map) {
        try {
            _gnAdminBaseMarker = null;
            _gnCursorCoordsControl = null;
            ctx.app.map.remove();
        } catch (_) {}
        ctx.app.map = null;
    }

    let L = ctx.L && typeof ctx.L.map === 'function' ? ctx.L : null;
    if (!L) {
        L = await waitForLeafletOnWindow(ctx.window, 20000);
    }
    if (!L || typeof L.map !== 'function') {
        try {
            ctx.toast(
                'No se pudo cargar el motor del mapa (Leaflet). Revisá la conexión o que el script de leaflet.js esté disponible.',
                'error'
            );
        } catch (_) {}
        setTimeout(() => ctx.scheduleMapRetry(), 600);
        return;
    }
    /* Evita "Map container is already initialized" si quedó _leaflet_id sin instancia en app.map. */
    try {
        if (el._leaflet_id != null) {
            delete el._leaflet_id;
        }
    } catch (_) {}
    try {
        el.innerHTML = '';
        el.className = String(el.className || '')
            .replace(/\bleaflet-container\b/g, '')
            .replace(/\bleaflet-touch\b/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    } catch (_) {}
    const ligeroInit = ctx.gnMapaLigero();
    const androidMap = ctx.esAndroidWebViewMapa && ctx.esAndroidWebViewMapa();
    const maxZoomMap = androidMap ? (ligeroInit ? 17 : 18) : ligeroInit ? 17 : 19;
    const center = await resolveMapCenterLatLngZoom();
    let latBase;
    let lngBase;
    let zoomInit = 13;

    if (center) {
        latBase = center.lat;
        lngBase = center.lng;
        zoomInit = Math.min(center.zoom, maxZoomMap);
    } else if (ctx.esAndroidWebViewMapa()) {
        showMapCenterMissingMessage(() => {
            void ctx.scheduleMapRetry();
        });
        return;
    } else {
        /* Navegador web sin centro configurado: vista país (no anclada a una ciudad operativa). */
        latBase = -34.0;
        lngBase = -64.0;
        zoomInit = 4;
        try {
            ctx.toast('Ubicación central no configurada: mostrando mapa de Argentina. Configurá lat/lng en el panel admin.', 'warning');
        } catch (_) {}
    }

    ctx.app.map = L.map('mc', {
        zoomControl: false,
        attributionControl: true,
        maxZoom: maxZoomMap,
        zoom: zoomInit,
        // WebView Android (p. ej. Samsung / API 36): SVG + teselas IMG a veces se desalinean al zoom (pines “flotan”).
        // Canvas para vectores (CircleMarker de pedidos) compone estable con el transform del mapa.
        preferCanvas: androidMap ? true : !ligeroInit,
        zoomAnimation: false,
        fadeAnimation: false,
        markerZoomAnimation: false,
        inertia: false,
        scrollWheelZoom: true,
        wheelPxPerZoomLevel: 60
    }).setView([latBase, lngBase], zoomInit);

    gnAttachBaseMapLayers(ctx.app.map);

    const map = ctx.app.map;
    gnAttachCursorCoordsControl(L, map);
    if (center && Number.isFinite(latBase) && Number.isFinite(lngBase)) {
        gnDrawAdminBaseMarker(map, L, latBase, lngBase, center.source || '');
    }
    try {
        if (ctx.esAndroidWebViewMapa() && map.scrollWheelZoom && typeof map.scrollWheelZoom.enable === 'function') {
            map.scrollWheelZoom.enable();
        }
    } catch (_) {}
    try {
        let emu = false;
        if (ctx.esAndroidWebViewMapa() && ctx.window.AndroidDevice && typeof ctx.window.AndroidDevice.isEmulator === 'function') {
            emu = !!ctx.window.AndroidDevice.isEmulator();
        }
        if (ctx.esAndroidWebViewMapa() && emu) {
            try {
                map.scrollWheelZoom.disable();
            } catch (_) {}
            const mc = ctx.document.getElementById('mc');
            if (mc && !mc._gnWheelEmu) {
                mc._gnWheelEmu = true;
                mc.addEventListener(
                    'wheel',
                    (ev) => {
                        if (!ctx.app.map) return;
                        const dy = ev.deltaY;
                        if (!dy) return;
                        ev.preventDefault();
                        ev.stopPropagation();
                        const z = ctx.app.map.getZoom();
                        const next = Math.max(
                            ctx.app.map.getMinZoom(),
                            Math.min(ctx.app.map.getMaxZoom(), z + (dy > 0 ? -1 : 1))
                        );
                        ctx.app.map.setZoom(next, { animate: !ctx.gnMapaLigero() });
                    },
                    { passive: false, capture: true }
                );
            }
        }
    } catch (_) {}
    if (!map.getPane('gnPanePedidos')) {
        map.createPane('gnPanePedidos');
        map.getPane('gnPanePedidos').style.zIndex = 650;
    }
    if (!map.getPane('gnPaneGpsUser')) {
        map.createPane('gnPaneGpsUser');
        map.getPane('gnPaneGpsUser').style.zIndex = 420;
    }

    const actualizarEscala = () => {
        if (ctx.app.map)
            ctx.document.getElementById('zoom-altura').textContent = ctx.calcularEscalaReal(ctx.app.map.getZoom());
    };
    const actualizarEscalaDebounced = () => {
        clearTimeout(ctx._mapEscalaDebounceTimer);
        ctx._mapEscalaDebounceTimer = setTimeout(actualizarEscala, ctx.gnMapaLigero() ? 200 : 90);
    };
    ctx.app.map.on('zoomend', actualizarEscala);
    ctx.app.map.on('moveend', actualizarEscalaDebounced);

    setTimeout(actualizarEscala, 200);

    /** Tras pan/drag del mapa Leaflet suele dispararse igual un `click` → alta de pedido nuevo; inhibir ese click. */
    let suppressMapClickAfterPan = false;
    map.on('dragend', () => {
        suppressMapClickAfterPan = true;
        _gnTapsHintNuevoPedidoMapa = 0;
    });
    const mcPan = ctx.document.getElementById('mc');
    if (mcPan) {
        const TAP_MOVE_THRESH_PX = 10;
        let panDown = null;
        const onPanDown = (ev) => {
            const p = ev.touches && ev.touches[0] ? ev.touches[0] : ev;
            panDown = { x: p.clientX, y: p.clientY };
        };
        const onPanMove = (ev) => {
            if (!panDown) return;
            const p = ev.touches && ev.touches[0] ? ev.touches[0] : ev;
            const dx = p.clientX - panDown.x;
            const dy = p.clientY - panDown.y;
            if (dx * dx + dy * dy > TAP_MOVE_THRESH_PX * TAP_MOVE_THRESH_PX) suppressMapClickAfterPan = true;
        };
        const onPanEnd = () => {
            panDown = null;
        };
        mcPan.addEventListener('pointerdown', onPanDown, { passive: true });
        mcPan.addEventListener('pointermove', onPanMove, { passive: true });
        mcPan.addEventListener('pointerup', onPanEnd, { passive: true });
        mcPan.addEventListener('pointercancel', onPanEnd, { passive: true });
    }

    ctx.app.map.on('click', (e) => {
        if (suppressMapClickAfterPan) {
            suppressMapClickAfterPan = false;
            return;
        }
        /* Android/WebView: el toque en un botón del popup puede cerrar el popup y disparar este click en el mapa → abre #pm. */
        try {
            const w = ctx.window;
            const until = w._gnSuppressMapClickUntil;
            if (typeof until === 'number' && Date.now() < until) return;
        } catch (_) {}

        if (ctx._modoFijarUbicacionAdmin) {
            ctx._modoFijarUbicacionAdmin = false;
            ctx.document.body.classList.remove('modo-fijar-ubicacion');
            ctx.registrarUbicacionManualAdmin(e.latlng.lat, e.latlng.lng);
            return;
        }

        try {
            if (typeof ctx.window.__gnEsReubicarPedidoMapa === 'function' && ctx.window.__gnEsReubicarPedidoMapa()) return;
        } catch (_) {}

        if (ctx.app.map._popup && ctx.app.map._popup.isOpen && ctx.app.map._popup.isOpen()) return;

        const dmModal = ctx.document.getElementById('dm');
        if (dmModal && dmModal.classList.contains('active')) return;

        const hayModalAbierto = ctx.document.querySelector('.mo.active');
        if (hayModalAbierto) return;

        const esAdm =
            typeof ctx.esAdmin === 'function' &&
            ctx.esAdmin();
        if (
            ctx.esAndroidWebViewMapa() &&
            !esAdm &&
            !ctx.mapTapUbicacionInicialHechaSesion() &&
            !ctx._gpsRecibidoEstaSesion
        ) {
            const lat = e.latlng.lat;
            const lng = e.latlng.lng;
            ctx.registrarFajaInstalacionSiFalta(lng);
            ctx.ultimaUbicacion = { lat, lon: lng, acc: null };
            try {
                localStorage.setItem('ultima_ubicacion', JSON.stringify(ctx.ultimaUbicacion));
            } catch (_) {}
            ctx.mostrarMarcadorUbicacion(lat, lng, null);
            ctx.app.map.setView([lat, lng], 16, { animate: !ctx.gnMapaLigero() });
            actualizarEscala();
            ctx.marcarMapTapUbicacionInicialHecha();
            ctx.toast(
                'Ubicación en el mapa. Seguimos con el GPS del teléfono — para un pedido nuevo tocá de nuevo el mapa o usá «Ir a mi ubicación».',
                'info'
            );
            ctx.solicitarUbicacion(false, true);
            return;
        }

        if (
            ctx.esAndroidWebViewMapa() &&
            typeof ctx.mapTapNuevoPedidoArmadoSesion === 'function' &&
            !ctx.mapTapNuevoPedidoArmadoSesion()
        ) {
            _gnTapsHintNuevoPedidoMapa += 1;
            if (_gnTapsHintNuevoPedidoMapa >= GN_TAPS_ANTES_HINT_NUEVO_PEDIDO) {
                _gnTapsHintNuevoPedidoMapa = 0;
                try {
                    ctx.toast('Tocá «Mapa → nuevo» y después el mapa para elegir el punto del pedido.', 'info');
                } catch (_) {}
            }
            return;
        }

        ctx.app.sel = e.latlng;
        _gnTapsHintNuevoPedidoMapa = 0;
        ctx.limpiarFotosYPreviewNuevoPedido();
        ctx.document.getElementById('li').value = e.latlng.lat;
        ctx.document.getElementById('gi').value = e.latlng.lng;
        ctx.syncWrapCoordsDisplayNuevoPedido();
        const ui = ctx.document.getElementById('ui');
        ui.innerHTML = ctx.htmlLineaUbicacionFormulario(e.latlng.lat, e.latlng.lng, null);
        ui.className = 'ud sel';
        try {
            ctx.poblarSelectTiposReclamo();
            ctx.syncNisClienteReclamoConexionUI();
        } catch (_) {}
        ctx.document.getElementById('pm').classList.add('active');
        try {
            if (ctx.esAndroidWebViewMapa() && typeof ctx.desarmarMapTapNuevoPedido === 'function') {
                ctx.desarmarMapTapNuevoPedido();
            }
        } catch (_) {}
        try {
            if (
                typeof ctx.debeReverseNominatimAdminMapTap === 'function' &&
                typeof ctx.programarReverseNominatimFormularioNuevoPedidoDesdeMapa === 'function' &&
                ctx.debeReverseNominatimAdminMapTap(e)
            ) {
                const la = Number(e.latlng?.lat);
                const ln = Number(e.latlng?.lng);
                if (Number.isFinite(la) && Number.isFinite(ln)) {
                    ctx.programarReverseNominatimFormularioNuevoPedidoDesdeMapa(la, ln);
                }
            }
        } catch (_) {}
    });

    ctx.mapaInicializado = true;
    ctx.aplicarUIMapaPlataforma();
    ctx.renderMk();

    const gnBumpMapLayout = () => {
        try {
            if (!ctx.app.map) return;
            ctx.app.map.invalidateSize({ animate: false });
            try {
                ctx.app.map.dragging.enable();
            } catch (_) {}
        } catch (_) {}
    };
    gnBumpMapLayout();
    requestAnimationFrame(() => {
        gnBumpMapLayout();
        requestAnimationFrame(gnBumpMapLayout);
    });
    setTimeout(gnBumpMapLayout, 80);
    setTimeout(gnBumpMapLayout, 350);
    setTimeout(gnBumpMapLayout, 900);

    if (ctx.ultimaUbicacion && ctx.app.map) {
        const zInit = ctx.mostrarMarcadorUbicacion(ctx.ultimaUbicacion.lat, ctx.ultimaUbicacion.lon, ctx.ultimaUbicacion.acc);
        const z0 = Number.isFinite(zInit) && zInit > 0 ? zInit : 15;
        ctx.app.map.setView([ctx.ultimaUbicacion.lat, ctx.ultimaUbicacion.lon], Math.max(z0, 16));
        setTimeout(() => {
            ctx.document.getElementById('zoom-altura').textContent = ctx.calcularEscalaReal(ctx.app.map.getZoom());
        }, 100);

        setTimeout(() => ctx.solicitarUbicacion(false, true), 500);
    } else {
        ctx.solicitarUbicacion(true, false);
    }
}

if (typeof window !== 'undefined') {
    window.gnRefreshMarcadorUbicacionBaseAdmin = gnRefreshMarcadorUbicacionBaseAdmin;
}
