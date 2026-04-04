/**
 * Mapa Leaflet dedicado (WebView Android / PWA): búsqueda Nominatim, reverse al clic, confirmar → AndroidInterface.
 */
(function () {
    const NOMINATIM_EMAIL = 'gestornova-app@users.noreply.github.com';

    function tenantIdFromConfig() {
        try {
            if (window.AndroidConfig && typeof window.AndroidConfig.getConfigJson === 'function') {
                const raw = window.AndroidConfig.getConfigJson();
                const j = JSON.parse(raw || '{}');
                const t = Number(j.app?.tenantId ?? j.tenant_id);
                if (Number.isFinite(t) && t >= 1) return t;
            }
        } catch (_) {}
        try {
            const u = new URLSearchParams(window.location.search);
            const q = Number(u.get('tenant_id'));
            if (Number.isFinite(q) && q >= 1) return q;
        } catch (_) {}
        return 1;
    }

    function apiBaseFromConfig() {
        try {
            if (window.AndroidConfig && typeof window.AndroidConfig.getConfigJson === 'function') {
                const raw = window.AndroidConfig.getConfigJson();
                const j = JSON.parse(raw || '{}');
                const b = String(j.api?.baseUrl || '').trim();
                if (b) return b.replace(/\/+$/, '');
            }
        } catch (_) {}
        return '';
    }

    let map;
    let centralMarker;
    let selectedMarker;
    let lastAddress = '';
    let centralLatLng = null;

    const statusEl = document.getElementById('ubi-status');
    const addrEl = document.getElementById('ubi-address');
    const btnOk = document.getElementById('ubi-confirmar');
    const btnRetry = document.getElementById('ubi-retry-api');
    const inpQ = document.getElementById('ubi-q');
    const btnSearch = document.getElementById('ubi-search-btn');

    function setStatus(t) {
        if (statusEl) statusEl.textContent = t || '';
    }

    async function fetchCentroApi() {
        const base = apiBaseFromConfig();
        const tid = tenantIdFromConfig();
        if (!base) throw new Error('sin_api_base');
        const url = `${base}/api/config/ubicacion-central?tenant_id=${encodeURIComponent(String(tid))}`;
        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok) throw new Error('api_' + r.status);
        return r.json();
    }

    function placeCentral(lat, lng, zoom, nombre) {
        centralLatLng = L.latLng(lat, lng);
        if (!map) return;
        map.setView(centralLatLng, zoom || 13);
        if (centralMarker) {
            try {
                map.removeLayer(centralMarker);
            } catch (_) {}
        }
        const icon = L.divIcon({
            className: 'gn-ubi-central-icon',
            html: '<div style="font-size:26px;line-height:1;text-align:center" title="Ubicación central">🏢</div>',
            iconSize: [36, 36],
            iconAnchor: [18, 34]
        });
        centralMarker = L.marker(centralLatLng, { icon, draggable: false }).addTo(map);
        centralMarker.bindPopup(nombre ? 'Central: ' + nombre : 'Ubicación central (admin)').openPopup();
    }

    window.setUbicacionCentralFromAndroid = function (lat, lng, zoom, nombre) {
        const la = Number(lat);
        const lo = Number(lng);
        const z = Number(zoom) || 13;
        if (!Number.isFinite(la) || !Number.isFinite(lo)) return;
        if (map) placeCentral(la, lo, z, nombre != null ? String(nombre) : '');
        setStatus('Ubicación cargada desde la app.');
    };

    async function forwardSearchOsm(query) {
        const q = String(query || '').trim();
        if (q.length < 3) return null;
        const p = new URLSearchParams({
            format: 'json',
            q,
            countrycodes: 'ar',
            limit: '6',
            addressdetails: '1',
            'accept-language': 'es',
            email: NOMINATIM_EMAIL
        });
        const url = 'https://nominatim.openstreetmap.org/search?' + p.toString();
        const r = await fetch(url, {
            headers: { 'User-Agent': 'GestorNova-UbicacionMap/1.0 (contact: ' + NOMINATIM_EMAIL + ')' }
        });
        if (!r.ok) return null;
        const arr = await r.json();
        if (!Array.isArray(arr) || !arr.length) return null;
        const hit = arr[0];
        const la = Number(hit.lat);
        const lo = Number(hit.lon);
        if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
        return { lat: la, lng: lo, name: String(hit.display_name || q).trim() };
    }

    async function reverseOsm(lat, lng) {
        const p = new URLSearchParams({
            format: 'json',
            lat: String(lat),
            lon: String(lng),
            zoom: '18',
            addressdetails: '1',
            'accept-language': 'es',
            email: NOMINATIM_EMAIL
        });
        const url = 'https://nominatim.openstreetmap.org/reverse?' + p.toString();
        const r = await fetch(url, {
            headers: { 'User-Agent': 'GestorNova-UbicacionMap/1.0 (contact: ' + NOMINATIM_EMAIL + ')' }
        });
        if (!r.ok) return '';
        const j = await r.json();
        return String(j.display_name || '').trim();
    }

    async function initMap() {
        const el = document.getElementById('ubi-map');
        if (!el || typeof L === 'undefined') return;

        map = L.map(el, { zoomControl: true }).setView([-34, -64], 4);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OSM &copy; CARTO',
            subdomains: 'abcd',
            maxZoom: 19
        }).addTo(map);

        function placeSelected(lat, lng, nameHint) {
            map.setView([lat, lng], 16);
            if (selectedMarker) map.removeLayer(selectedMarker);
            selectedMarker = L.marker([lat, lng], { draggable: true }).addTo(map);
            lastAddress = nameHint || '';
            if (addrEl) addrEl.textContent = lastAddress || lat.toFixed(5) + ', ' + lng.toFixed(5);
            selectedMarker.on('dragend', async function () {
                const p = selectedMarker.getLatLng();
                lastAddress = await reverseOsm(p.lat, p.lng);
                if (addrEl) addrEl.textContent = lastAddress || p.lat.toFixed(5) + ', ' + p.lng.toFixed(5);
            });
        }

        try {
            const Geocoder = L.Control && L.Control.Geocoder;
            if (Geocoder && typeof L.Control.geocoder === 'function') {
                const nominatim = Geocoder.nominatim({
                    geocodingQueryParams: { countrycodes: 'ar', limit: '8', email: NOMINATIM_EMAIL }
                });
                L.Control.geocoder({ geocoder: nominatim, defaultMarkGeocode: false })
                    .on('markgeocode', function (e) {
                        const c = e.geocode.center;
                        placeSelected(c.lat, c.lng, e.geocode.name || '');
                    })
                    .addTo(map);
            }
        } catch (e) {
            console.warn('[ubi-map] geocoder plugin', e);
        }

        async function runManualSearch() {
            const q = inpQ && inpQ.value;
            setStatus('Buscando…');
            const hit = await forwardSearchOsm(q);
            if (!hit) {
                setStatus('Sin resultados. Probá otra dirección (calle, ciudad).');
                return;
            }
            placeSelected(hit.lat, hit.lng, hit.name);
            setStatus('Resultado de búsqueda.');
        }
        btnSearch && btnSearch.addEventListener('click', runManualSearch);
        inpQ &&
            inpQ.addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter') {
                    ev.preventDefault();
                    runManualSearch();
                }
            });

        map.on('click', async function (e) {
            const { lat, lng } = e.latlng;
            placeSelected(lat, lng, '');
            lastAddress = await reverseOsm(lat, lng);
            if (addrEl) addrEl.textContent = lastAddress || lat.toFixed(5) + ', ' + lng.toFixed(5);
        });

        let loaded = false;
        try {
            const j = await fetchCentroApi();
            const la = Number(j.lat);
            const lo = Number(j.lng);
            const z = Number(j.zoom) || 13;
            if (Number.isFinite(la) && Number.isFinite(lo)) {
                placeCentral(la, lo, z, j.nombre || '');
                loaded = true;
                setStatus('Centro desde servidor.');
            }
        } catch (_) {
            setStatus('No se pudo leer el centro desde la API. Esperá la inyección desde Android o tocá Reintentar.');
        }

        if (!loaded && window.AndroidConfig && typeof window.AndroidConfig.getUbicacionCentralCachedJson === 'function') {
            try {
                const raw = window.AndroidConfig.getUbicacionCentralCachedJson();
                if (raw && String(raw).trim()) {
                    const j = JSON.parse(raw);
                    const la = Number(j.lat);
                    const lo = Number(j.lng);
                    const z = Number(j.zoom) || 13;
                    if (Number.isFinite(la) && Number.isFinite(lo)) {
                        placeCentral(la, lo, z, j.nombre || '');
                        loaded = true;
                        setStatus('Centro desde almacenamiento local (Android).');
                    }
                }
            } catch (_) {}
        }

        if (!loaded) {
            setStatus('Sin ubicación central: usá la búsqueda o tocá el mapa y confirmá.');
        }

        btnRetry &&
            btnRetry.addEventListener('click', async function () {
                setStatus('Reintentando API…');
                try {
                    const j = await fetchCentroApi();
                    const la = Number(j.lat);
                    const lo = Number(j.lng);
                    const z = Number(j.zoom) || 13;
                    if (Number.isFinite(la) && Number.isFinite(lo)) {
                        placeCentral(la, lo, z, j.nombre || '');
                        setStatus('Centro actualizado desde servidor.');
                    }
                } catch (_) {
                    setStatus('La API sigue sin responder. Revisá conexión o configuración del admin.');
                }
            });

        btnOk &&
            btnOk.addEventListener('click', function () {
                if (!selectedMarker) {
                    setStatus('Elegí un punto en el mapa o buscá una dirección.');
                    return;
                }
                const p = selectedMarker.getLatLng();
                const addr = lastAddress || p.lat.toFixed(6) + ', ' + p.lng.toFixed(6);
                if (window.AndroidInterface && typeof window.AndroidInterface.setLocation === 'function') {
                    try {
                        window.AndroidInterface.setLocation(p.lat, p.lng, addr);
                        setStatus('Ubicación enviada a la app.');
                    } catch (e) {
                        setStatus('Error al llamar a Android: ' + (e && e.message));
                    }
                } else {
                    console.log('[ubicacion-map]', p.lat, p.lng, addr);
                    setStatus('(Sin AndroidInterface) Coordenadas en consola.');
                }
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMap);
    } else {
        initMap();
    }
})();
