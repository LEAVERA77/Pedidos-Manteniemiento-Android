/**
 * Marcador verde (misma estética que GPS en app) al ir a Lat/Lng desde el panel de coordenadas.
 * Tras «Ir»: marcador verde; menú contextual; opción Nuevo reclamo (#pm) con mismo flujo que el mapa.
 * made by leavera77
 */

const GOTO_AUTO_HIDE_MS = 12 * 60 * 1000;
/** Pane dedicado: z-index entre marcadores (~600) y popup (700). */
const GOTO_PREVIEW_PANE = 'gnPaneGotoPreview';

let _marker = null;
let _gotoMapRef = null;
let _listenerInstalled = false;
let _autoHideTimer = null;
let _ctxMenuEl = null;
let _onDocPointerDown = null;
let _onKeyEscape = null;

function closeGotoContextMenu() {
    if (_onDocPointerDown) {
        try {
            document.removeEventListener('pointerdown', _onDocPointerDown, true);
        } catch (_) {}
        _onDocPointerDown = null;
    }
    if (_ctxMenuEl) {
        try {
            _ctxMenuEl.remove();
        } catch (_) {}
        _ctxMenuEl = null;
    }
}

function detachGlobalKeys() {
    if (_onKeyEscape) {
        try {
            document.removeEventListener('keydown', _onKeyEscape, true);
        } catch (_) {}
        _onKeyEscape = null;
    }
}

function ensureGotoPreviewPane(map) {
    if (!map || !map.createPane || !map.getPane) return GOTO_PREVIEW_PANE;
    if (!map.getPane(GOTO_PREVIEW_PANE)) {
        map.createPane(GOTO_PREVIEW_PANE);
        const p = map.getPane(GOTO_PREVIEW_PANE);
        p.style.zIndex = 665;
        p.style.pointerEvents = 'auto';
    }
    return GOTO_PREVIEW_PANE;
}

