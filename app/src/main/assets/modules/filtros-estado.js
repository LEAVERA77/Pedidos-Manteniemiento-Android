/**
 * Paneles del mapa: slideoff, sync desde localStorage, cuerpo colapsado (filtros / capas OSM).
 * Expuesto en `window` para onclick en index.html y app.js.
 * made by leavera77
 */

function mapTabIdForCard(cardId) {
    if (cardId === 'mapa-card-filtros') return 'map-tab-filtros';
    if (cardId === 'mapa-card-filtro-tipo') return 'map-tab-filtro-tipo';
    if (cardId === 'mapa-card-colores') return 'map-tab-colores';
    if (cardId === 'mapa-card-capas-osm') return 'map-tab-capas-osm';
    return 'map-tab-dash';
}

function toggleMapaCardSlideoff(cardId, hide) {
    const el = document.getElementById(cardId);
    const tab = document.getElementById(mapTabIdForCard(cardId));
    if (!el) return;
    if (hide === undefined) hide = !el.classList.contains('moui-card-slideoff');
    const wasSlideoff = el.classList.contains('moui-card-slideoff');
    el.classList.toggle('moui-card-slideoff', !!hide);
    if (tab) tab.classList.toggle('visible', !!hide);
    if (!hide && wasSlideoff && (cardId === 'mapa-card-filtros' || cardId === 'mapa-card-capas-osm')) {
        const bodyId = cardId === 'mapa-card-filtros' ? 'mapa-filtros-body' : 'mapa-capas-osm-body';
        const chId = cardId === 'mapa-card-filtros' ? 'mapa-filtros-chevron' : 'mapa-capas-osm-chevron';
        const b = document.getElementById(bodyId);
        const ch = document.getElementById(chId);
        if (b) b.classList.remove('collapsed');
        if (ch) ch.textContent = '▼';
    }
    try {
        if (cardId === 'mapa-card-filtros') localStorage.setItem('pmg_slideoff_filtros', hide ? '1' : '0');
        if (cardId === 'mapa-card-filtro-tipo') localStorage.setItem('pmg_slideoff_filtro_tipo', hide ? '1' : '0');
        if (cardId === 'mapa-card-colores') localStorage.setItem('pmg_slideoff_colores', hide ? '1' : '0');
        if (cardId === 'mapa-card-dashboard') localStorage.setItem('pmg_slideoff_dash', hide ? '1' : '0');
        if (cardId === 'mapa-card-capas-osm') localStorage.setItem('pmg_slideoff_capas_osm', hide ? '1' : '0');
    } catch (_) {}
}

function syncMapSlideTabsFromStorage() {
    const cf = document.getElementById('mapa-card-filtros');
    if (cf && cf.style.display !== 'none') {
        const vF = localStorage.getItem('pmg_slideoff_filtros');
        cf.classList.remove('moui-card-slideoff');
        try {
            document.getElementById('map-tab-filtros')?.classList.remove('visible');
        } catch (_) {}
        const bF = document.getElementById('mapa-filtros-body');
        const chF = document.getElementById('mapa-filtros-chevron');
        const colF = vF !== '0';
        if (bF) bF.classList.toggle('collapsed', colF);
        if (chF) chF.textContent = colF ? '▶' : '▼';
    }
    const cft = document.getElementById('mapa-card-filtro-tipo');
    if (cft && localStorage.getItem('pmg_slideoff_filtro_tipo') === '1') toggleMapaCardSlideoff('mapa-card-filtro-tipo', true);
    const cc = document.getElementById('mapa-card-colores');
    if (cc && cc.style.display !== 'none' && localStorage.getItem('pmg_slideoff_colores') === '1')
        toggleMapaCardSlideoff('mapa-card-colores', true);
    const cd = document.getElementById('mapa-card-dashboard');
    if (cd && cd.style.display !== 'none' && localStorage.getItem('pmg_slideoff_dash') === '1')
        toggleMapaCardSlideoff('mapa-card-dashboard', true);
    const cOsm = document.getElementById('mapa-card-capas-osm');
    if (cOsm && cOsm.style.display !== 'none') {
        const vOsm = localStorage.getItem('pmg_slideoff_capas_osm');
        cOsm.classList.remove('moui-card-slideoff');
        try {
            document.getElementById('map-tab-capas-osm')?.classList.remove('visible');
        } catch (_) {}
        const bO = document.getElementById('mapa-capas-osm-body');
        const chO = document.getElementById('mapa-capas-osm-chevron');
        const colO = vOsm !== '0';
        if (bO) bO.classList.toggle('collapsed', colO);
        if (chO) chO.textContent = colO ? '▶' : '▼';
    }
}

function toggleMapaFiltrosBody() {
    const b = document.getElementById('mapa-filtros-body');
    const ch = document.getElementById('mapa-filtros-chevron');
    if (!b) return;
    b.classList.toggle('collapsed');
    if (ch) ch.textContent = b.classList.contains('collapsed') ? '▶' : '▼';
    try {
        localStorage.setItem('pmg_slideoff_filtros', b.classList.contains('collapsed') ? '1' : '0');
    } catch (_) {}
}

function toggleMapaCapasOsmBody() {
    const b = document.getElementById('mapa-capas-osm-body');
    const ch = document.getElementById('mapa-capas-osm-chevron');
    if (!b) return;
    b.classList.toggle('collapsed');
    if (ch) ch.textContent = b.classList.contains('collapsed') ? '▶' : '▼';
    try {
        localStorage.setItem('pmg_slideoff_capas_osm', b.classList.contains('collapsed') ? '1' : '0');
    } catch (_) {}
}

if (typeof window !== 'undefined') {
    window.toggleMapaCardSlideoff = toggleMapaCardSlideoff;
    window.syncMapSlideTabsFromStorage = syncMapSlideTabsFromStorage;
    window.toggleMapaFiltrosBody = toggleMapaFiltrosBody;
    window.toggleMapaCapasOsmBody = toggleMapaCapasOsmBody;
}

export { toggleMapaCardSlideoff, syncMapSlideTabsFromStorage, toggleMapaFiltrosBody, toggleMapaCapasOsmBody };
