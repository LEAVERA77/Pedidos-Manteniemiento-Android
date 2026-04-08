/**
 * Geocodificación opcional vía Google Geocoding API (Maps Platform).
 * Sin GOOGLE_GEOCODING_API_KEY (ni GOOGLE_MAPS_API_KEY) no se llama a Google: coste $0, flujo Nominatim intacto.
 * @see https://developers.google.com/maps/documentation/geocoding
 */

import { hasMeaningfulHouseNumber, parseHouseNumberInt } from "./nominatimClient.js";

function normTxt(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function routeTokensNorm(calle) {
  let s = normTxt(calle);
  s = s.replace(/^(calle|avenida|av|av\.|diag|diag\.|diagonal|ruta|pasaje|pje|boulevard|bv)\s+/u, "");
  const tokens = s.split(/[\s,.]+/).filter((t) => t.length > 2);
  return tokens.length ? tokens : s.length >= 2 ? [s] : [];
}

const LOCALITY_COMPONENT_TYPES = new Set([
  "locality",
  "administrative_area_level_3",
  "sublocality",
  "sublocality_level_1",
  "postal_town",
  "administrative_area_level_2",
]);

/**
 * @param {Array<{ long_name?: string, short_name?: string, types?: string[] }>} components
 * @param {string} localidad
 */
export function googleComponentsIncludeLocalidad(components, localidad) {
  const loc = normTxt(localidad);
  if (loc.length < 2) return true;
  if (!Array.isArray(components)) return false;
  for (const c of components) {
    const types = c.types || [];
    if (!types.some((t) => LOCALITY_COMPONENT_TYPES.has(t))) continue;
    const name = normTxt(c.long_name || c.short_name || "");
    if (name.length < 2) continue;
    if (name === loc || name.includes(loc) || loc.includes(name)) return true;
  }
  return false;
}

/**
 * @param {Array<{ long_name?: string, types?: string[] }>} components
 * @param {string} calle
 */
export function googleComponentsRouteMatches(components, calle) {
  const tokens = routeTokensNorm(calle);
  if (!tokens.length) return true;
  if (!Array.isArray(components)) return false;
  const route = components.find((c) => (c.types || []).includes("route"));
  if (!route) return false;
  const rn = normTxt(route.long_name || "");
  return tokens.some((t) => rn.includes(t) || t.includes(rn));
}

/**
 * @param {Array<{ long_name?: string, types?: string[] }>} components
 * @param {string} numeroUser
 */
export function googleStreetNumberMatches(components, numeroUser) {
  if (!hasMeaningfulHouseNumber(numeroUser)) return true;
  const want = parseHouseNumberInt(numeroUser);
  if (want == null || want <= 0) return true;
  const comp = components.find((c) => (c.types || []).includes("street_number"));
  if (!comp) return false;
  const gn = parseInt(String(comp.long_name || "").replace(/\D/g, ""), 10);
  return Number.isFinite(gn) && gn === want;
}

/** @param {string | undefined} t */
export function googleLocationTypeRank(t) {
  const order = { ROOFTOP: 4, RANGE_INTERPOLATED: 3, GEOMETRIC_CENTER: 2, APPROXIMATE: 1 };
  return order[String(t || "")] || 0;
}

/**
 * Primer resultado de Geocoding API (JSON).
 * @param {object | null | undefined} firstResult
 * @param {{ localidad: string, calle: string, numero: string }} ctx
 */
export function shouldAcceptGoogleGeocodeForBot(firstResult, ctx) {
  if (!firstResult || !firstResult.geometry?.location) return false;
  const loc = firstResult.geometry.location;
  const lat = Number(loc.lat);
  const lng = Number(loc.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;

  const lt = firstResult.geometry.location_type;
  const rank = googleLocationTypeRank(lt);
  if (rank < 3) return false;

  const partial = !!firstResult.partial_match;
  if (partial && rank < 4) return false;

  const types = firstResult.types || [];
  const goodType =
    types.includes("street_address") ||
    types.includes("premise") ||
    types.includes("subpremise") ||
    types.includes("route");
  if (!goodType) return false;

  const comps = firstResult.address_components || [];
  if (!googleComponentsIncludeLocalidad(comps, ctx.localidad)) return false;
  if (!googleComponentsRouteMatches(comps, ctx.calle)) return false;
  if (!googleStreetNumberMatches(comps, ctx.numero)) return false;

  return true;
}

function googleGeocodeApiKey() {
  const k =
    String(process.env.GOOGLE_GEOCODING_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "").trim();
  return k.length >= 10 ? k : "";
}

function googleGeocodeCacheTtlMs() {
  const n = Number(process.env.GOOGLE_GEOCODE_CACHE_TTL_MS || 86400000);
  return Number.isFinite(n) && n >= 60000 && n <= 604800000 ? n : 86400000;
}

function googleGeocodeMinIntervalMs() {
  const n = Number(process.env.GOOGLE_GEOCODE_MIN_INTERVAL_MS || 120);
  return Number.isFinite(n) && n >= 0 && n <= 5000 ? n : 120;
}

const _cache = new Map();
let _chain = Promise.resolve();
let _lastAt = 0;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function cacheKey(localidad, calle, numero, state) {
  return [normTxt(localidad), normTxt(calle), String(numero || "").trim(), normTxt(state)].join("|");
}

/**
 * @typedef {{ lat: number, lng: number, formattedAddress: string, placeId: string | null, locationType: string, partialMatch: boolean }} GoogleGeocodeOk
 */

/**
 * Geocode calle + número + localidad (Argentina). Sin API key devuelve null (sin coste).
 * @param {{ calle: string, numero: string, localidad: string, stateOrProvince?: string }} p
 * @returns {Promise<GoogleGeocodeOk | null>}
 */
export async function geocodeCalleNumeroLocalidadGoogleArgentina(p) {
  const key = googleGeocodeApiKey();
  if (!key) return null;

  const calle = String(p.calle || "").trim();
  const localidad = String(p.localidad || "").trim();
  const numero = String(p.numero ?? "").trim();
  const state = String(p.stateOrProvince || "").trim();
  if (calle.length < 2 || localidad.length < 2) return null;

  const ck = cacheKey(localidad, calle, numero, state);
  const now = Date.now();
  const ttl = googleGeocodeCacheTtlMs();
  const hit = _cache.get(ck);
  if (hit && now - hit.at < ttl) return hit.value;

  const parts = [`${calle} ${numero}`.trim(), localidad];
  if (state.length >= 2) parts.push(state);
  parts.push("Argentina");
  const address = parts.join(", ");

  const params = new URLSearchParams({
    address,
    components: "country:AR",
    language: "es",
    key,
  });
  const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`;

  const interval = googleGeocodeMinIntervalMs();
  _chain = _chain.then(async () => {
    const wait = _lastAt + interval - Date.now();
    if (wait > 0) await sleep(wait);
    _lastAt = Date.now();
  });
  await _chain;

  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    console.error("[google-geocode] fetch", e?.message || e);
    return null;
  }
  if (!res.ok) {
    console.warn("[google-geocode] http", res.status);
    return null;
  }
  let data;
  try {
    data = await res.json();
  } catch (_) {
    return null;
  }
  const status = String(data?.status || "");
  if (status !== "OK" || !Array.isArray(data.results) || !data.results.length) {
    if (status && status !== "ZERO_RESULTS") {
      console.warn("[google-geocode] status", status);
    }
    return null;
  }

  const first = data.results[0];
  if (!shouldAcceptGoogleGeocodeForBot(first, { localidad, calle, numero })) {
    return null;
  }

  const lat = Number(first.geometry.location.lat);
  const lng = Number(first.geometry.location.lng);
  const out = {
    lat,
    lng,
    formattedAddress: String(first.formatted_address || "").trim() || address,
    placeId: first.place_id ? String(first.place_id) : null,
    locationType: String(first.geometry.location_type || ""),
    partialMatch: !!first.partial_match,
  };
  _cache.set(ck, { at: now, value: out });
  return out;
}

/** Para tests: limpia cache en memoria. */
export function clearGoogleGeocodeCacheForTests() {
  _cache.clear();
}
