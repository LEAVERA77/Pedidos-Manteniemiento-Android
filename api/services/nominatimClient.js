/**
 * Cliente Nominatim (OSM) con rate limit ~1 req/s y cabeceras de uso responsable.
 * @see https://operations.osmfoundation.org/policies/nominatim/
 */

const MIN_INTERVAL_MS = 1100;
let _lastAt = 0;
let _chain = Promise.resolve();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function throttle() {
  _chain = _chain.then(async () => {
    const now = Date.now();
    const wait = _lastAt + MIN_INTERVAL_MS - now;
    if (wait > 0) await sleep(wait);
    _lastAt = Date.now();
  });
  return _chain;
}

function nominatimHeaders() {
  const ua =
    process.env.NOMINATIM_USER_AGENT ||
    "GestorNova-SaaS/1.0 (cooperativa electrica; +https://github.com/LEAVERA77/Pedidos-MG)";
  const from = process.env.NOMINATIM_FROM_EMAIL || process.env.NOMINATIM_FROM || "noreply@gestornova.local";
  return {
    "User-Agent": ua,
    From: from,
    Accept: "application/json",
  };
}

function nominatimBaseParams() {
  return new URLSearchParams({
    format: "json",
    addressdetails: "1",
    "accept-language": "es",
    countrycodes: "ar",
    email: process.env.NOMINATIM_FROM_EMAIL || process.env.NOMINATIM_FROM || "",
  });
}

/**
 * Barrio / zona urbana desde addressdetails de Nominatim (útil para municipios).
 * Orden: más específico primero.
 */
export function barrioDesdeNominatimAddress(addr) {
  if (!addr || typeof addr !== "object") return null;
  const keys = ["neighbourhood", "suburb", "quarter", "city_district", "hamlet", "village"];
  for (const k of keys) {
    const v = addr[k];
    if (v == null) continue;
    const s = String(v).trim();
    if (s.length >= 2 && s.length <= 200) return s;
  }
  return null;
}

/**
 * @param {string} query
 * @returns {Promise<{ lat: number, lng: number, displayName: string, barrio?: string } | null>}
 */
export async function geocodeAddressArgentina(query) {
  const q = String(query || "").trim();
  if (q.length < 3) return null;
  await throttle();
  const p = nominatimBaseParams();
  p.set("q", q);
  const url = `https://nominatim.openstreetmap.org/search?${p.toString()}`;
  const res = await fetch(url, { headers: nominatimHeaders() });
  if (!res.ok) return null;
  const arr = await res.json();
  if (!Array.isArray(arr) || !arr.length) return null;
  const hit = arr[0];
  const lat = Number(hit.lat);
  const lng = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const barrio = barrioDesdeNominatimAddress(hit.address);
  return {
    lat,
    lng,
    displayName: String(hit.display_name || q).trim(),
    ...(barrio ? { barrio } : {}),
  };
}

