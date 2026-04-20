// geo.js - Lógica de GPS y geolocalización
import {
    app,
    ultimaUbicacion, setUltimaUbicacion,
    marcadorUbicacion, setMarcadorUbicacion,
    gnMapaLigero, toast,
    setGpsRecibidoEstaSesion
} from './core.js';

let _watchId = null;
let _circuloAcc = null;
let _mejorPrecision = Infinity;
let _gnLastWatchUbicacionMs = 0;

function registrarFajaInstalacionSiFalta(lng) {
    if (typeof window.registrarFajaInstalacionSiFalta === 'function') {
        window.registrarFajaInstalacionSiFalta(lng);
    }
}

export function setWatchId(id) { _watchId = id; }
export function getWatchId() { return _watchId; }

export function calcularEscalaReal(zoom) {
    const lat = app.map ? app.map.getCenter().lat : -31.5;
    const latRad = lat * Math.PI / 180;
    const resolucion = (40075016.686 * Math.cos(latRad)) / (256 * Math.pow(2, zoom));

    const el = document.getElementById('mc');
    const anchoPantalla = el ? el.clientWidth : 800;
    const metrosVisibles = resolucion * anchoPantalla;

    if (metrosVisibles < 1) return (metrosVisibles * 100).toFixed(0) + ' cm';
    if (metrosVisibles < 10) return metrosVisibles.toFixed(1) + ' m';
    if (metrosVisibles < 1000) return Math.round(metrosVisibles) + ' m';
    if (metrosVisibles < 10000) return (metrosVisibles / 1000).toFixed(1) + ' km';
    return Math.round(metrosVisibles / 1000) + ' km';
}

