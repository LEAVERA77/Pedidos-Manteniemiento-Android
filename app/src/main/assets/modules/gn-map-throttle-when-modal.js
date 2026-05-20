/**
 * WebView gama media: reduce trabajo de Leaflet mientras el detalle de pedido (#dm) está abierto.
 * made by leavera77
 */

const SHELL_CLASS = 'gn-android-shell';
const MAP_SUPPRESSED_CLASS = 'gn-shell-map-suppressed-for-detalle';

/** @type {{ dragging?: boolean; scrollWheelZoom?: boolean; doubleClickZoom?: boolean } | null} */
let _leafletHandlers = null;

function isAndroidShellDoc() {
    try {
        return document.documentElement.classList.contains(SHELL_CLASS);
    } catch (_) {
        return false;
    }
}

/** @returns {any} */
function getAppMap() {
    try {
        const m = typeof window !== 'undefined' && window.app && window.app.map ? window.app.map : null;
        return m && typeof m.invalidateSize === 'function' ? m : null;
    } catch (_) {
        return null;
    }
}

export function gnMapThrottleOnDetallePedidoOpened() {
    if (!isAndroidShellDoc()) return;

    // `detalle()` puede re-ejecutarse con #dm ya abierto (refetch): restaurar antes de volver a suprimir.
    gnMapThrottleOnDetallePedidoClosed();

    try {
        document.documentElement.classList.add(MAP_SUPPRESSED_CLASS);
    } catch (_) {}

    const map = getAppMap();
    if (map) {
        try {
            if (typeof map.stop === 'function') map.stop();
        } catch (_) {}
    }

    if (!map) return;

    _leafletHandlers = {};
    try {
        if (map.dragging && map.dragging.enabled()) {
            map.dragging.disable();
            _leafletHandlers.dragging = true;
        }
    } catch (_) {}
    try {
        if (map.scrollWheelZoom && map.scrollWheelZoom.enabled()) {
            map.scrollWheelZoom.disable();
            _leafletHandlers.scrollWheelZoom = true;
        }
    } catch (_) {}
    try {
        if (map.doubleClickZoom && map.doubleClickZoom.enabled()) {
            map.doubleClickZoom.disable();
            _leafletHandlers.doubleClickZoom = true;
        }
    } catch (_) {}
}

export function gnMapThrottleOnDetallePedidoClosed() {
    try {
        document.documentElement.classList.remove(MAP_SUPPRESSED_CLASS);
    } catch (_) {}

    const map = getAppMap();
    const h = _leafletHandlers;
    _leafletHandlers = null;

    if (map && h) {
        try {
            if (h.doubleClickZoom) map.doubleClickZoom.enable();
        } catch (_) {}
        try {
            if (h.scrollWheelZoom) map.scrollWheelZoom.enable();
        } catch (_) {}
        try {
            if (h.dragging) map.dragging.enable();
        } catch (_) {}
    }

    requestAnimationFrame(() => {
        try {
            const m = getAppMap();
            if (m) m.invalidateSize({ animate: false });
        } catch (_) {}
    });
}
