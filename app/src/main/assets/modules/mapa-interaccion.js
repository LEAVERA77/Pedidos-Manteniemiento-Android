/**
 * Web admin: asegura pan/zoom Leaflet (por si otro código dejó handlers desalineados).
 * made by leavera77
 */

export function initMapaInteraccionAdminNavegador(map, ctx) {
    if (!map || !ctx) return;
    try {
        if (typeof ctx.esAndroidWebViewMapa === 'function' && ctx.esAndroidWebViewMapa()) return;
    } catch (_) {
        return;
    }
    let ok = false;
    try {
        ok = typeof ctx.esAdmin === 'function' && ctx.esAdmin();
    } catch (_) {}
    if (!ok) return;
    const fix = () => {
        try {
            if (map.dragging && typeof map.dragging.enable === 'function') map.dragging.enable();
        } catch (_) {}
        try {
            if (map.scrollWheelZoom && typeof map.scrollWheelZoom.enable === 'function') map.scrollWheelZoom.enable();
        } catch (_) {}
        try {
            if (map.doubleClickZoom && typeof map.doubleClickZoom.enable === 'function') map.doubleClickZoom.enable();
        } catch (_) {}
        try {
            if (map.boxZoom && typeof map.boxZoom.enable === 'function') map.boxZoom.enable();
        } catch (_) {}
    };
    fix();
    try {
        map.on('mousedown', fix);
        map.on('touchstart', fix);
    } catch (_) {}
}
