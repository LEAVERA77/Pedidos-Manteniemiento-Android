/**
 * Mapa Leaflet (capa base + init): se carga con import() la primera vez que hace falta.
 * El estado mutable vive en app.js; aquí solo se usa el objeto ctx inyectado.
 */
let ctx = null;

export function setMapViewContext(c) {
    ctx = c;
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
            try { mapa.removeLayer(capaCarto); } catch (_) {}
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
        ctx.app.map.remove();
        ctx.app.map = null;
    }

    const L = ctx.L;
    const latBase = parseFloat(ctx.window.EMPRESA_CFG?.lat_base || '-31.505');
    const lngBase = parseFloat(ctx.window.EMPRESA_CFG?.lng_base || '-60.02');
    ctx.app.map = L.map('mc', {
        zoomControl: true,
        attributionControl: true,
        maxZoom: 19,
        zoom: 13,
        preferCanvas: true,
        zoomAnimation: false,
        fadeAnimation: false,
        markerZoomAnimation: false,
        inertia: false
    }).setView([latBase, lngBase], 13);

    gnAttachBaseMapLayers(ctx.app.map);

    const actualizarEscala = () => {
        if (ctx.app.map) ctx.document.getElementById('zoom-altura').textContent = ctx.calcularEscalaReal(ctx.app.map.getZoom());
    };
    const actualizarEscalaDebounced = () => {
        clearTimeout(ctx._mapEscalaDebounceTimer);
        ctx._mapEscalaDebounceTimer = setTimeout(actualizarEscala, ctx.gnMapaLigero() ? 200 : 90);
    };
    ctx.app.map.on('zoomend', actualizarEscala);
    ctx.app.map.on('moveend', actualizarEscalaDebounced);

    setTimeout(actualizarEscala, 200);

    ctx.app.map.on('click', e => {
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
            try { localStorage.setItem('ultima_ubicacion', JSON.stringify(ctx.ultimaUbicacion)); } catch (_) {}
            ctx.mostrarMarcadorUbicacion(lat, lng, null);
            ctx.app.map.setView([lat, lng], 15, { animate: !ctx.gnMapaLigero() });
            actualizarEscala();
            ctx.marcarMapTapUbicacionInicialHecha();
            ctx.toast('Ubicación en el mapa. Seguimos con el GPS del teléfono — para un pedido nuevo tocá de nuevo o usá el botón naranja.', 'info');
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
        try { ctx.poblarSelectTiposReclamo(); ctx.syncNisClienteReclamoConexionUI(); } catch (_) {}
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
