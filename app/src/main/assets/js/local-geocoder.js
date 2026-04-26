/**
 * local-geocoder.js - Módulo para geocodificación local basada en un índice de direcciones.
 * Portado de api/services/localAddressIndex.js para uso en el frontend (WebView).
 */

let _localIndexMap = new Map();
let _localIndexLoaded = false;

/** Normaliza texto para búsqueda (minúsculas, sin acentos). */
function normTxt(s) {
    return String(s || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
}

/** Extrae el primer número entero de una cadena. */
function parseHouseNumberInt(numStr) {
    const m = String(numStr || "").match(/\d+/);
    if (!m) return null;
    const n = parseInt(m[0], 10);
    return Number.isFinite(n) ? n : null;
}

/** Genera la clave numérica para el índice. */
function numKeyFromUserInput(numeroStr) {
    const t = parseHouseNumberInt(String(numeroStr ?? ""));
    return t != null && t > 0 ? String(t) : "0";
}

/** Divide una línea CSV respetando comillas. */
function splitCsvLine(line) {
    const out = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            inQ = !inQ;
            continue;
        }
        if (!inQ && ch === ",") {
            out.push(cur.trim());
            cur = "";
            continue;
        }
        cur += ch;
    }
    out.push(cur.trim());
    return out;
}

/** Normaliza nombres de cabecera. */
function normHeader(h) {
    return String(h || "")
        .trim()
        .toLowerCase()
        .replace(/^\ufeff/, "");
}

/** Convierte una fila de datos en una entrada del índice. */
function rowToEntry(row) {
    const L = (k) => row[k] && String(row[k]).trim();
    const loc = L("localidad") || L("ciudad") || L("town") || L("city") || L("localidad_nombre");
    const cal = L("calle") || L("street") || L("route") || L("road") || L("via");
    const numRaw = L("numero") || L("n") || L("housenumber") || L("house") || L("puerta") || L("altura") || "";
    const latS = L("lat") || L("latitude") || L("latitud");
    const lngS = L("lng") || L("lon") || L("longitude") || L("longitud");

    if (!loc || !cal || latS == null || lngS == null) return null;

    const lat = parseFloat(latS.replace(",", "."));
    const lng = parseFloat(lngS.replace(",", "."));

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const nk = numKeyFromUserInput(numRaw);
    return { localidad: loc, calle: cal, numeroKey: nk, lat, lng };
}

/** Construye el Map a partir del contenido del archivo. */
function buildMapFromContent(content, isJson) {
    const map = new Map();
    if (isJson) {
        let arr;
        try {
            arr = JSON.parse(content);
        } catch (e) {
            console.error("Error parseando JSON de direcciones locales:", e);
            return map;
        }
        if (!Array.isArray(arr)) return map;
        for (const item of arr) {
            if (!item || typeof item !== "object") continue;
            const row = {};
            for (const [k, v] of Object.entries(item)) {
                row[normHeader(k)] = v != null ? String(v) : "";
            }
            const e = rowToEntry(row);
            if (!e) continue;
            const key = `${normTxt(e.localidad)}|${normTxt(e.calle)}|${e.numeroKey}`;
            map.set(key, { lat: e.lat, lng: e.lng });
        }
    } else {
        const lines = content.split(/\r?\n/).filter((l) => l.trim());
        if (lines.length < 2) return map;
        const headers = splitCsvLine(lines[0]).map(normHeader);
        for (let li = 1; li < lines.length; li++) {
            const cells = splitCsvLine(lines[li]);
            const row = {};
            headers.forEach((h, i) => {
                row[h] = cells[i] != null ? cells[i] : "";
            });
            const e = rowToEntry(row);
            if (!e) continue;
            const key = `${normTxt(e.localidad)}|${normTxt(e.calle)}|${e.numeroKey}`;
            map.set(key, { lat: e.lat, lng: e.lng });
        }
    }
    return map;
}

/** Inicializa el índice cargando el archivo desde la ruta configurada. */
export async function initLocalAddressIndex(filePath) {
    if (!filePath) return;
    try {
        const response = await fetch(filePath);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const content = await response.text();
        const isJson = filePath.toLowerCase().endsWith('.json') || content.trim().startsWith('[');
        _localIndexMap = buildMapFromContent(content, isJson);
        _localIndexLoaded = true;
        console.log(`Índice de direcciones locales cargado: ${_localIndexMap.size} entradas.`);
    } catch (e) {
        console.error("Error cargando índice de direcciones locales:", e);
    }
}

/** Busca una dirección en el índice local. */
export function lookupLocalAddress(localidad, calle, numeroStr) {
    if (!_localIndexLoaded || _localIndexMap.size === 0) return null;
    const key = `${normTxt(localidad)}|${normTxt(calle)}|${numKeyFromUserInput(numeroStr)}`;
    return _localIndexMap.get(key) || null;
}

// Inyectar en el objeto global para acceso desde otros scripts no-ESM si es necesario
window.lookupLocalAddress = lookupLocalAddress;
window.initLocalAddressIndex = initLocalAddressIndex;
