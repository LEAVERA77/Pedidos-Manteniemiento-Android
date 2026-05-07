/**
 * Paneles del mapa: slideoff, sync desde localStorage, cuerpo colapsado (filtros / capas OSM).
 * Expuesto en `window` para onclick en index.html y app.js.
 *
 * Filtros y capas OSM usan claves v2 (`pmg_map_*`) para no mezclar «panel fuera de pantalla»
 * con «solo cuerpo colapsado». Por defecto al iniciar: panel en slide-off + pestaña lateral visible.
 * made by leavera77
 */

const LS_FILTROS_SLID = 'pmg_map_filtros_slid';
const LS_FILTROS_BODY = 'pmg_map_filtros_body_collapsed';
const LS_CAPAS_SLID = 'pmg_map_capas_slid';
const LS_CAPAS_BODY = 'pmg_map_capas_body_collapsed';
const LS_MAP_PANELS_V2 = 'pmg_map_panels_storage_v2';

function migrateMapFiltrosCapasStorageV2Once() {
    try {
        if (localStorage.getItem(LS_MAP_PANELS_V2) === '1') return;
        const oldF = localStorage.getItem('pmg_slideoff_filtros');
        if (oldF === '0') {
            localStorage.setItem(LS_FILTROS_SLID, '0');
            localStorage.setItem(LS_FILTROS_BODY, '0');
        } else if (oldF === '1') {
            localStorage.setItem(LS_FILTROS_SLID, '0');
            localStorage.setItem(LS_FILTROS_BODY, '1');
        } else {
            localStorage.setItem(LS_FILTROS_SLID, '1');
            localStorage.setItem(LS_FILTROS_BODY, '0');
        }
        const oldC = localStorage.getItem('pmg_slideoff_capas_osm');
        if (oldC === '0') {
            localStorage.setItem(LS_CAPAS_SLID, '0');
            localStorage.setItem(LS_CAPAS_BODY, '0');
        } else if (oldC === '1') {
            localStorage.setItem(LS_CAPAS_SLID, '0');
            localStorage.setItem(LS_CAPAS_BODY, '1');
        } else {
            localStorage.setItem(LS_CAPAS_SLID, '1');
            localStorage.setItem(LS_CAPAS_BODY, '0');
        }
        localStorage.setItem(LS_MAP_PANELS_V2, '1');
    } catch (_) {}
}

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
        if (cardId === 'mapa-card-filtros') localStorage.setItem(LS_FILTROS_SLID, hide ? '1' : '0');
        if (cardId === 'mapa-card-filtro-tipo') localStorage.setItem('pmg_slideoff_filtro_tipo', hide ? '1' : '0');
        if (cardId === 'mapa-card-colores') localStorage.setItem('pmg_slideoff_colores', hide ? '1' : '0');
        if (cardId === 'mapa-card-dashboard') localStorage.setItem('pmg_slideoff_dash', hide ? '1' : '0');
        if (cardId === 'mapa-card-capas-osm') localStorage.setItem(LS_CAPAS_SLID, hide ? '1' : '0');
    } catch (_) {}
}

function syncMapSlideTabsFromStorage() {
    migrateMapFiltrosCapasStorageV2Once();
    const cf = document.getElementById('mapa-card-filtros');
    const tabF = document.getElementById('map-tab-filtros');
    if (cf && cf.style.display !== 'none') {
        const slidF = localStorage.getItem(LS_FILTROS_SLID) !== '0';
        cf.classList.toggle('moui-card-slideoff', slidF);
        try {
            tabF?.classList.toggle('visible', slidF);
        } catch (_) {}
        const bF = document.getElementById('mapa-filtros-body');
        const chF = document.getElementById('mapa-filtros-chevron');
        const bodyCollapsed = localStorage.getItem(LS_FILTROS_BODY) === '1';
        if (bF) bF.classList.toggle('collapsed', bodyCollapsed);
        if (chF) chF.textContent = bodyCollapsed ? '▶' : '▼';
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
    const tabO = document.getElementById('map-tab-capas-osm');
    if (cOsm && cOsm.style.display !== 'none') {
        const slidO = localStorage.getItem(LS_CAPAS_SLID) !== '0';
        cOsm.classList.toggle('moui-card-slideoff', slidO);
        try {
            tabO?.classList.toggle('visible', slidO);
        } catch (_) {}
        const bO = document.getElementById('mapa-capas-osm-body');
        const chO = document.getElementById('mapa-capas-osm-chevron');
        const bodyCollapsedO = localStorage.getItem(LS_CAPAS_BODY) === '1';
        if (bO) bO.classList.toggle('collapsed', bodyCollapsedO);
        if (chO) chO.textContent = bodyCollapsedO ? '▶' : '▼';
    }
}

function toggleMapaFiltrosBody() {
    const b = document.getElementById('mapa-filtros-body');
    const ch = document.getElementById('mapa-filtros-chevron');
    if (!b) return;
    b.classList.toggle('collapsed');
    if (ch) ch.textContent = b.classList.contains('collapsed') ? '▶' : '▼';
    try {
        localStorage.setItem(LS_FILTROS_BODY, b.classList.contains('collapsed') ? '1' : '0');
    } catch (_) {}
}

function toggleMapaCapasOsmBody() {
    const b = document.getElementById('mapa-capas-osm-body');
    const ch = document.getElementById('mapa-capas-osm-chevron');
    if (!b) return;
    b.classList.toggle('collapsed');
    if (ch) ch.textContent = b.classList.contains('collapsed') ? '▶' : '▼';
    try {
        localStorage.setItem(LS_CAPAS_BODY, b.classList.contains('collapsed') ? '1' : '0');
    } catch (_) {}
}

if (typeof window !== 'undefined') {
    window.toggleMapaCardSlideoff = toggleMapaCardSlideoff;
    window.syncMapSlideTabsFromStorage = syncMapSlideTabsFromStorage;
    window.toggleMapaFiltrosBody = toggleMapaFiltrosBody;
    window.toggleMapaCapasOsmBody = toggleMapaCapasOsmBody;
}

export { toggleMapaCardSlideoff, syncMapSlideTabsFromStorage, toggleMapaFiltrosBody, toggleMapaCapasOsmBody };
