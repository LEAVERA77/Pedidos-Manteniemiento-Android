/**
 * FAB «+» mapa: nuevo pedido en ubicación actual / última GPS.
 * Tras abrir el modal, aplica el mismo reverse Nominatim que map-pin + clic en el mapa.
 */

function _reverseTrasCoords(programarReverse, lat, lon) {
    const la = Number(lat);
    const lo = Number(lon);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return;
    if (typeof programarReverse === 'function') programarReverse(la, lo);
}

/**
 * @param {object} d
 * @param {() => Promise<void>} d.ensureMapReady
 * @param {() => object | null} d.getUltimaUbicacion
 * @param {(u: object) => void} d.setUltimaUbicacion
 * @param {(lat: number, lon: number, acc: number | null | undefined) => Promise<void>} d.abrirNuevoPedidoEnCoordenadas
 * @param {(lng: number) => void} d.registrarFajaInstalacionSiFalta
 * @param {(msg: string, type?: string) => void} d.toast
 * @param {((lat: number, lng: number) => void) | undefined} d.programarReverseNominatimFormularioNuevoPedidoDesdeMapa
 */
export async function ejecutarNuevoPedidoDesdeUbicacionActual(d) {
    await d.ensureMapReady();
    const ul = d.getUltimaUbicacion && d.getUltimaUbicacion();
    if (ul && Number.isFinite(ul.lat) && Number.isFinite(ul.lon)) {
        await d.abrirNuevoPedidoEnCoordenadas(ul.lat, ul.lon, ul.acc);
        _reverseTrasCoords(d.programarReverseNominatimFormularioNuevoPedidoDesdeMapa, ul.lat, ul.lon);
        return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
        d.toast('GPS no disponible en este dispositivo', 'error');
        return;
    }
    try {
        const pos = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 14000,
                maximumAge: 0,
            });
        });
        const { latitude, longitude, accuracy } = pos.coords;
        d.registrarFajaInstalacionSiFalta(longitude);
        const accR = Math.round(accuracy || 0);
        const next = { lat: latitude, lon: longitude, acc: accR };
        if (typeof d.setUltimaUbicacion === 'function') d.setUltimaUbicacion(next);
        else {
            try {
                localStorage.setItem('ultima_ubicacion', JSON.stringify(next));
            } catch (_) {}
        }
        await d.abrirNuevoPedidoEnCoordenadas(latitude, longitude, accR);
        _reverseTrasCoords(d.programarReverseNominatimFormularioNuevoPedidoDesdeMapa, latitude, longitude);
    } catch (_) {
        d.toast('No se pudo obtener la ubicación. Probá «Ir a mi ubicación» primero.', 'error');
    }
}
