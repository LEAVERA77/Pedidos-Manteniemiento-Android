/**
 * Índice opcional de domicilios (datos abiertos propios) para complementar Nominatim/OSM.
 *
 * Variable de entorno: `LOCAL_ADDRESS_INDEX_PATH` — ruta absoluta o relativa al cwd del proceso
 * a un archivo `.json` o `.csv`. Si no está definida o el archivo no existe, no hay efecto.
 *
 * Formato JSON: array de objetos. Claves reconocidas (insensibles a mayúsculas en CSV header):
 * - localidad (o ciudad, town)
 * - calle (o street, route, road)
 * - numero | n | housenumber | house | puerta (texto; se usa el primer entero, p.ej. "365 B")
 * - lat | latitude | latitud
 * - lng | lon | longitude | longitud
 *
 * Formato CSV: primera fila cabecera con nombres anteriores (cualquier subconjunto coherente).
 * Campos con comillas RFC4180 soportados; separador coma.
 *
 * Clave de búsqueda: localidad y calle normalizadas (minúsculas, sin acentos) + número de puerta
 * (misma lógica que el bot: sin número significativo → "0"). Solo coincidencia exacta de triple.
 *
 * La integración en `nominatimClient.geocodeCalleNumeroLocalidadArgentina` aplica después el mismo
 * acotado por viewbox/centroide de localidad, reverse Nominatim y plausibilidad vs. ancla OSM.
 */

import fs from "fs";
import path from "path";

let _cache = null;

/** @param {string} s */
function normTxt(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** @param {string} numStr */
function parseHouseNumberInt(numStr) {
  const m = String(numStr || "").match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return Number.isFinite(n) ? n : null;
}

function numKeyFromUserInput(numeroStr) {
  const t = parseHouseNumberInt(String(numeroStr ?? ""));
  return t != null && t > 0 ? String(t) : "0";
}

/** @param {string} line */
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

/** @param {string} h */
function normHeader(h) {
  return String(h || "")
    .trim()
    .toLowerCase()
    .replace(/^\ufeff/, "");
}

/**
 * @param {Record<string, string>} row
 * @returns {{ localidad: string, calle: string, numeroKey: string, lat: number, lng: number } | null}
 */
function rowToEntry(row) {
  const L = (k) => row[k] && String(row[k]).trim();
  const loc =
    L("localidad") ||
    L("ciudad") ||
    L("town") ||
    L("city") ||
    L("localidad_nombre");
  const cal =
    L("calle") ||
    L("street") ||
    L("route") ||
    L("road") ||
    L("via");
  const numRaw =
    L("numero") ||
    L("n") ||
    L("housenumber") ||
    L("house") ||
    L("puerta") ||
    L("altura") ||
    "";
  const latS = L("lat") || L("latitude") || L("latitud");
  const lngS = L("lng") || L("lon") || L("longitude") || L("longitud");
  if (!loc || !cal || latS == null || lngS == null) return null;
  const lat = Number(latS.replace(",", "."));
  const lng = Number(lngS.replace(",", "."));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const nk = numKeyFromUserInput(numRaw);
  return { localidad: loc, calle: cal, numeroKey: nk, lat, lng };
}

/**
 * @param {string} content
 * @param {string} ext
 * @returns {Map<string, { lat: number, lng: number }>}
 */
function buildMapFromContent(content, ext) {
  const map = new Map();
  const extL = ext.toLowerCase();
  if (extL === ".json" || content.trim().startsWith("[")) {
    let arr;
    try {
      arr = JSON.parse(content);
    } catch {
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
    return map;
  }

  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return map;
  const headers = splitCsvLine(lines[0]).map(normHeader);
  const idx = (name) => {
    const aliases = Array.isArray(name) ? name : [name];
    for (const a of aliases) {
      const i = headers.indexOf(a);
      if (i >= 0) return i;
    }
    return -1;
  };
  const iLoc = idx(["localidad", "ciudad", "town", "city"]);
  const iCal = idx(["calle", "street", "route", "road", "via"]);
  const iNum = idx(["numero", "n", "housenumber", "house", "puerta", "altura"]);
  const iLat = idx(["lat", "latitude", "latitud"]);
  const iLng = idx(["lng", "lon", "longitude", "longitud"]);
  if (iLoc < 0 || iCal < 0 || iLat < 0 || iLng < 0) return map;

  for (let li = 1; li < lines.length; li++) {
    const cells = splitCsvLine(lines[li]);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] != null ? cells[i] : "";
    });
    const loc = cells[iLoc];
    const cal = cells[iCal];
    const numRaw = iNum >= 0 ? cells[iNum] || "" : "";
    const latS = cells[iLat];
    const lngS = cells[iLng];
    const e = rowToEntry({
      localidad: loc,
      calle: cal,
      numero: numRaw,
      lat: latS,
      lng: lngS,
    });
    if (!e) continue;
    const key = `${normTxt(e.localidad)}|${normTxt(e.calle)}|${e.numeroKey}`;
    map.set(key, { lat: e.lat, lng: e.lng });
  }
  return map;
}

function loadMapFromDisk() {
  const raw = String(process.env.LOCAL_ADDRESS_INDEX_PATH || "").trim();
  if (!raw) return null;
  const resolved = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  if (!fs.existsSync(resolved)) return null;
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) return null;
  const content = fs.readFileSync(resolved, "utf8");
  const ext = path.extname(resolved) || ".csv";
  const map = buildMapFromContent(content, ext);
  return { path: resolved, mtimeMs: stat.mtimeMs, map };
}

function getLoadedMap() {
  const raw = String(process.env.LOCAL_ADDRESS_INDEX_PATH || "").trim();
  if (!raw) return null;
  const resolved = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  let needLoad = !_cache || _cache.path !== resolved;
  if (!needLoad && fs.existsSync(resolved)) {
    try {
      const st = fs.statSync(resolved);
      if (st.mtimeMs !== _cache.mtimeMs) needLoad = true;
    } catch {
      needLoad = true;
    }
  } else if (!needLoad && !fs.existsSync(resolved)) {
    _cache = null;
    return null;
  }
  if (needLoad) {
    try {
      _cache = loadMapFromDisk();
    } catch {
      _cache = null;
    }
  }
  return _cache?.map || null;
}

/** Limpia caché (tests). */
export function clearLocalAddressIndexCacheForTests() {
  _cache = null;
}

/**
 * @param {string} localidad
 * @param {string} calle
 * @param {string} numeroStr
 * @returns {{ lat: number, lng: number } | null}
 */
export function lookupLocalAddressInIndex(localidad, calle, numeroStr) {
  const map = getLoadedMap();
  if (!map || map.size === 0) return null;
  const key = `${normTxt(localidad)}|${normTxt(calle)}|${numKeyFromUserInput(numeroStr)}`;
  return map.get(key) || null;
}

/**
 * Expuesto para tests: parsea contenido en memoria sin leer env.
 * @param {string} content
 * @param {`.json`|`.csv`} kind
 */
export function buildLocalAddressIndexMapFromString(content, kind = ".json") {
  return buildMapFromContent(content, kind);
}