function normTxt(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Requiere que el resultado de Nominatim mencione la localidad (evita homónimos, ej. Mitre en otra ciudad). */
function nominatimDisplayMatchesLocalidad(displayName, localidad) {
  const dn = normTxt(displayName);
  const loc = normTxt(localidad);
  if (!loc || loc.length < 2) return true;
  const tokens = loc.split(/\s+/).filter((t) => t.length > 2);
  if (!tokens.length) return dn.includes(loc);
  return tokens.some((t) => dn.includes(t));
}

function calleTokensNorm(calle) {
  let s = normTxt(calle);
  s = s.replace(/^(calle|avenida|av|av\.|diag|diag\.|diagonal|ruta|pasaje|pje|boulevard|bv)\s+/u, "");
  const tokens = s.split(/[\s,.]+/).filter((t) => t.length > 2);
  return tokens.length ? tokens : (s.length >= 2 ? [s] : []);
}

/** La vía debe aparecer en el display (evita tomar otro domicilio en la misma ciudad). */
export function nominatimDisplayMatchesCalle(displayName, calle) {
  const dn = normTxt(displayName);
  const tokens = calleTokensNorm(calle);
  if (!tokens.length) return true;
  return tokens.every((t) => dn.includes(t));
}

/**
 * Geocodifica calle + número + ciudad en Argentina con varias variantes de consulta.
 * @returns {Promise<{ lat: number, lng: number, displayName: string } | null>}
 */
export async function geocodeCalleNumeroLocalidadArgentina(ciudad, calle, numero) {
  const c = String(ciudad || "").trim();
  const cal = String(calle || "").trim();
  const n = String(numero || "").trim();
  if (c.length < 2 || cal.length < 2 || n.length < 1) return null;
  const attempts = [
    `${n} ${cal}, ${c}, Argentina`,
    `${cal} ${n}, ${c}, Argentina`,
    `${cal}, ${n}, ${c}, Argentina`,
    `${c}, ${cal} ${n}, Argentina`,
    `${cal} ${n}, ${c}, Entre Ríos, Argentina`,
    `${cal} ${n}, ${c}, Buenos Aires, Argentina`,
  ];
  for (const q of attempts) {
    const g = await geocodeAddressArgentina(q);
    if (
      g &&
      nominatimDisplayMatchesLocalidad(g.displayName, c) &&
      nominatimDisplayMatchesCalle(g.displayName, cal)
    ) {
      return g;
    }
  }
  return null;
}

/**
 * @returns {Promise<{ displayName: string } | null>}
 */
/** Distancia en metros (WGS84, esfera). */
export function haversineMeters(lat1, lng1, lat2, lng2) {
  const a1 = Number(lat1);
  const o1 = Number(lng1);
  const a2 = Number(lat2);
  const o2 = Number(lng2);
  if (![a1, o1, a2, o2].every((x) => Number.isFinite(x))) return Infinity;
  const R = 6371000;
  const toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(a2 - a1);
  const dLon = toR(o2 - o1);
  const s1 = Math.sin(dLat / 2) ** 2;
  const s2 = Math.cos(toR(a1)) * Math.cos(toR(a2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s1 + s2)));
}

