/**
 * Web admin: asegura pan/zoom Leaflet (por si otro código dejó handlers desalineados).
 * made by leavera77
 */

export function initMapaInteraccionAdminNavegador(map, ctx) {
    if (!map || !ctx) return;
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
        map.on('mouseup', fix);
        map.on('touchend', fix);
        map.on('pointercancel', fix);
    } catch (_) {}
    try {
        if (!window.__gnMapLeafletPanFixGlobal) {
            window.__gnMapLeafletPanFixGlobal = true;
            window.addEventListener(
                'pointerup',
                () => {
                    try {
                        const m = typeof window !== 'undefined' && window.app ? window.app.map : null;
                        if (!m || typeof m.dragging?.enable !== 'function') return;
                        m.dragging.enable();
                    } catch (_) {}
                },
                { passive: true }
            );
        }
    } catch (_) {}
}