export function mostrarMarcadorUbicacion(lat, lon, acc, opts) {
    if (!app.map) return;
    const L = window.L;

    if (marcadorUbicacion) {
        try { app.map.removeLayer(marcadorUbicacion); } catch(_) {}
        setMarcadorUbicacion(null);
    }

    if (_circuloAcc) {
        try { app.map.removeLayer(_circuloAcc); } catch(_) {}
        _circuloAcc = null;
    }

    const esBaseOficina = opts && opts.tipo === 'base_oficina';
    if (esBaseOficina) {
        const precisionZoom = 15;
        const svgIcon = L.divIcon({
            className: '',
            html: `<div style="width:18px;height:18px;background:#1d4ed8;border:3px solid white;border-radius:50%;box-shadow:0 0 0 3px rgba(29,78,216,.35);position:relative;"></div>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9],
            popupAnchor: [0, -10]
        });
        const paneGps = app.map.getPane && app.map.getPane('gnPaneGpsUser') ? 'gnPaneGpsUser' : undefined;
        const mk = { icon: svgIcon, zIndexOffset: 220 };
        if (paneGps) mk.pane = paneGps;
        const m = L.marker([lat, lon], mk)
            .addTo(app.map)
            .bindPopup(`<div style="font-family:system-ui;min-width:180px">
                <b style="color:#1d4ed8">🏢 Ubicación base de oficina</b><br>
                <span style="font-size:10px;color:#94a3b8">${lat.toFixed(6)}, ${lon.toFixed(6)}</span>
            </div>`);
        setMarcadorUbicacion(m);
        return precisionZoom;
    }

    const precisionZoom = !acc ? 15
        : acc < 50   ? 17
        : acc < 500  ? 15
        : acc < 5000 ? 13
        : 11;

    const svgIcon = L.divIcon({
        className: '',
        html: `<div style="width:16px;height:16px;background:#10b981;border:3px solid white;border-radius:50%;box-shadow:0 0 0 3px rgba(16,185,129,.4);${gnMapaLigero() ? '' : 'animation:pulse-gps 2s infinite;'}position:relative;"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        popupAnchor: [0, -10]
    });

    const accTexto = acc
        ? (acc < 1000 ? `±${Math.round(acc)} m` : `±${(acc/1000).toFixed(1)} km`)
        : 'precisión desconocida';

    const tipoGps = !acc ? 'GPS'
        : acc < 100  ? '🛰️ GPS'
        : acc < 2000 ? '📶 WiFi/Red celular'
        : '🌐 Geolocalización por IP';

    const paneGps = app.map.getPane && app.map.getPane('gnPaneGpsUser') ? 'gnPaneGpsUser' : undefined;
    const mkGps = { icon: svgIcon, zIndexOffset: 200 };
    if (paneGps) mkGps.pane = paneGps;
    const mGps = L.marker([lat, lon], mkGps)
        .addTo(app.map)
        .bindPopup(`
            <div style="font-family:system-ui;min-width:160px">
                <b style="color:#059669">📍 Tu ubicación</b><br>
                <span style="font-size:11px;color:#475569">${tipoGps} — ${accTexto}</span><br>
                <span style="font-size:10px;color:#94a3b8">${lat.toFixed(6)}, ${lon.toFixed(6)}</span>
            </div>
        `);
    setMarcadorUbicacion(mGps);

    if (acc && acc > 50 && !gnMapaLigero()) {
        const radioVisual = Math.min(Math.max(acc * 0.12, 10), 38);
        const cOpt = {
            radius: radioVisual,
            color: '#10b981',
            fillColor: '#10b981',
            fillOpacity: 0.07,
            weight: 1,
            dashArray: '4,6',
            interactive: false,
            bubblingMouseEvents: true
        };
        if (paneGps) cOpt.pane = paneGps;
        _circuloAcc = L.circle([lat, lon], cOpt).addTo(app.map);
    }

    return precisionZoom;
}

export async function solicitarUbicacion(centrarMapa = true, modoSilencioso = false, opts) {
    if (!navigator.geolocation) {
        if (!modoSilencioso) toast('Geolocalización no disponible en este dispositivo', 'error');
        return;
    }

    if (modoSilencioso && typeof navigator.permissions !== 'undefined') {
        try {
            const status = await navigator.permissions.query({ name: 'geolocation' });
            if (status.state === 'prompt') return;
        } catch(e) {}
    }

    const fastUserAction = !!(opts && opts.fastUserAction);
    let intentos = 0;
    const MAX_INTENTOS = gnMapaLigero() ? 2 : 3;
    let centroInicialAplicado = false;

    function procesarPosicion(position, esWatchUpdate = false) {
        const { latitude, longitude, accuracy } = position.coords;
        const acc = Math.round(accuracy);
        registrarFajaInstalacionSiFalta(longitude);
        setGpsRecibidoEstaSesion(true);

        if (esWatchUpdate && acc >= _mejorPrecision && acc > 200) return;
        _mejorPrecision = Math.min(_mejorPrecision, acc);

        setUltimaUbicacion({ lat: latitude, lon: longitude, acc });
        try { localStorage.setItem('ultima_ubicacion', JSON.stringify(ultimaUbicacion)); } catch(_) {}

        if (app.map) {
            const zoomSugerido = mostrarMarcadorUbicacion(latitude, longitude, acc);
            if (centrarMapa && !centroInicialAplicado) {
                app.map.invalidateSize({ animate: false });
                const actualCenter = app.map.getCenter();
                const distLat = Math.abs(actualCenter.lat - latitude);
                const distLon = Math.abs(actualCenter.lng - longitude);
                const estaLejos = distLat > 0.05 || distLon > 0.05;
                if (estaLejos || !esWatchUpdate) {
                    const doAnimate = !fastUserAction && !gnMapaLigero();
                    app.map.setView([latitude, longitude], zoomSugerido, { animate: doAnimate });
                }
                centroInicialAplicado = true;
                setTimeout(() => {
                    const zEl = document.getElementById('zoom-altura');
                    if (zEl) zEl.textContent = calcularEscalaReal(app.map.getZoom());
                }, 300);
            }
        }

        if (!modoSilencioso && !esWatchUpdate) {
            const msg = acc < 100
                ? `📍 GPS: ±${acc}m`
                : acc < 2000
                ? `📶 WiFi/Red: ±${acc}m`
                : `🌐 IP: ±${(acc/1000).toFixed(0)}km — precisión baja`;
            toast(msg, acc < 2000 ? 'success' : 'info');
        }
    }

    function manejarError(error) {
        const msgs = { 1: 'Permiso de ubicación denegado', 2: 'GPS no disponible', 3: 'Tiempo de espera agotado' };
        if (!modoSilencioso) toast(msgs[error.code] || 'Error de GPS', 'error');
        if (ultimaUbicacion && app.map && centrarMapa) {
            app.map.invalidateSize({ animate: false });
            mostrarMarcadorUbicacion(ultimaUbicacion.lat, ultimaUbicacion.lon, ultimaUbicacion.acc);
            app.map.setView([ultimaUbicacion.lat, ultimaUbicacion.lon], 14, { animate: !fastUserAction && !gnMapaLigero() });
        }
    }

    const geoOptsPrincipal = fastUserAction
        ? { enableHighAccuracy: false, timeout: 6000, maximumAge: 120000 }
        : { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 };

    navigator.geolocation.getCurrentPosition(
        pos => {
            procesarPosicion(pos, false);
            if (!fastUserAction && pos.coords.accuracy > 100 && intentos < MAX_INTENTOS) {
                const intentarMejorar = () => {
                    if (intentos >= MAX_INTENTOS) return;
                    intentos++;
                    navigator.geolocation.getCurrentPosition(
                        p2 => {
                            procesarPosicion(p2, false);
                            if (p2.coords.accuracy > 100 && intentos < MAX_INTENTOS) setTimeout(intentarMejorar, 2000);
                        },
                        () => {},
                        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
                    );
                };
                setTimeout(intentarMejorar, 1500);
            }
        },
        manejarError,
        geoOptsPrincipal
    );

    if (!_watchId) {
        _watchId = navigator.geolocation.watchPosition(
            pos => {
                const { latitude, longitude, accuracy } = pos.coords;
                const acc = Math.round(accuracy);
                registrarFajaInstalacionSiFalta(longitude);
                setUltimaUbicacion({ lat: latitude, lon: longitude, acc });
                try { localStorage.setItem('ultima_ubicacion', JSON.stringify(ultimaUbicacion)); } catch(_) {}
                if (!app.map) return;
                setGpsRecibidoEstaSesion(true);
                if (gnMapaLigero()) {
                    const now = Date.now();
                    if (now - _gnLastWatchUbicacionMs < 45000) return;
                    _gnLastWatchUbicacionMs = now;
                }
                mostrarMarcadorUbicacion(latitude, longitude, acc);
            },
            err => console.warn('[GPS watch]', err.message),
            gnMapaLigero()
                ? { enableHighAccuracy: false, maximumAge: 20000, timeout: 20000 }
                : { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
        );
    }
}
