/**
 * Mapa Leaflet (capa base + init): se carga con import() la primera vez que hace falta.
 * Centro: API → caché Android → EMPRESA_CFG; en WebView Android sin centro: mensaje y reintentar (sin coords fijas de ciudad).
 */
let ctx = null;

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

export function gnAttachBaseMapLayers(mapa) {
    if (!mapa || !ctx) return;
    const ligero = ctx.gnMapaLigero();
    const L = ctx.L;
    const capaEsri = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
        {
            attribution:
                'Tiles &copy; Esri &mdash; Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, GIS User Community',
            maxZoom: 19,
            maxNativeZoom: 19,
            tileSize: 256,
            crossOrigin: true,
            updateWhenIdle: true,
            keepBuffer: ligero ? 0 : 1
        }
    );
    const capaCarto = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 19,
        maxNativeZoom: 19,
        tileSize: 256,
        detectRetina: false,
        crossOrigin: true,
        updateWhenIdle: true,
        keepBuffer: ligero ? 0 : 1
    });
    let nErr = 0;
    capaCarto.on('tileerror', () => {
        nErr++;
        if (nErr >= 4 && !mapa._gnUsandoEsriFallback) {
            mapa._gnUsandoEsriFallback = true;
            try {
                mapa.removeLayer(capaCarto);
            } catch (_) {}
            capaEsri.addTo(mapa);
            ctx.toast('Mapa: capa CARTO inestable — usando mapa base alternativo', 'info');
        }
    });
    capaCarto.addTo(mapa);
}

export async function runInitMap() {
    if (!ctx) return;
    if (ctx.mapaInicializado && ctx.app.map) {
        ctx.app.map.invalidateSize();
        ctx.aplicarUIMapaPlataforma();
        ctx.renderMk();
        return;
    }

    const el = ctx.document.getElementById('mc');
    if (!el || el.clientWidth === 0) {
        setTimeout(() => ctx.scheduleMapRetry(), 250);
        return;
    }

    if (ctx.app.map) {
        try {
            ctx.app.map.remove();
        } catch (_) {}
        ctx.app.map = null;
    }

    const L = ctx.L;
    const center = await resolveMapCenterLatLngZoom();
    let latBase;
    let lngBase;
    let zoomInit = 13;

    if (center) {
        latBase = center.lat;
        lngBase = center.lng;
        zoomInit = center.zoom;
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
        maxZoom: 19,
        zoom: zoomInit,
        preferCanvas: true,
        zoomAnimation: false,
        fadeAnimation: false,
        markerZoomAnimation: false,
        inertia: false
    }).setView([latBase, lngBase], zoomInit);

    gnAttachBaseMapLayers(ctx.app.map);

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

    ctx.app.map.on('click', (e) => {
        if (ctx._modoFijarUbicacionAdmin) {
            ctx._modoFijarUbicacionAdmin = false;
            ctx.document.body.classList.remove('modo-fijar-ubicacion');
            ctx.registrarUbicacionManualAdmin(e.latlng.lat, e.latlng.lng);
            return;
        }

        if (ctx.app.map._popup && ctx.app.map._popup.isOpen && ctx.app.map._popup.isOpen()) return;

        const dmModal = ctx.document.getElementById('dm');
        if (dmModal && dmModal.classList.contains('active')) return;

        const hayModalAbierto = ctx.document.querySelector('.mo.active');
        if (hayModalAbierto) return;

        if (ctx.esAndroidWebViewMapa() && !ctx.mapTapUbicacionInicialHechaSesion() && !ctx._gpsRecibidoEstaSesion) {
            const lat = e.latlng.lat;
            const lng = e.latlng.lng;
            ctx.registrarFajaInstalacionSiFalta(lng);
            ctx.ultimaUbicacion = { lat, lon: lng, acc: null };
            try {
                localStorage.setItem('ultima_ubicacion', JSON.stringify(ctx.ultimaUbicacion));
            } catch (_) {}
            ctx.mostrarMarcadorUbicacion(lat, lng, null);
            ctx.app.map.setView([lat, lng], 15, { animate: !ctx.gnMapaLigero() });
            actualizarEscala();
            ctx.marcarMapTapUbicacionInicialHecha();
            ctx.toast(
                'Ubicación en el mapa. Seguimos con el GPS del teléfono — para un pedido nuevo tocá de nuevo el mapa o usá «Ir a mi ubicación».',
                'info'
            );
            ctx.solicitarUbicacion(false, true);
            return;
        }

        ctx.app.sel = e.latlng;
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
    });

    ctx.mapaInicializado = true;
    ctx.aplicarUIMapaPlataforma();
    ctx.renderMk();

    if (ctx.ultimaUbicacion && ctx.app.map) {
        const zInit = ctx.mostrarMarcadorUbicacion(ctx.ultimaUbicacion.lat, ctx.ultimaUbicacion.lon, ctx.ultimaUbicacion.acc);
        ctx.app.map.setView([ctx.ultimaUbicacion.lat, ctx.ultimaUbicacion.lon], zInit || 15);
        setTimeout(() => {
            ctx.document.getElementById('zoom-altura').textContent = ctx.calcularEscalaReal(ctx.app.map.getZoom());
        }, 100);

        setTimeout(() => ctx.solicitarUbicacion(false, true), 500);
    } else {
        ctx.solicitarUbicacion(true, false);
    }
}