/** Primer entero en el string (número de puerta). */
export function parseHouseNumberInt(numStr) {
  const m = String(numStr || "").match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Busca en Nominatim resultados con número de puerta en la zona calle+localidad.
 * @returns {Promise<Array<{ lat: number, lng: number, houseNum: number, displayName: string }>>}
 */
function bboxCenter(hit) {
  const bb = hit.boundingbox;
  if (!Array.isArray(bb) || bb.length < 4) return null;
  const s = parseFloat(bb[0]);
  const n = parseFloat(bb[1]);
  const w = parseFloat(bb[2]);
  const e = parseFloat(bb[3]);
  if (![s, n, w, e].every((x) => Number.isFinite(x))) return null;
  return { lat: (s + n) / 2, lng: (w + e) / 2 };
}

/**
 * Resultados en calle + localidad: frentes con número y, si aplica, centro de la vía (sin números en OSM).
 * @returns {{ houseHits: Array<{ lat: number, lng: number, houseNum: number, displayName: string }>, streetCenter: { lat: number, lng: number, displayName: string } | null }}
 */
export async function searchCalleLocalidadArgentina(ciudad, calle, limit = 40) {
  const c = String(ciudad || "").trim();
  const cal = String(calle || "").trim();
  if (c.length < 2 || cal.length < 2) return { houseHits: [], streetCenter: null };
  const lim = Math.min(50, Math.max(8, Number(limit) || 40));
  await throttle();
  const p = nominatimBaseParams();
  p.set("q", `${cal}, ${c}, Argentina`);
  p.set("limit", String(lim));
  const url = `https://nominatim.openstreetmap.org/search?${p.toString()}`;
  const res = await fetch(url, { headers: nominatimHeaders() });
  if (!res.ok) return { houseHits: [], streetCenter: null };
  const arr = await res.json();
  if (!Array.isArray(arr)) return { houseHits: [], streetCenter: null };
  const houseHits = [];
  const streetCandidates = [];
  for (const hit of arr) {
    const displayName = String(hit.display_name || "").trim();
    if (!nominatimDisplayMatchesLocalidad(displayName, c)) continue;
    if (!nominatimDisplayMatchesCalle(displayName, cal)) continue;
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const hn = hit.address?.house_number;
    const houseNumParsed = hn != null ? parseHouseNumberInt(String(hn)) : null;
    if (houseNumParsed != null) {
      houseHits.push({ lat, lng, houseNum: houseNumParsed, displayName });
      continue;
    }
    const cls = String(hit.class || "");
    const typ = String(hit.type || "");
    const roadish =
      cls === "highway" ||
      typ === "residential" ||
      typ === "living_street" ||
      typ === "unclassified" ||
      typ === "road" ||
      typ === "service" ||
      (cls === "place" && typ === "neighbourhood");
    const bc = bboxCenter(hit);
    const useLat = bc?.lat ?? lat;
    const useLng = bc?.lng ?? lng;
    if (!Number.isFinite(useLat) || !Number.isFinite(useLng)) continue;
    let rank = 6;
    if (roadish) {
      if (cls === "highway" && typ === "residential") rank = 0;
      else if (cls === "highway") rank = 1;
      else rank = 2;
    }
    streetCandidates.push({ lat: useLat, lng: useLng, displayName, rank });
  }
  streetCandidates.sort((a, b) => a.rank - b.rank);
  const streetCenter =
    streetCandidates.length > 0
      ? {
          lat: streetCandidates[0].lat,
          lng: streetCandidates[0].lng,
          displayName: streetCandidates[0].displayName,
        }
      : null;
  return { houseHits, streetCenter };
}

/** @deprecated Usar searchCalleLocalidadArgentina */
export async function searchHouseNumberHitsArgentina(ciudad, calle, limit = 35) {
  const { houseHits } = await searchCalleLocalidadArgentina(ciudad, calle, limit);
  return houseHits;
}

/**
 * Sin GPS del cliente: si el número no está en OSM, elegir frentes de la misma paridad (impar/par) más cercanos en número.
 * Con GPS: mantiene lógica de paridad + proximidad existente.
 */
export function resolveStructuredAddressCoords({
  houseHits,
  streetCenter,
  targetNum,
  userGps,
  fallbackCity,
  nearMeters = 120,
}) {
  const near = Number.isFinite(Number(nearMeters)) && Number(nearMeters) > 0 ? Number(nearMeters) : 120;
  const hits = Array.isArray(houseHits) ? houseHits : [];
  const exact =
    targetNum != null && Number.isFinite(targetNum)
      ? hits.find((h) => h.houseNum === targetNum)
      : null;

  if (exact) {
    if (
      userGps &&
      Number.isFinite(userGps.lat) &&
      Number.isFinite(userGps.lng) &&
      haversineMeters(userGps.lat, userGps.lng, exact.lat, exact.lng) <= near
    ) {
      return {
        lat: userGps.lat,
        lng: userGps.lng,
        source: "user_gps_near",
        anchorHouse: exact.houseNum,
      };
    }
    return { lat: exact.lat, lng: exact.lng, source: "exact_house", anchorHouse: exact.houseNum };
  }

  if (!hits.length) {
    if (streetCenter && Number.isFinite(streetCenter.lat) && Number.isFinite(streetCenter.lng)) {
      return { lat: streetCenter.lat, lng: streetCenter.lng, source: "street_center" };
    }
    if (fallbackCity && Number.isFinite(fallbackCity.lat) && Number.isFinite(fallbackCity.lng)) {
      return { lat: fallbackCity.lat, lng: fallbackCity.lng, source: "fallback" };
    }
    return null;
  }

  if (
    userGps &&
    Number.isFinite(userGps.lat) &&
    Number.isFinite(userGps.lng)
  ) {
    return pickCoordsWithParityAndGps(hits, targetNum, userGps, fallbackCity, near);
  }

  // Sin GPS del cliente: misma lógica de paridad que con GPS (impar → frentes impares más cercanos en número, etc.).
  let pool = hits;
  if (targetNum != null && Number.isFinite(targetNum)) {
    const wantParity = Math.abs(targetNum) % 2;
    const sameParity = hits.filter((h) => Math.abs(h.houseNum) % 2 === wantParity);
    if (sameParity.length) pool = sameParity;
  }
  pool = [...pool].sort((a, b) => {
    if (targetNum != null && Number.isFinite(targetNum)) {
      const da = Math.abs(a.houseNum - targetNum);
      const db = Math.abs(b.houseNum - targetNum);
      if (da !== db) return da - db;
    }
    return 0;
  });
  const best = pool[0];
  if (!best) {
    if (streetCenter && Number.isFinite(streetCenter.lat) && Number.isFinite(streetCenter.lng)) {
      return { lat: streetCenter.lat, lng: streetCenter.lng, source: "street_center" };
    }
    if (fallbackCity && Number.isFinite(fallbackCity.lat) && Number.isFinite(fallbackCity.lng)) {
      return { lat: fallbackCity.lat, lng: fallbackCity.lng, source: "fallback" };
    }
    return null;
  }
  return { lat: best.lat, lng: best.lng, source: "house_search_parity", anchorHouse: best.houseNum };
}

/**
 * Elige coordenadas según número pedido, paridad y GPS del usuario (si aplica).
 * @param {{ lat: number, lng: number, houseNum: number }[]} hits
 * @param {number | null} targetNum — número indicado por el usuario
 * @param {{ lat: number, lng: number } | null} userGps
 * @param {{ lat: number, lng: number } | null} fallbackCoords — p. ej. centro localidad
 * @param {number} nearMeters — umbral para aceptar GPS junto al frente elegido
 */
export function pickCoordsWithParityAndGps(hits, targetNum, userGps, fallbackCoords, nearMeters = 120) {
  const near = Number.isFinite(Number(nearMeters)) && Number(nearMeters) > 0 ? Number(nearMeters) : 120;
  if (!hits.length) {
    return fallbackCoords && Number.isFinite(fallbackCoords.lat) && Number.isFinite(fallbackCoords.lng)
      ? { lat: fallbackCoords.lat, lng: fallbackCoords.lng, source: "fallback" }
      : null;
  }
  let pool = hits;
  if (targetNum != null && Number.isFinite(targetNum)) {
    const wantParity = targetNum % 2;
    const sameParity = hits.filter((h) => h.houseNum % 2 === wantParity);
    if (sameParity.length) pool = sameParity;
  }
  pool = [...pool].sort((a, b) => {
    if (targetNum != null && Number.isFinite(targetNum)) {
      const da = Math.abs(a.houseNum - targetNum);
      const db = Math.abs(b.houseNum - targetNum);
      if (da !== db) return da - db;
    }
    return 0;
  });
  const best = pool[0];
  if (!best) {
    return fallbackCoords && Number.isFinite(fallbackCoords.lat) && Number.isFinite(fallbackCoords.lng)
      ? { lat: fallbackCoords.lat, lng: fallbackCoords.lng, source: "fallback" }
      : null;
  }
  if (
    userGps &&
    Number.isFinite(userGps.lat) &&
    Number.isFinite(userGps.lng) &&
    haversineMeters(userGps.lat, userGps.lng, best.lat, best.lng) <= near
  ) {
    return { lat: userGps.lat, lng: userGps.lng, source: "user_gps_near", anchorHouse: best.houseNum };
  }
  return { lat: best.lat, lng: best.lng, source: "house_search", anchorHouse: best.houseNum };
}

export async function reverseGeocodeArgentina(lat, lng) {
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  await throttle();
  const p = new URLSearchParams({
    format: "json",
    lat: String(la),
    lon: String(lo),
    addressdetails: "1",
    "accept-language": "es",
    zoom: "18",
    email: process.env.NOMINATIM_FROM_EMAIL || process.env.NOMINATIM_FROM || "",
  });
  const url = `https://nominatim.openstreetmap.org/reverse?${p.toString()}`;
  const res = await fetch(url, { headers: nominatimHeaders() });
  if (!res.ok) return null;
  const hit = await res.json();
  if (!hit || hit.error) return null;
  const dn = String(hit.display_name || "").trim();
  if (!dn) return null;
  const barrio = barrioDesdeNominatimAddress(hit.address);
  return { displayName: dn, ...(barrio ? { barrio } : {}) };
}
