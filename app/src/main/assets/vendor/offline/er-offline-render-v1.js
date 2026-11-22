import { osmCells } from './er-osm-index-v1.js';

// Extracto OSM empaquetado (no son teselas descargadas del servidor OSM).
// Cada celda se carga solo cuando entra en pantalla y se descarta con un límite de memoria.
const Z = 11, N = 1 << Z, MAX_CACHED_CELLS = 8;
const minorRoads = new Set(['service', 'footway', 'path', 'cycleway', 'steps', 'bridleway', 'pedestrian']);
const localRoads = new Set(['residential', 'living_street']);
const majorRoads = new Set(['motorway','motorway_link','trunk','trunk_link','primary','primary_link','secondary','secondary_link']);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function tileX(lng) { return Math.floor((clamp(lng, -180, 179.999999) + 180) / 360 * N); }
function tileY(lat) {
    const r = clamp(lat, -85.05112878, 85.05112878) * Math.PI / 180;
    return clamp(Math.floor((1 - Math.asinh(Math.tan(r)) / Math.PI) / 2 * N), 0, N - 1);
}
function roadVisible(type, zoom) {
    if (zoom < 13) return majorRoads.has(type);
    if (zoom < 14) return !minorRoads.has(type) && !localRoads.has(type);
    if (zoom < 16) return !minorRoads.has(type);
    return true;
}

export function createOfflineDetails(L, map, onStatus = () => {}) {
    const cache = new Map();
    let active = false, generation = 0, timer = null;
    const layer = L.layerGroup([], {
        attribution: 'Calles y red: &copy; <a href="https://www.openstreetmap.org/copyright">colaboradores de OpenStreetMap</a> (ODbL)'
    });
    async function fetchCell(key) {
        if (cache.has(key)) {
            const data = cache.get(key);
            cache.delete(key); cache.set(key, data);
            return data;
        }
        const response = await fetch(new URL(`./er-osm-v1/${key}.json`, import.meta.url));
        if (!response.ok) throw new Error('Celda no disponible');
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error('Celda inválida');
        cache.set(key, data);
        while (cache.size > MAX_CACHED_CELLS) cache.delete(cache.keys().next().value);
        return data;
    }
    function schedule() {
        clearTimeout(timer);
        timer = setTimeout(() => { void render(); }, 160);
    }
    async function render() {
        if (!active) return;
        const run = ++generation, zoom = map.getZoom();
        if (zoom < 12) {
            layer.clearLayers();
            onStatus('Acercá el mapa para ver calles y líneas eléctricas de OSM.');
            return;
        }
        const b = map.getBounds();
        const x0 = tileX(b.getWest()), x1 = tileX(b.getEast());
        const y0 = tileY(b.getNorth()), y1 = tileY(b.getSouth());
        const keys = [];
        for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
            const k = `${x}-${y}`;
            if (osmCells.has(k)) keys.push(k);
        }
        if (!keys.length) {
            layer.clearLayers();
            onStatus('Sin detalle OSM para esta zona. Solo se muestra la base esquemática si está disponible.');
            return;
        }
        if (keys.length > 24) {
            onStatus('Acercá el mapa para cargar el detalle de esta zona.');
            layer.clearLayers();
            return;
        }
        onStatus('Cargando detalle local de calles y líneas eléctricas…');
        const results = [];
        let errors = 0, next = 0;
        async function worker() {
            while (next < keys.length && active && run === generation) {
                const key = keys[next++];
                try { results.push(await fetchCell(key)); } catch (_) { errors++; }
            }
        }
        await Promise.all(Array.from({ length: Math.min(4, keys.length) }, worker));
        if (!active || run !== generation) return;
        const groups = { major: [], local: [], minor: [], power: [], minorPower: [] };
        const names = [], ids = new Set(), box = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
        for (const cell of results) for (const row of cell) {
            if (!Array.isArray(row) || row.length < 7 || ids.has(row[6])) continue;
            const [kind, type, name, , extent, points, id] = row;
            if (!extent || extent[2] < box[0] || extent[0] > box[2] || extent[3] < box[1] || extent[1] > box[3]) continue;
            if (kind === 'r' && !roadVisible(type, zoom)) continue;
            ids.add(id);
            const ll = points.map(p => [p[1], p[0]]);
            const group = kind === 'p' ? (type === 'minor_line' ? 'minorPower' : 'power')
                : majorRoads.has(type) ? 'major' : minorRoads.has(type) ? 'minor' : 'local';
            groups[group].push(ll);
            if (kind === 'r' && zoom >= 16 && name && names.length < 400) {
                const mid = ll[Math.floor(ll.length / 2)];
                if (b.contains(mid)) names.push([name, mid]);
            }
        }
        const fresh = L.layerGroup();
        const styles = {
            major: { color: '#c97638', weight: 2.8, opacity: 0.95 },
            local: { color: '#8b8177', weight: 1.8, opacity: 0.85 },
            minor: { color: '#b9ada1', weight: 1, opacity: 0.8, dashArray: '3 3' },
            power: { color: '#a31667', weight: 2.8, opacity: 0.9, dashArray: '9 4' },
            minorPower: { color: '#c4498a', weight: 1.8, opacity: 0.9, dashArray: '5 5' }
        };
        for (const [key, segments] of Object.entries(groups)) {
            if (segments.length) L.polyline(segments, { ...styles[key], interactive: false }).addTo(fresh);
        }
        // Pocas etiquetas no interactivas, sin insertar HTML recibido desde los datos OSM.
        const usedNames = new Set(), bins = new Set();
        for (const [name, mid] of names) {
            if (usedNames.has(name) || usedNames.size >= 30) continue;
            const p = map.latLngToContainerPoint(mid), bin = `${Math.floor(p.x / 110)}:${Math.floor(p.y / 45)}`;
            if (bins.has(bin)) continue;
            bins.add(bin); usedNames.add(name);
            const text = document.createElement('span');
            text.textContent = name;
            text.style.cssText = 'font:11px system-ui;color:#334155;background:#ffffffe0;padding:1px 3px;border-radius:2px;white-space:nowrap;pointer-events:none;text-shadow:0 1px white';
            L.marker(mid, { interactive: false, icon: L.divIcon({ className: '', html: text, iconSize: [0,0] }) }).addTo(fresh);
        }
        layer.clearLayers(); fresh.addTo(layer);
        onStatus(errors ? 'Falta parte del detalle local. Actualizá la APK y abrí el mapa con conexión.'
            : 'Calles OSM y líneas en violeta: información incompleta y no oficial; no usar para maniobras eléctricas.');
    }
    function start() {
        if (active) return;
        active = true; layer.addTo(map);
        map.on('moveend zoomend', schedule);
        void render();
    }
    function stop() {
        if (!active) return;
        active = false; generation++;
        clearTimeout(timer); map.off('moveend zoomend', schedule);
        layer.clearLayers(); cache.clear();
        if (map.hasLayer(layer)) map.removeLayer(layer);
    }
    return { start, stop };
}