function armGlobalKeys(map) {
    detachGlobalKeys();
    _onKeyEscape = (e) => {
        if (e.key !== 'Escape') return;
        if (_ctxMenuEl) {
            closeGotoContextMenu();
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        if (_marker && map && map.hasLayer && map.hasLayer(_marker)) {
            gnClearMapGotoPreviewMarker(map);
            e.preventDefault();
            e.stopPropagation();
        }
    };
    document.addEventListener('keydown', _onKeyEscape, true);
}

/**
 * Abre #pm con el mismo flujo que `abrirNuevoPedidoEnCoordenadas` (formulario, tipos, NIS, etc.)
 * y programa reverse Nominatim si aplica (cualquier rubro con sesión/API).
 */
async function abrirModalNuevoPedidoDesdeGoto(lat, lng) {
    try {
        if (typeof window !== 'undefined') window._gnSuppressMapClickUntil = Date.now() + 500;
    } catch (_) {}
    const la = Number(lat);
    const lo = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return;
    try {
        if (typeof window.abrirNuevoPedidoEnCoordenadas === 'function') {
            await window.abrirNuevoPedidoEnCoordenadas(la, lo, null);
        }
    } catch (_) {}
    try {
        const fakeE = { latlng: { lat: la, lng: lo }, originalEvent: {} };
        if (
            typeof window.debeReverseNominatimAdminMapTap === 'function' &&
            window.debeReverseNominatimAdminMapTap(fakeE) &&
            typeof window.programarReverseNominatimFormularioNuevoPedidoDesdeMapa === 'function'
        ) {
            window.programarReverseNominatimFormularioNuevoPedidoDesdeMapa(la, lo);
        }
    } catch (_) {}
}

/**
 * Menú contextual junto al cursor: compartir / copiar / quitar.
 * @param {import('leaflet').Map} map
 */
function openGotoContextMenu(map, L, lat, lng, shareText, waHref, domEv) {
    closeGotoContextMenu();
    try {
        if (typeof window !== 'undefined') window._gnSuppressMapClickUntil = Date.now() + 500;
    } catch (_) {}
    try {
        map.closePopup();
    } catch (_) {}

    const vw = typeof window !== 'undefined' ? window.innerWidth : 800;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 600;
    const x = domEv && Number.isFinite(domEv.clientX) ? domEv.clientX : vw / 2;
    const y = domEv && Number.isFinite(domEv.clientY) ? domEv.clientY : vh / 2;
    const menuW = 220;
    const left = Math.max(8, Math.min(x, vw - menuW - 8));
    const top = Math.max(8, Math.min(y, vh - 200));

    const gmaps = `https://www.google.com/maps?q=${lat},${lng}`;
    const lat6m = Number(lat).toFixed(6);
    const lng6m = Number(lng).toFixed(6);
    const copyLineCoords = `${lat6m}, ${lng6m}\n${gmaps}`;

    const el = document.createElement('div');
    el.className = 'gn-goto-ctx-menu';
    el.setAttribute('role', 'menu');
    el.style.cssText = [
        'position:fixed',
        'z-index:100090',
        `left:${left}px`,
        `top:${top}px`,
        'min-width:200px',
        'max-width:min(92vw,280px)',
        'background:#fff',
        'border:1px solid #cbd5e1',
        'border-radius:.5rem',
        'box-shadow:0 12px 36px rgba(15,23,42,.25)',
        'padding:.35rem 0',
        'font-family:system-ui,sans-serif',
        'font-size:.82rem',
        'color:#0f172a',
    ].join(';');

    const mkItem = (label, extraStyle = '') =>
        `<button type="button" role="menuitem" class="gn-goto-ctx-item" style="display:block;width:100%;text-align:left;padding:.5rem .85rem;border:none;background:transparent;cursor:pointer;font:inherit;color:inherit${extraStyle}">${label}</button>`;

    el.innerHTML =
        `<div style="padding:.25rem .65rem .4rem;font-size:.72rem;color:#64748b;font-weight:600">Punto de consulta</div>` +
        mkItem('📋 Copiar coordenadas') +
        mkItem('🗺 Abrir Google Maps (nueva pestaña)') +
        (typeof window !== 'undefined' && typeof window.abrirNuevoPedidoEnCoordenadas === 'function'
            ? mkItem('📝 Nuevo reclamo en este punto', ';border-top:1px solid #e2e8f0;margin-top:.2rem;padding-top:.55rem;font-weight:600')
            : '') +
        `<a role="menuitem" class="gn-goto-ctx-item gn-goto-ctx-link" href="${waHref}" target="_blank" rel="noopener noreferrer" style="display:block;padding:.5rem .85rem;text-decoration:none;color:inherit;background:transparent;border-radius:0">💬 WhatsApp</a>` +
        (typeof navigator !== 'undefined' && typeof navigator.share === 'function'
            ? mkItem('📤 Compartir…', ';border-top:1px solid #e2e8f0;margin-top:.2rem;padding-top:.55rem')
            : '') +
        mkItem('✕ Quitar punto del mapa', ';margin-top:.25rem;border-top:1px solid #e2e8f0;color:#b91c1c;font-weight:600');

    document.body.appendChild(el);
    _ctxMenuEl = el;

    const toastOk = (msg) => {
        try {
            if (typeof window.toast === 'function') window.toast(msg, 'success');
        } catch (_) {}
    };

    el.addEventListener('click', (ev) => {
        const t = ev.target;
        if (!t || !t.closest) return;
        const btn = t.closest('button.gn-goto-ctx-item');
        if (!btn) return;
        ev.preventDefault();
        const lab = String(btn.textContent || '');
        if (lab.includes('Copiar coordenadas') || (lab.includes('Copiar') && lab.includes('coord'))) {
            if (typeof window.copiarTexto === 'function') window.copiarTexto(copyLineCoords);
            else if (navigator.clipboard && navigator.clipboard.writeText) void navigator.clipboard.writeText(copyLineCoords);
            toastOk('Copiado');
            closeGotoContextMenu();
            return;
        }
        if (lab.includes('Google Maps') || lab.includes('Maps')) {
            try {
                window.open(gmaps, '_blank', 'noopener,noreferrer');
            } catch (_) {}
            closeGotoContextMenu();
            return;
        }
        if (lab.includes('Nuevo reclamo')) {
            void abrirModalNuevoPedidoDesdeGoto(lat, lng);
            closeGotoContextMenu();
            return;
        }
        if (lab.includes('Compartir')) {
            void (async () => {
                try {
                    await navigator.share({
                        title: 'Coordenadas',
                        text: shareText,
                        url: gmaps,
                    });
                } catch (_) {}
            })();
            closeGotoContextMenu();
            return;
        }
        if (lab.includes('Quitar')) {
            gnRequestClearGotoPreviewMarker();
        }
    });

    _onDocPointerDown = (ev) => {
        if (_ctxMenuEl && !_ctxMenuEl.contains(ev.target)) closeGotoContextMenu();
    };
    document.addEventListener('pointerdown', _onDocPointerDown, true);

    try {
        if (L && L.DomEvent && typeof L.DomEvent.preventDefault === 'function') L.DomEvent.preventDefault(domEv);
    } catch (_) {}
    try {
        if (domEv && typeof domEv.preventDefault === 'function') domEv.preventDefault();
    } catch (_) {}
}

export function gnClearMapGotoPreviewMarker(map) {
    const m = map || _gotoMapRef;
    closeGotoContextMenu();
    detachGlobalKeys();
    if (_autoHideTimer) {
        try {
            clearTimeout(_autoHideTimer);
        } catch (_) {}
        _autoHideTimer = null;
    }
    if (_marker && m) {
        try {
            m.removeLayer(_marker);
        } catch (_) {}
    }
    _marker = null;
    _gotoMapRef = null;
}

export function gnInstallGotoPreviewClearOnEvent() {
    if (typeof window === 'undefined' || _listenerInstalled) return;
    _listenerInstalled = true;
    window.addEventListener('gn-clear-goto-preview-marker', () => {
        try {
            const m = (window.app && window.app.map) || _gotoMapRef;
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

    const hit = 48;
    const svgIcon = L.divIcon({
        className: 'gn-goto-preview-hit',
        html: `<div class="gn-goto-preview-hit-inner" style="
            width:${hit}px;height:${hit}px;
            display:flex;align-items:center;justify-content:center;
            pointer-events:auto;cursor:pointer;
            touch-action:manipulation;
        "><span style="
            display:block;width:18px;height:18px;
            background:#10b981;border:3px solid #fff;border-radius:50%;
            box-shadow:0 0 0 3px rgba(16,185,129,.45);
        "></span></div>`,
        iconSize: [hit, hit],
        iconAnchor: [hit / 2, hit / 2],
        popupAnchor: [0, -14],
    });
    const mkOpt = {
        icon: svgIcon,
        zIndexOffset: 5000,
        bubblingMouseEvents: false,
        pane: ensureGotoPreviewPane(map),
    };

    const lat6 = lat.toFixed(6);
    const lng6 = lng.toFixed(6);
    const shareText = `📍 ${lat6}, ${lng6}\nhttps://www.google.com/maps?q=${lat},${lng}`;
    const enc = encodeURIComponent(shareText);
    const waHref = `https://wa.me/?text=${enc}`;
    const gmapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
    const copyClipboardLine = `${lat6}, ${lng6}\n${gmapsUrl}`;
    const encCopy = encodeURIComponent(copyClipboardLine);

    const btnCompact = 'font-size:.64rem;padding:.2rem .32rem;line-height:1.15;border-radius:.32rem;font-weight:600';
    const popupHtml =
        `<div class="gn-goto-preview-popup" style="font-family:system-ui;min-width:188px;max-width:min(92vw,272px)">` +
        `<b style="color:#059669;font-size:.84rem">📍 Punto en el mapa</b><br>` +
        `<span style="font-size:10px;color:#94a3b8">${lat6}, ${lng6}</span>` +
        `<p style="font-size:.68rem;color:#64748b;margin:.38rem 0 .28rem;line-height:1.32">` +
        `<strong>Maps</strong> abre Google en pestaña nueva. <strong>Nuevo reclamo</strong> = mismo alta que el mapa (dirección automática si aplica).` +
        `</p>` +
        `<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:2px;width:100%;align-items:stretch">` +
        `<button type="button" class="bp gn-goto-preview-copy" data-gn-copy="${encCopy}" style="${btnCompact}">Copiar coords</button>` +
        `<a class="gn-goto-preview-gmaps" href="${gmapsUrl}" target="_blank" rel="noopener noreferrer" style="${btnCompact};text-align:center;text-decoration:none;border:1.5px solid #cbd5e1;color:#1d4ed8;background:#fff;display:flex;align-items:center;justify-content:center;box-sizing:border-box">Maps</a>` +
        `<button type="button" class="bp gn-goto-preview-nuevo" style="grid-column:1/-1;font-size:.72rem;padding:.34rem .45rem;border-radius:.35rem;font-weight:700;background:#2563eb;color:#fff;border:none;cursor:pointer;line-height:1.2;margin-top:1px">Nuevo reclamo</button>` +
        `<a class="ba2 gn-goto-preview-wa" href="${waHref}" target="_blank" rel="noopener noreferrer" style="font-size:.62rem;padding:.22rem .4rem;border-radius:.35rem;display:inline-flex;align-items:center;justify-content:center;gap:.25rem"><i class="fab fa-whatsapp"></i> WA</a>` +
        `<button type="button" class="sec gn-goto-preview-share" style="display:none;font-size:.62rem;padding:.2rem .28rem">Compartir</button>` +
        `<button type="button" class="sec gn-goto-preview-remove" style="grid-column:1/-1;font-size:.62rem;padding:.22rem .35rem;color:#b91c1c;border-color:#fecaca;border-radius:.32rem;margin-top:1px" onclick="event.preventDefault();event.stopPropagation();try{window.dispatchEvent(new CustomEvent('gn-clear-goto-preview-marker'));}catch(_){}return false;">Quitar</button>` +
        `</div></div>`;

    _marker = L.marker([lat, lng], mkOpt).addTo(map).bindPopup(popupHtml, { maxWidth: 292 });
    _gotoMapRef = map;
    try {
        _marker.bindTooltip('Copiar / Maps / Nuevo reclamo · clic derecho menú · Esc quita', {
            direction: 'top',
            sticky: true,
            opacity: 0.95,
        });
    } catch (_) {}

    const onLeafletContextMenu = (e) => {
        try {
            const oe = e && e.originalEvent;
            openGotoContextMenu(map, L, lat, lng, shareText, waHref, oe);
        } catch (_) {}
    };
    _marker.on('contextmenu', onLeafletContextMenu);

    /** Leaflet a veces no recibe contextmenu en WebView; el DOM sí. */
    const bindDomHitLayer = () => {
        requestAnimationFrame(() => {
            const el = _marker.getElement && _marker.getElement();
            if (!el) return;
            el.style.pointerEvents = 'auto';
            el.style.cursor = 'pointer';
            const onDomContextMenu = (domEv) => {
                try {
                    domEv.preventDefault();
                    domEv.stopPropagation();
                } catch (_) {}
                openGotoContextMenu(map, L, lat, lng, shareText, waHref, domEv);
            };
            el.addEventListener('contextmenu', onDomContextMenu, true);
        });
    };
    _marker.on('add', bindDomHitLayer);

    /** Un toque / clic abre el popup (móvil); no burbujea al mapa (evita #pm / limpiar marcador). */
    _marker.on('click', (e) => {
        try {
            if (typeof window !== 'undefined') window._gnSuppressMapClickUntil = Date.now() + 500;
        } catch (_) {}
        try {
            if (L.DomEvent && typeof L.DomEvent.stopPropagation === 'function') L.DomEvent.stopPropagation(e);
        } catch (_) {}
        try {
            if (e && e.originalEvent && typeof e.originalEvent.stopPropagation === 'function') e.originalEvent.stopPropagation();
        } catch (_) {}
        try {
            _marker.openPopup();
        } catch (_) {}
    });

    setTimeout(() => {
        try {
            if (_marker && map.hasLayer(_marker)) _marker.openPopup();
        } catch (_) {}
    }, 200);

    const bindPopupUi = () => {
        const tryBind = (attempt) => {
            const pu = _marker && _marker.getPopup && _marker.getPopup();
            const root = pu && pu.getElement && pu.getElement();
            const scope =
                (root && root.querySelector && root.querySelector('.leaflet-popup-content')) || root;
            if (!scope || !scope.querySelector || !scope.querySelector('.gn-goto-preview-remove')) {
                if (attempt < 5) setTimeout(() => tryBind(attempt + 1), 25);
                return;
            }
            const nuevo = scope.querySelector('.gn-goto-preview-nuevo');
            if (nuevo) {
                if (typeof window.abrirNuevoPedidoEnCoordenadas !== 'function') {
                    try {
                        nuevo.style.display = 'none';
                    } catch (_) {}
                } else {
                    nuevo.addEventListener(
                        'click',
                        async (ev) => {
                            ev.preventDefault();
                            ev.stopPropagation();
                            try {
                                if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
                            } catch (_) {}
                            try {
                                if (typeof window !== 'undefined') window._gnSuppressMapClickUntil = Date.now() + 500;
                            } catch (_) {}
                            try {
                                map.closePopup();
                            } catch (_) {}
                            await abrirModalNuevoPedidoDesdeGoto(lat, lng);
                        },
                        { capture: true, once: true }
                    );
                }
            }
            const copyB = scope.querySelector('.gn-goto-preview-copy');
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
            const sh = scope.querySelector('.gn-goto-preview-share');
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
            /** Quitar: onclick en HTML + refuerzo (Leaflet/WebView). */
            const rm = scope.querySelector('.gn-goto-preview-remove');
            if (rm) {
                const onRm = (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    try {
                        if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
                    } catch (_) {}
                    try {
                        map.closePopup();
                    } catch (_) {}
                    gnRequestClearGotoPreviewMarker();
                };
                rm.addEventListener('click', onRm, { capture: true });
            }
        };
        tryBind(1);
    };

    _marker.on('popupopen', bindPopupUi);

    armGlobalKeys(map);

    _autoHideTimer = setTimeout(() => {
        _autoHideTimer = null;
        if (_marker && map && map.hasLayer(_marker)) {
            gnClearMapGotoPreviewMarker(map);
            try {
                if (typeof window.toast === 'function') window.toast('Marcador de consulta oculto (tiempo máximo).', 'info');
            } catch (_) {}
        }
    }, GOTO_AUTO_HIDE_MS);
}
