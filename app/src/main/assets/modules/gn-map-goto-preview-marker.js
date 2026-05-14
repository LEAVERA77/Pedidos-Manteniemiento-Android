/**
 * Marcador verde (misma estética que GPS en app) al ir a Lat/Lng desde el panel de coordenadas.
 * No abre #pm; se limpia con el evento global `gn-clear-goto-preview-marker`.
 * made by leavera77
 */

let _marker = null;
let _listenerInstalled = false;

export function gnClearMapGotoPreviewMarker(map) {
    if (_marker && map) {
        try {
            map.removeLayer(_marker);
        } catch (_) {}
    }
    _marker = null;
}

export function gnInstallGotoPreviewClearOnEvent() {
    if (typeof window === 'undefined' || _listenerInstalled) return;
    _listenerInstalled = true;
    window.addEventListener('gn-clear-goto-preview-marker', () => {
        try {
            const m = window.app && window.app.map;
            if (m) gnClearMapGotoPreviewMarker(m);
        } catch (_) {}
    });
}

/** Disparar limpieza desde app.js con una sola línea (sin importar el mapa en cada sitio). */
export function gnRequestClearGotoPreviewMarker() {
    try {
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('gn-clear-goto-preview-marker'));
    } catch (_) {}
}

/**
 * @param {import('leaflet').Map} map
 * @param {*} L
 * @param {number} lat
 * @param {number} lng
 */
export function gnShowMapGotoPreviewMarker(map, L, lat, lng) {
    gnClearMapGotoPreviewMarker(map);
    if (!map || !L || !Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const paneGps = map.getPane && map.getPane('gnPaneGpsUser') ? 'gnPaneGpsUser' : undefined;
    const svgIcon = L.divIcon({
        className: '',
        html: `<div style="
            width:16px;height:16px;
            background:#10b981;
            border:3px solid white;
            border-radius:50%;
            box-shadow:0 0 0 3px rgba(16,185,129,.4);
            position:relative;
        "></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        popupAnchor: [0, -10],
    });
    const mkOpt = { icon: svgIcon, zIndexOffset: 205 };
    if (paneGps) mkOpt.pane = paneGps;

    const lat6 = lat.toFixed(6);
    const lng6 = lng.toFixed(6);
    const shareText = `📍 ${lat6}, ${lng6}\nhttps://www.google.com/maps?q=${lat},${lng}`;
    const enc = encodeURIComponent(shareText);
    const waHref = `https://wa.me/?text=${enc}`;

    const popupHtml =
        `<div class="gn-goto-preview-popup" style="font-family:system-ui;min-width:200px">` +
        `<b style="color:#059669">📍 Punto en el mapa</b><br>` +
        `<span style="font-size:10px;color:#94a3b8">${lat6}, ${lng6}</span>` +
        `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;align-items:center">` +
        `<button type="button" class="bp gn-goto-preview-copy" data-gn-copy="${enc}">Copiar texto</button>` +
        `<a class="ba2" style="font-size:.78rem;padding:.25rem .55rem;text-decoration:none;display:inline-flex;align-items:center;gap:.25rem;background:#128C7E;color:#fff;border-color:#128C7E;border-radius:2rem" href="${waHref}" target="_blank" rel="noopener noreferrer"><i class="fab fa-whatsapp"></i> WhatsApp</a>` +
        `<button type="button" class="sec gn-goto-preview-share" style="display:none;font-size:.78rem;padding:.25rem .5rem">Compartir…</button>` +
        `</div></div>`;

    _marker = L.marker([lat, lng], mkOpt).addTo(map).bindPopup(popupHtml, { maxWidth: 300 });

    const bindPopupUi = () => {
        const wrap = _marker.getPopup && _marker.getPopup().getElement && _marker.getPopup().getElement();
        if (!wrap) return;
        const copyB = wrap.querySelector('.gn-goto-preview-copy');
        if (copyB) {
            copyB.addEventListener(
                'click',
                (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    const raw = decodeURIComponent(String(copyB.getAttribute('data-gn-copy') || ''));
                    if (typeof window.copiarTexto === 'function') window.copiarTexto(raw);
                    else if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
                        void navigator.clipboard.writeText(raw).catch(() => {});
                    }
                },
                { once: true }
            );
        }
        const sh = wrap.querySelector('.gn-goto-preview-share');
        if (sh && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
            sh.style.display = 'inline-flex';
            sh.addEventListener(
                'click',
                async (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    try {
                        await navigator.share({
                            title: 'Coordenadas',
                            text: shareText,
                            url: `https://www.google.com/maps?q=${lat},${lng}`,
                        });
                    } catch (_) {}
                },
                { once: true }
            );
        }
    };

    _marker.on('popupopen', bindPopupUi);
}
