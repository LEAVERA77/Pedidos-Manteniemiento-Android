/**
 * Cliente Nominatim (OSM) con rate limit ~1 req/s y cabeceras de uso responsable.
 * Geocodificación estructurada + viewbox por localidad del catálogo (evita homónimos entre ciudades).
 * @see https://operations.osmfoundation.org/policies/nominatim/
 *
 * Cobertura OSM: si el frente no está mapeado con `house_number`, no hay punto exacto; se intenta
 * paridad + vecinos en número, eje de vía (`street_center`) o consulta `q` filtrada. Todo queda
 * acotado al bbox de la localidad declarada (no se usa el centro del tenant como sustituto de ciudad
 * cuando `allowTenantCentroidFallback: false`).
 *
 * Opcional: `LOCAL_ADDRESS_INDEX_PATH` → `lookupLocalAddressInIndex` (mismo viewbox + reverse + ancla).
 */

import { lookupLocalAddressInIndex } from "./localAddressIndex.js";
import { calleSinPrefijoTipoViaParaQuery } from "../utils/normalizadorCalles.js";
import {
  nominatimMemoryCacheGet,
  nominatimMemoryCacheSet,
  nominatimMemoryCacheKeyFreeForm,
} from "./nominatimMemoryCache.js";

/** Instancia propia por defecto (VPS). Sobrescribir con NOMINATIM_BASE_URL. */
export const NOMINATIM_DEFAULT_PRIVATE_BASE = "http://45.76.3.146:8080";
export const NOMINATIM_PUBLIC_FALLBACK_BASE = "https://nominatim.openstreetmap.org";

let _loggedDefaultNominatimBase = false;

const MIN_INTERVAL_MS = 1100;
let _lastAt = 0;
let _chain = Promise.resolve();

/** En tests: `NOMINATIM_THROTTLE_MS_FOR_TESTS=0` evita esperas ~1.1s entre llamadas. */
export function throttleIntervalMs() {
  const raw = process.env.NOMINATIM_THROTTLE_MS_FOR_TESTS;
  if (raw === "0" || raw === "false") return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : MIN_INTERVAL_MS;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function throttle() {
  const interval = throttleIntervalMs();
  _chain = _chain.then(async () => {
    const now = Date.now();
    const wait = _lastAt + interval - now;
    if (wait > 0) await sleep(wait);
    _lastAt = Date.now();
  });
  return _chain;
}

export function nominatimHeaders() {
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

/**
 * Base URL del servicio Nominatim (sin barra final). Default: API pública OSM.
 *
 * El cliente arma `${base}/search` y `${base}/reverse` (ver usos en este archivo).
 *
 * - Raíz del host (típico Docker / reverse proxy en `/`):
 *   `NOMINATIM_BASE_URL=https://nominatim.tudominio.com`
 *   → `https://nominatim.tudominio.com/search?...`
 *
 * - Proxy con **path base** (Nginx/Caddy publica la API bajo un prefijo):
 *   `NOMINATIM_BASE_URL=https://api.tuempresa.com/geo/nominatim`
 *   → `https://api.tuempresa.com/geo/nominatim/search?...`
 *   Comprobá en el navegador o curl que esa URL + `/search?format=json&q=test` responde JSON.
 *
 * Un repo GitHub del *software* Nominatim no es una URL: hay que desplegarlo y poner aquí el **origen HTTP** donde corre `nominatim serve`.
 *
 * Sin `NOMINATIM_BASE_URL` en env → instancia propia (`NOMINATIM_DEFAULT_PRIVATE_BASE`). Para usar solo OSM público: `NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org`.
 */
export function getNominatimBaseUrl() {
  const fromEnv = process.env.NOMINATIM_BASE_URL;
  if (!fromEnv && !_loggedDefaultNominatimBase) {
    _loggedDefaultNominatimBase = true;
    console.warn(
      `[nominatimClient] NOMINATIM_BASE_URL no definido; usando instancia por defecto ${NOMINATIM_DEFAULT_PRIVATE_BASE} (sobrescribir con env o usar API pública explícita).`
    );
  }
  const raw = String(fromEnv || NOMINATIM_DEFAULT_PRIVATE_BASE).trim();
  return raw.replace(/\/+$/, "");
}

/** URL de respaldo (API pública OSM) cuando la instancia propia falla o devuelve vacío. Desactivar: NOMINATIM_PUBLIC_FALLBACK=false */
export function getNominatimPublicFallbackBaseUrl() {
  return String(process.env.NOMINATIM_PUBLIC_FALLBACK_URL || NOMINATIM_PUBLIC_FALLBACK_BASE)
    .trim()
    .replace(/\/+$/, "");
}

export function shouldUsePublicFallback() {
  if (process.env.NOMINATIM_PUBLIC_FALLBACK === "0" || process.env.NOMINATIM_PUBLIC_FALLBACK === "false") {
    return false;
  }
  const primary = getNominatimBaseUrl();
  const pub = getNominatimPublicFallbackBaseUrl();
  return primary !== pub;
}

/**
 * Reemplaza el origin de una URL /search|/reverse de Nominatim.
 * @param {string} urlStr
 * @param {string} newBase sin barra final
 */
export function nominatimUrlWithBase(urlStr, newBase) {
  try {
    const u = new URL(urlStr);
    const nb = String(newBase || "").replace(/\/+$/, "");
    const nu = new URL(nb.includes("://") ? nb : `https://${nb}`);
    return `${nu.origin}${u.pathname}${u.search}`;
  } catch {
    return urlStr;
  }
}

/** Timeout por request HTTP a Nominatim (ms). Default 15000 (instancia propia / red). */
export function nominatimFetchTimeoutMs() {
  const n = Number(process.env.NOMINATIM_FETCH_TIMEOUT_MS ?? 15000);
  return Number.isFinite(n) && n >= 3000 && n <= 120000 ? n : 15000;
}

/**
 * fetch a api.openstreetmap.org/search|reverse con AbortSignal por timeout.
 * @param {string} url
 * @param {RequestInit} [init]
 */
export async function nominatimFetch(url, init = {}) {
  const ms = nominatimFetchTimeoutMs();
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), ms);
  const headers = init.headers ?? nominatimHeaders();
  try {
    return await fetch(url, { ...init, headers, signal: ctrl.signal });
  } catch (e) {
    if (e?.name === "AbortError") {
      const err = new Error(`Nominatim timeout ${ms}ms`);
      err.code = "NOMINATIM_TIMEOUT";
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(tid);
  }
}

const DEBUG_NOMINATIM = process.env.DEBUG_NOMINATIM === "1" || process.env.DEBUG_NOMINATIM === "true";

const RATE_LIMIT_BACKOFF_MS = [0, 1500, 4000, 9000, 16000];

/**
 * Reintenta ante 429/503 (cola OSM / rate limit). Config: NOMINATIM_RATE_LIMIT_RETRIES (default 4).
 * @param {string} url
 * @param {RequestInit} [init]
 */
export async function nominatimFetchRetryOnRateLimit(url, init = {}) {
  const max = Math.min(
    6,
    Math.max(1, parseInt(String(process.env.NOMINATIM_RATE_LIMIT_RETRIES || "4"), 10) || 4)
  );
  let lastRes = null;
  for (let attempt = 0; attempt < max; attempt++) {
    if (attempt > 0) {
      const wait = RATE_LIMIT_BACKOFF_MS[attempt] ?? 12000;
      if (DEBUG_NOMINATIM) {
        console.warn(`[nominatimClient] rate-limit retry espera ${wait}ms (intento ${attempt + 1}/${max})`);
      }
      await sleep(wait);
    }
    lastRes = await nominatimFetch(url, init);
    if (lastRes.status === 429 || lastRes.status === 503) {
      if (DEBUG_NOMINATIM) {
        console.warn(`[nominatimClient] HTTP ${lastRes.status} ${String(url).slice(0, 160)}`);
      }
      continue;
    }
    return lastRes;
  }
  return lastRes;
}

/**
 * GET search → array JSON; si la instancia primaria falla o devuelve [], intenta OSM público (si aplica).
 * @param {string} url URL completa /search?…
 */
export async function nominatimFetchSearchArrayWithPublicFallback(url) {
  const tryOne = async (u) => {
    const res = await nominatimFetchRetryOnRateLimit(u);
    const status = res.status;
    let arr = [];
    try {
      const j = await res.json();
      arr = Array.isArray(j) ? j : [];
    } catch {
      arr = [];
    }
    return { ok: res.ok, status, arr, u };
  };

  let out = await tryOne(url);
  if (out.ok && out.arr.length > 0) return out.arr;
  if (!shouldUsePublicFallback()) return out.arr;

  const alt = nominatimUrlWithBase(url, getNominatimPublicFallbackBaseUrl());
  if (alt === url) return out.arr;

  if (DEBUG_NOMINATIM) {
    console.warn(
      JSON.stringify({
        evt: "nominatim_search_fallback_public",
        reason: !out.ok ? `http_${out.status}` : "empty_results",
        primary: url.slice(0, 220),
      })
    );
  }
  const second = await tryOne(alt);
  return second.arr;
}

/**
 * GET /reverse → objeto JSON; si la instancia primaria falla, intenta OSM público.
 * @param {string} url URL completa /reverse?…
 */
export async function nominatimFetchReverseHitWithPublicFallback(url) {
  const parse = async (u) => {
    const res = await nominatimFetchRetryOnRateLimit(u);
    let hit = null;
    try {
      hit = await res.json();
    } catch {
      hit = null;
    }
    return { ok: res.ok, hit };
  };

  let { ok, hit } = await parse(url);
  if (ok && hit && !hit.error) return hit;
  if (!shouldUsePublicFallback()) return hit && !hit.error ? hit : null;
  const alt = nominatimUrlWithBase(url, getNominatimPublicFallbackBaseUrl());
  if (alt === url) return hit && !hit.error ? hit : null;
  if (DEBUG_NOMINATIM) {
    console.warn(
      JSON.stringify({
        evt: "nominatim_reverse_fallback_public",
        primary: url.slice(0, 200),
      })
    );
  }
  ({ ok, hit } = await parse(alt));
  if (ok && hit && !hit.error) return hit;
  return null;
}

/**
 * Búsqueda libre Nominatim (`q`), alineada a la UI web (sin parámetros street/city).
 * Por defecto puede omitir `countrycodes` (la UI pública no siempre lo envía; algunas queries largas fallan con él).
 *
 * @param {string} query
 * @param {{
 *   limit?: number,
 *   acceptLanguage?: string,
 *   addressdetails?: boolean,
 *   omitCountryCodes?: boolean,
 *   countrycodes?: string | false | null,
 * }} [options]
 * @returns {Promise<object[]>}
 */
export async function nominatimSearchFreeForm(query, options = {}) {
  const q = String(query || "").trim();
  if (q.length < 2) return [];
  await throttle();

  const cacheKey = nominatimMemoryCacheKeyFreeForm(q, {
    limit: options.limit,
    omitCountryCodes: options.omitCountryCodes === true,
  });
  const cached = nominatimMemoryCacheGet(cacheKey);
  if (cached) {
    if (DEBUG_NOMINATIM) {
      console.log(`[nominatimClient] nominatimSearchFreeForm cache HIT key=${cacheKey.slice(0, 80)}`);
    }
    return cached;
  }

  const lim = Math.min(50, Math.max(1, Number(options.limit) || 8));
  const p = new URLSearchParams({
    format: "json",
    limit: String(lim),
    "accept-language": options.acceptLanguage || "es",
  });
  if (options.addressdetails !== false) {
    p.set("addressdetails", "1");
  }
  p.set("q", q);
  const email = process.env.NOMINATIM_FROM_EMAIL || process.env.NOMINATIM_FROM || "";
  if (email) p.set("email", email);

  const omitCC = options.omitCountryCodes === true;
  if (!omitCC) {
    const cc =
      options.countrycodes !== undefined && options.countrycodes !== null && options.countrycodes !== false
        ? String(options.countrycodes)
        : "ar";
    if (cc) p.set("countrycodes", cc);
  }

  const url = `${getNominatimBaseUrl()}/search?${p.toString()}`;
  if (DEBUG_NOMINATIM) {
    console.log(`[nominatimClient] nominatimSearchFreeForm: ${url.slice(0, 400)}`);
  }
  try {
    const arr = await nominatimFetchSearchArrayWithPublicFallback(url);
    if (DEBUG_NOMINATIM) {
      const n = Array.isArray(arr) ? arr.length : 0;
      const sample = Array.isArray(arr) && arr[0] ? JSON.stringify(arr[0]).slice(0, 600) : "";
      console.log(`[nominatimClient] nominatimSearchFreeForm: ${n} hit(s) ${sample ? `ej: ${sample}` : ""}`);
    }
    const out = Array.isArray(arr) ? arr : [];
    if (out.length) nominatimMemoryCacheSet(cacheKey, out);
    return out;
  } catch (e) {
    console.error("[nominatimClient] nominatimSearchFreeForm:", e?.message || e);
    return [];
  }
}

/**
 * Elige el mejor resultado de una búsqueda libre para WhatsApp: localidad + calle; acepta POIs (amenity/school) con address.road + house_number.
 * @param {object[]} hits
 * @param {{
 *   filterLocalidad?: string,
 *   filterState?: string,
 *   filterCalle?: string,
 *   filterCalleAlt?: string,
 *   preferredHouseNumber?: number | null,
 * }} [opts]
 */
export function pickFreeFormHitForWhatsapp(hits, opts = {}) {
  if (!Array.isArray(hits) || !hits.length) return null;
  const filterLoc = opts.filterLocalidad != null ? String(opts.filterLocalidad).trim() : "";
  const filterSt = opts.filterState != null ? String(opts.filterState).trim() : "";
  const fc = opts.filterCalle != null ? String(opts.filterCalle).trim() : "";
  const fca = opts.filterCalleAlt != null ? String(opts.filterCalleAlt).trim() : "";
  const wantH =
    opts.preferredHouseNumber != null && Number.isFinite(Number(opts.preferredHouseNumber))
      ? Number(opts.preferredHouseNumber)
      : null;
  const sorted = [...hits].sort((a, b) => (Number(b.importance) || 0) - (Number(a.importance) || 0));

  const calleOk = (h) =>
    fc.length < 2 ||
    nominatimHitMatchesCalle(h, fc) ||
    (fca.length >= 2 && nominatimHitMatchesCalle(h, fca));

  const stateOk = (h) => {
    if (filterSt.length < 2) return true;
    const hs = stateFromNominatimHit(h);
    if (hs != null && String(hs).trim().length >= 2) {
      if (nominatimStateMatchesTenant(hs, filterSt)) return true;
      if (filterLoc.length >= 2 && nominatimHitStrictLocalidad(h, filterLoc)) return true;
      if (nominatimDisplayMentionsStateName(h, filterSt)) return true;
      return false;
    }
    if (filterLoc.length >= 2 && nominatimHitStrictLocalidad(h, filterLoc)) return true;
    return nominatimDisplayMentionsStateName(h, filterSt);
  };

  /** Escuela/POI: house_number pedido + road acorde a la calle (class/type irrelevantes). */
  const poiRoadYNumero = (h) => {
    if (wantH == null) return false;
    const adr = h?.address;
    if (!adr || typeof adr !== "object") return false;
    const parsed = adr.house_number != null ? parseHouseNumberInt(String(adr.house_number)) : null;
    if (parsed !== wantH) return false;
    const road = adr.road != null ? String(adr.road).trim() : "";
    if (road.length >= 3) {
      if (fc.length >= 2 && nominatimDisplayMatchesCalle(road, fc)) return true;
      if (fca.length >= 2 && nominatimDisplayMatchesCalle(road, fca)) return true;
    }
    return calleOk(h);
  };

  for (const h of sorted) {
    if (filterLoc.length >= 2 && !nominatimHitStrictLocalidad(h, filterLoc)) continue;
    if (!stateOk(h)) continue;
    if (poiRoadYNumero(h)) return h;
  }
  for (const h of sorted) {
    if (filterLoc.length >= 2 && !nominatimHitStrictLocalidad(h, filterLoc)) continue;
    if (!stateOk(h)) continue;
    if (calleOk(h)) return h;
  }
  for (const h of sorted) {
    if (filterLoc.length >= 2 && !nominatimHitStrictLocalidad(h, filterLoc)) continue;
    if (calleOk(h)) return h;
  }
  for (const h of sorted) {
    if (filterLoc.length >= 2 && !nominatimHitStrictLocalidad(h, filterLoc)) continue;
    return h;
  }
  return sorted[0] || null;
}

/**
 * Habilita el fallback "centro de calle" (sin número) tras fallar geocodificación con puerta.
 * Default: activo. Desactivar: NOMINATIM_FALLBACK_CENTRO_CALLE=0|false|off
 */
export function nominatimFallbackCentroCalleEnabled() {
  const v = process.env.NOMINATIM_FALLBACK_CENTRO_CALLE;
  if (v === undefined || v === null || String(v).trim() === "") return true;
  const s = String(v).trim().toLowerCase();
  return !(s === "0" || s === "false" || s === "no" || s === "off");
}

/**
 * Aproximación: punto en la vía vía Nominatim sin número de puerta (útil si el número no existe en OSM).
 * @param {string} calle
 * @param {string} localidad
 * @param {string} [provincia]
 * @returns {Promise<{ hit: boolean, lat?: number, lng?: number, display_name?: string, source?: string, q_elegida?: string, omitCountryCodes?: boolean, reason?: string }>}
 */
export async function buscarCentroDeCalle(calle, localidad, provincia = "") {
  const c = String(calle || "").trim();
  const loc = String(localidad || "").trim();
  if (c.length < 2 || loc.length < 2) {
    return { hit: false, reason: "calle_o_localidad_corta" };
  }

  const prov = String(provincia || "").trim();
  const geoOpts = {
    filterLocalidad: loc,
    filterState: prov.length >= 2 ? prov : "",
    filterCalle: c,
    filterCalleAlt: c,
  };

  const queries = [];
  if (prov.length >= 2) {
    queries.push(`${c}, ${loc}, ${prov}, Argentina`);
    queries.push(`${c} ${loc} ${prov} Argentina`);
  }
  queries.push(`${c}, ${loc}, Argentina`);
  queries.push(`${c} ${loc} Argentina`);

  const uniqueQ = [...new Set(queries.map((q) => q.replace(/\s+/g, " ").trim()).filter((q) => q.length >= 4))];

  for (const qx of uniqueQ) {
    for (const omitCountryCodes of [false, true]) {
      const hits = await nominatimSearchFreeForm(qx, { limit: 10, omitCountryCodes, addressdetails: true });
      const pick = pickFreeFormHitForWhatsapp(hits, geoOpts);
      const hitObj = pick || (Array.isArray(hits) && hits.length ? hits[0] : null);
      if (!hitObj) continue;
      const la = Number(hitObj.lat);
      const lo = Number(hitObj.lon);
      if (!Number.isFinite(la) || !Number.isFinite(lo)) continue;
      return {
        hit: true,
        lat: la,
        lng: lo,
        display_name: String(hitObj.display_name || qx).trim(),
        source: "centro_de_calle",
        q_elegida: qx,
        omitCountryCodes,
      };
    }
  }
  return { hit: false, reason: "sin_hits_nominatim" };
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

function localityMarginDeg() {
  const v = Number(process.env.NOMINATIM_LOCALITY_VIEWBOX_MARGIN_DEG);
  return Number.isFinite(v) && v > 0 && v < 2 ? v : 0.07;
}

function tenantViewboxDeltaDeg() {
  const v = Number(process.env.NOMINATIM_TENANT_VIEWBOX_DELTA_DEG);
  return Number.isFinite(v) && v > 0 && v < 2 ? v : 0.11;
}

/** Desactivar: NOMINATIM_BUSCAR_NUMERO_CERCANO=0|false (solo número exacto en expansiones por calle). */
export function nominatimBuscarNumeroCercanoEnabled() {
  return process.env.NOMINATIM_BUSCAR_NUMERO_CERCANO !== "0" && process.env.NOMINATIM_BUSCAR_NUMERO_CERCANO !== "false";
}

/**
 * Pasos de paridad ±2, ±4, … (ver `iterHouseNumbersSameParity`).
 * Prioridad: NOMINATIM_MAX_DISTANCIA_NUMEROS → NOMINATIM_HOUSE_PARITY_MAX_STEPS → 8 (máx. 40).
 */
function houseParityMaxSteps() {
  if (!nominatimBuscarNumeroCercanoEnabled()) return 0;
  const raw =
    process.env.NOMINATIM_MAX_DISTANCIA_NUMEROS ?? process.env.NOMINATIM_HOUSE_PARITY_MAX_STEPS ?? "8";
  const v = parseInt(String(raw), 10);
  return Number.isFinite(v) ? Math.min(40, Math.max(0, v)) : 8;
}

/** Radio máximo (m) entre punto geocodificado y centro de la localidad declarada (evita pins en otra ciudad). */
export function maxMetersFromLocalityAnchorForBot() {
  /** Default 22 km: ej. Hasenkamp vs punto ~24 km en otra localidad queda fuera sin depender solo del reverse. */
  const km = Number(process.env.WHATSAPP_GEOCODE_MAX_KM_FROM_LOCALITY || 22);
  if (!Number.isFinite(km)) return 22000;
  const clampedKm = Math.min(200, Math.max(5, km));
  return clampedKm * 1000;
}

/**
 * @param {number} lat
 * @param {number} lng
 * @param {{ lat: number, lng: number } | null | undefined} anchor — centro de localidad (Nominatim), no sustituto del tenant
 */
export function isGeocodePlausibleForLocalityAnchor(lat, lng, anchor) {
  if (!anchor || !Number.isFinite(anchor.lat) || !Number.isFinite(anchor.lng)) return true;
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return false;
  return haversineMeters(la, lo, anchor.lat, anchor.lng) <= maxMetersFromLocalityAnchorForBot();
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

/** CPA / código postal desde `addressdetails` de Nominatim (solo dígitos 4–8). */
export function postcodeDesdeNominatimAddress(addr) {
  if (!addr || typeof addr !== "object") return null;
  const raw = addr.postcode;
  if (raw == null) return null;
  const d = String(raw).replace(/\D/g, "");
  return d.length >= 4 && d.length <= 8 ? d : null;
}

function normTxt(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function normProvinciaCmp(s) {
  return normTxt(String(s || "")).replace(/[^a-z0-9]+/g, "");
}

/**
 * Provincia / región desde addressdetails (búsqueda o reverse Nominatim).
 * @param {object} hit
 * @returns {string | null}
 */
export function stateFromNominatimHit(hit) {
  const a = hit?.address;
  if (!a || typeof a !== "object") return null;
  const v = a.state ?? a.region ?? a.state_district;
  if (v == null) return null;
  const s = String(v).trim();
  return s.length >= 2 ? s : null;
}

/**
 * Compara etiqueta de provincia OSM con la provincia del tenant (desambiguación homónimos entre provincias).
 */
export function nominatimStateMatchesTenant(hitState, tenantState) {
  if (!tenantState || String(tenantState).trim().length < 2) return true;
  if (!hitState || String(hitState).trim().length < 2) return false;
  const a = normProvinciaCmp(hitState);
  const b = normProvinciaCmp(tenantState);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}

/**
 * POIs (escuelas, etc.) a veces no tienen `address.state`; la provincia igual aparece en display_name.
 */
function nominatimDisplayMentionsStateName(hit, stateTenant) {
  const st = String(stateTenant || "").trim();
  if (st.length < 2) return false;
  const dn = normTxt(String(hit?.display_name || ""));
  const stN = normTxt(st).replace(/\s+/g, " ").trim();
  if (stN.length < 2) return false;
  if (dn.includes(stN)) return true;
  const words = stN.split(/\s+/).filter((w) => w.length >= 4);
  return words.some((w) => dn.includes(w));
}

const LOCALITY_ADDRESS_KEYS = [
  "city",
  "town",
  "village",
  "municipality",
  "city_district",
  "county",
  "state_district",
];

/** Coincidencia laxa en display_name (tokens); usar solo como respaldo. */
function nominatimDisplayMatchesLocalidad(displayName, localidad) {
  const dn = normTxt(displayName);
  const loc = normTxt(localidad);
  if (!loc || loc.length < 2) return true;
  const tokens = loc.split(/\s+/).filter((t) => t.length > 2);
  if (!tokens.length) return dn.includes(loc);
  return tokens.some((t) => dn.includes(t));
}

/**
 * Compara localidad del catálogo con campos estructurados de address (prioritario sobre display).
 */
export function nominatimAddressMatchesLocalidad(addr, localidad) {
  const loc = normTxt(localidad);
  if (!loc || loc.length < 2) return true;
  if (!addr || typeof addr !== "object") return false;
  for (const k of LOCALITY_ADDRESS_KEYS) {
    const v = addr[k];
    if (v == null) continue;
    const nv = normTxt(v);
    if (nv.length < 2) continue;
    if (nv === loc || nv.includes(loc) || loc.includes(nv)) return true;
  }
  return false;
}

/**
 * Si address trae ciudad/pueblo explícitos, deben alinear con el catálogo; si no hay datos, display como respaldo.
 */
export function nominatimHitStrictLocalidad(hit, localidad) {
  const loc = normTxt(localidad);
  if (!loc || loc.length < 2) return true;
  const dnAll = normTxt(String(hit?.display_name || ""));
  if (dnAll.includes(loc)) return true;
  const addr = hit?.address;
  if (!addr || typeof addr !== "object") {
    return nominatimDisplayMatchesLocalidad(String(hit?.display_name || ""), localidad);
  }
  const parts = [];
  for (const k of LOCALITY_ADDRESS_KEYS) {
    const v = addr[k];
    if (v != null && String(v).trim()) parts.push(normTxt(v));
  }
  if (parts.length) return parts.some((nv) => nv === loc || nv.includes(loc) || loc.includes(nv));
  return nominatimDisplayMatchesLocalidad(String(hit.display_name || ""), localidad);
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

export function nominatimHitMatchesCalle(hit, calle) {
  return nominatimDisplayMatchesCalle(String(hit.display_name || ""), calle);
}

function expandBBoxFromNominatim(bb, marginDeg) {
  const minLat = parseFloat(bb[0]);
  const maxLat = parseFloat(bb[1]);
  const minLon = parseFloat(bb[2]);
  const maxLon = parseFloat(bb[3]);
  if (![minLat, maxLat, minLon, maxLon].every((x) => Number.isFinite(x))) return null;
  const m = marginDeg;
  return {
    minLat: minLat - m,
    maxLat: maxLat + m,
    minLon: minLon - m,
    maxLon: maxLon + m,
  };
}

/** Nominatim viewbox: left,top,right,bottom = min_lon, max_lat, max_lon, min_lat */
export function viewboxStringFromBBox(b) {
  return `${b.minLon},${b.maxLat},${b.maxLon},${b.minLat}`;
}

export function pointInBBox(lat, lng, b) {
  if (!b) return true;
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return false;
  return la >= b.minLat && la <= b.maxLat && lo >= b.minLon && lo <= b.maxLon;
}

export function viewboxAroundPoint(lat, lng, deltaDeg) {
  const la = Number(lat);
  const lo = Number(lng);
  const d = Number(deltaDeg);
  if (!Number.isFinite(la) || !Number.isFinite(lo) || !Number.isFinite(d) || d <= 0) return null;
  const b = {
    minLat: la - d,
    maxLat: la + d,
    minLon: lo - d,
    maxLon: lo + d,
  };
  return { ...b, viewboxStr: viewboxStringFromBBox(b), center: { lat: la, lng: lo } };
}

/**
 * Geocode solo localidad → bbox ampliada + viewbox string.
 * @param {{ allowTenantCentroidFallback?: boolean, stateOrProvince?: string, postalCode?: string }} [options]
 * - allowTenantCentroidFallback: default true. Si false (p. ej. domicilio desde catálogo), no usar lat/lng del tenant como viewbox sustituto.
 * - stateOrProvince: desambigua homónimos (ej. Entre Ríos) vía parámetro `state` o búsqueda `q`.
 * - postalCode: CPA (solo dígitos) para acotar localidad estructurada.
 * @returns {Promise<{ viewboxStr: string, bbox: object, center: {lat,lng}, fromTenantCentroid?: boolean } | null>}
 */
export async function geocodeLocalityViewboxArgentina(localidad, tenantCentroid, options = {}) {
  const loc = String(localidad || "").trim();
  if (loc.length < 2) return null;
  const delta = tenantViewboxDeltaDeg();
  const margin = localityMarginDeg();
  const allowTenant = options.allowTenantCentroidFallback !== false;
  const state = String(options.stateOrProvince || "").trim();
  const postal = String(options.postalCode || "")
    .trim()
    .replace(/\D/g, "");

  async function searchStructured(useState) {
    await throttle();
    const p = nominatimBaseParams();
    p.set("city", loc);
    p.set("country", "Argentina");
    if (useState && state.length >= 2) p.set("state", state);
    if (postal.length >= 4) p.set("postalcode", postal);
    p.set("limit", "10");
    const url = `${getNominatimBaseUrl()}/search?${p.toString()}`;
    const arr = await nominatimFetchSearchArrayWithPublicFallback(url);
    return Array.isArray(arr) ? arr : [];
  }

  async function searchQState() {
    if (state.length < 2) return [];
    await throttle();
    const p = nominatimBaseParams();
    p.set("q", `${loc}, ${state}, Argentina`);
    p.set("limit", "10");
    const url = `${getNominatimBaseUrl()}/search?${p.toString()}`;
    const arr = await nominatimFetchSearchArrayWithPublicFallback(url);
    return Array.isArray(arr) ? arr : [];
  }

  let arr;
  let filtered;
  if (state.length >= 2) {
    arr = await searchStructured(true);
    filtered = arr.filter((h) => nominatimHitStrictLocalidad(h, loc));
    if (!filtered.length) {
      arr = await searchStructured(false);
      filtered = arr.filter((h) => nominatimHitStrictLocalidad(h, loc));
    }
  } else {
    arr = await searchStructured(false);
    filtered = arr.filter((h) => nominatimHitStrictLocalidad(h, loc));
  }
  if (!filtered.length && state.length >= 2) {
    arr = await searchQState();
    filtered = arr.filter((h) => nominatimHitStrictLocalidad(h, loc));
  }
  if (state.length >= 2 && filtered.length) {
    filtered = filtered.filter((h) => {
      const hs = stateFromNominatimHit(h);
      if (!hs) return true;
      return nominatimStateMatchesTenant(hs, state);
    });
  }

  const hit = filtered[0];
  if (!hit) {
    if (
      allowTenant &&
      tenantCentroid &&
      Number.isFinite(Number(tenantCentroid.lat)) &&
      Number.isFinite(Number(tenantCentroid.lng))
    ) {
      const vb = viewboxAroundPoint(Number(tenantCentroid.lat), Number(tenantCentroid.lng), delta);
      if (vb) return { viewboxStr: vb.viewboxStr, bbox: vb, center: vb.center, fromTenantCentroid: true };
    }
    return null;
  }
  const bb = hit.boundingbox;
  if (Array.isArray(bb) && bb.length >= 4) {
    const expanded = expandBBoxFromNominatim(bb, margin);
    if (expanded) {
      const lat = Number(hit.lat);
      const lng = Number(hit.lon);
      return {
        viewboxStr: viewboxStringFromBBox(expanded),
        bbox: expanded,
        center: {
          lat: Number.isFinite(lat) ? lat : (expanded.minLat + expanded.maxLat) / 2,
          lng: Number.isFinite(lng) ? lng : (expanded.minLon + expanded.maxLon) / 2,
        },
      };
    }
  }
  const lat = Number(hit.lat);
  const lng = Number(hit.lon);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    const vb = viewboxAroundPoint(lat, lng, delta);
    if (vb) return { viewboxStr: vb.viewboxStr, bbox: vb, center: vb.center };
  }
  return null;
}

async function nominatimSearch(params) {
  await throttle();
  const p = nominatimBaseParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "") continue;
    p.set(k, String(v));
  }
  const url = `${getNominatimBaseUrl()}/search?${p.toString()}`;
  const arr = await nominatimFetchSearchArrayWithPublicFallback(url);
  return Array.isArray(arr) ? arr : [];
}

/** Búsqueda estructurada (street, city, country, …) — mismo motor que el pipeline admin/no Simple-q. */
export async function nominatimSearchStructured(params) {
  return nominatimSearch(params);
}

function scoreStructuredHit(hit, wantHouse) {
  const hn = hit.address?.house_number;
  const parsed = hn != null ? parseHouseNumberInt(String(hn)) : null;
  if (wantHouse != null && Number.isFinite(wantHouse) && parsed === wantHouse) return 0;
  if (parsed != null) return 1;
  return 2;
}

/** Menor = mejor: prioriza type=house y número de puerta coincidente. */
function structuredHitSortKey(hit, wantHouse) {
  const t = String(hit?.type || "").toLowerCase();
  let typeTier = 2;
  if (t === "house") typeTier = 0;
  else if (t === "building" || t === "apartments" || t === "residential") typeTier = 1;
  const hn = hit?.address?.house_number;
  const parsed = hn != null ? parseHouseNumberInt(String(hn)) : null;
  let hnTier = 2;
  if (wantHouse != null && Number.isFinite(wantHouse) && parsed === wantHouse) hnTier = 0;
  else if (parsed != null) hnTier = 1;
  return typeTier * 10 + hnTier;
}

function pickBestStructuredHit(hits, calle, localidad, bbox, wantHouse, anchorCenter, tenantState) {
  const cal = String(calle || "").trim();
  const loc = String(localidad || "").trim();
  let pool = hits.filter((h) => nominatimHitStrictLocalidad(h, loc) && nominatimHitMatchesCalle(h, cal));
  const ts = tenantState != null ? String(tenantState).trim() : "";
  if (ts.length >= 2) {
    pool = pool.filter((h) => nominatimStateMatchesTenant(stateFromNominatimHit(h), ts));
  }
  if (bbox) {
    pool = pool.filter((h) => {
      const la = Number(h.lat);
      const lo = Number(h.lon);
      return Number.isFinite(la) && Number.isFinite(lo) && pointInBBox(la, lo, bbox);
    });
  }
  if (!pool.length) return null;
  const ac =
    anchorCenter &&
    Number.isFinite(Number(anchorCenter.lat)) &&
    Number.isFinite(Number(anchorCenter.lng))
      ? { lat: Number(anchorCenter.lat), lng: Number(anchorCenter.lng) }
      : null;
  pool.sort((a, b) => {
    const ka = structuredHitSortKey(a, wantHouse);
    const kb = structuredHitSortKey(b, wantHouse);
    if (ka !== kb) return ka - kb;
    const sa = scoreStructuredHit(a, wantHouse);
    const sb = scoreStructuredHit(b, wantHouse);
    if (sa !== sb) return sa - sb;
    if (ac) {
      const la = Number(a.lat);
      const lo = Number(a.lon);
      const lb = Number(b.lat);
      const lob = Number(b.lon);
      if ([la, lo, lb, lob].every((x) => Number.isFinite(x))) {
        const da = haversineMeters(la, lo, ac.lat, ac.lng);
        const db = haversineMeters(lb, lob, ac.lat, ac.lng);
        if (da !== db) return da - db;
      }
    }
    return 0;
  });
  return pool[0];
}

/**
 * @param {string} query
 * @param {{
 *   filterLocalidad?: string,
 *   filterState?: string,
 *   preferredHouseNumber?: number | null,
 *   filterCalle?: string,
 *   filterCalleAlt?: string,
 *   nominatimLimit?: string | number,
 *   skipStateFilter?: boolean,
 * } | undefined} opts
 * @returns {Promise<{ lat: number, lng: number, displayName: string, barrio?: string, postcode?: string } | null>}
 */
export async function geocodeAddressArgentina(query, opts = {}) {
  const q = String(query || "").trim();
  if (q.length < 3) return null;
  await throttle();
  const p = nominatimBaseParams();
  p.set("q", q);
  const limRaw = opts.nominatimLimit != null ? String(opts.nominatimLimit).trim() : "";
  if (limRaw && /^\d+$/.test(limRaw)) p.set("limit", limRaw);
  const url = `${getNominatimBaseUrl()}/search?${p.toString()}`;
  const arr = await nominatimFetchSearchArrayWithPublicFallback(url);
  if (!Array.isArray(arr) || !arr.length) return null;
  const filterLoc = opts.filterLocalidad != null ? String(opts.filterLocalidad).trim() : "";
  const filterSt = opts.filterState != null ? String(opts.filterState).trim() : "";
  const fc = opts.filterCalle != null ? String(opts.filterCalle).trim() : "";
  const fca = opts.filterCalleAlt != null ? String(opts.filterCalleAlt).trim() : "";
  const wantParsed =
    opts.preferredHouseNumber != null && Number.isFinite(Number(opts.preferredHouseNumber))
      ? Number(opts.preferredHouseNumber)
      : null;
  let candidates = arr;
  if (filterLoc.length >= 2) {
    candidates = candidates.filter((h) => nominatimHitStrictLocalidad(h, filterLoc));
  }
  if (filterSt.length >= 2 && !opts.skipStateFilter) {
    candidates = candidates.filter((h) => {
      const hs = stateFromNominatimHit(h);
      if (hs != null && String(hs).trim().length >= 2) {
        if (nominatimStateMatchesTenant(hs, filterSt)) return true;
        if (filterLoc.length >= 2 && nominatimHitStrictLocalidad(h, filterLoc)) return true;
        return nominatimDisplayMentionsStateName(h, filterSt);
      }
      if (filterLoc.length >= 2 && nominatimHitStrictLocalidad(h, filterLoc)) return true;
      return nominatimDisplayMentionsStateName(h, filterSt);
    });
  }
  if (fc.length >= 2) {
    candidates = candidates.filter(
      (h) => nominatimHitMatchesCalle(h, fc) || (fca.length >= 2 && nominatimHitMatchesCalle(h, fca))
    );
  }
  if (candidates.length > 1) {
    candidates = [...candidates].sort(
      (a, b) => structuredHitSortKey(a, wantParsed) - structuredHitSortKey(b, wantParsed)
    );
  }
  const hit = candidates.length ? candidates[0] : null;
  if (!hit) return null;
  const lat = Number(hit.lat);
  const lng = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const barrio = barrioDesdeNominatimAddress(hit.address);
  const postcode = postcodeDesdeNominatimAddress(hit.address);
  return {
    lat,
    lng,
    displayName: String(hit.display_name || q).trim(),
    ...(barrio ? { barrio } : {}),
    ...(postcode ? { postcode } : {}),
  };
}

/**
 * Fallback Nominatim por consultas `q` completas (calle + número + localidad + provincia).
 * Usar cuando `geocodeCalleNumeroLocalidadArgentina` no devuelve punto (p. ej. "25 de Mayo" / "9 de Julio" en Cerrito).
 * Tras validación estricta (reverse+calle), un segundo pase acepta solo coincidencia de localidad (`linea_libre_relaxed`).
 *
 * @param {{ calle: string, numero?: string, localidad: string, provincia?: string, postalCode?: string }} dom
 * @param {{ tenantCentroid?: { lat: number, lng: number } }} [options]
 * @returns {Promise<{ lat: number, lng: number, displayName: string, barrio?: string, postcode?: string, audit?: { source: string, q: string } } | null>}
 */
export async function geocodeDomicilioLineaLibreArgentina(dom, options = {}) {
  const cal = String(dom?.calle || "").trim();
  const loc = String(dom?.localidad || "").trim();
  const prov = String(dom?.provincia || "").trim();
  const numRaw = String(dom?.numero ?? "").trim();
  const postal = String(dom?.postalCode || "")
    .trim()
    .replace(/\D/g, "");
  if (cal.length < 2 || loc.length < 2) return null;

  const tenantCentroid = options.tenantCentroid;
  const vbMeta = await geocodeLocalityViewboxArgentina(loc, tenantCentroid || null, {
    allowTenantCentroidFallback: false,
    stateOrProvince: prov.length >= 2 ? prov : undefined,
    postalCode: postal.length >= 4 ? postal : undefined,
  });
  const bbox = vbMeta?.bbox || null;
  const anchor =
    vbMeta?.center &&
    Number.isFinite(Number(vbMeta.center.lat)) &&
    Number.isFinite(Number(vbMeta.center.lng))
      ? { lat: Number(vbMeta.center.lat), lng: Number(vbMeta.center.lng) }
      : null;

  const numPart =
    numRaw && numRaw !== "0" && hasMeaningfulHouseNumber(numRaw) ? String(parseHouseNumberInt(numRaw) || numRaw) : "";
  const lineaBase = numPart ? `${cal} ${numPart}`.replace(/\s+/g, " ").trim() : cal;

  const qList = [];
  const pushQ = (q) => {
    const s = String(q || "")
      .replace(/\s+/g, " ")
      .trim();
    if (s.length >= 5 && !qList.includes(s)) qList.push(s);
  };

  if (prov.length >= 2) {
    pushQ(`${lineaBase}, ${loc}, ${prov}, Argentina`);
    pushQ(`${lineaBase} ${loc} ${prov}`);
    pushQ(`${lineaBase}, ${loc}, ${prov}`);
    pushQ(`${loc}, ${prov}, ${lineaBase}`);
    if (postal.length >= 4) pushQ(`${lineaBase}, ${loc}, ${prov}, ${postal}, Argentina`);
  }
  pushQ(`${lineaBase}, ${loc}, Argentina`);
  pushQ(`${lineaBase} ${loc}`);

  const calSinTilde = cal
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (calSinTilde !== cal && numPart) {
    if (prov.length >= 2) pushQ(`${calSinTilde} ${numPart}, ${loc}, ${prov}, Argentina`);
    pushQ(`${calSinTilde} ${numPart}, ${loc}, Argentina`);
  }

  if (/25\s*de\s*mayo/i.test(cal)) {
    if (numPart && prov.length >= 2) {
      pushQ(`25 Mayo ${numPart}, ${loc}, ${prov}, Argentina`);
      pushQ(`Veinticinco de Mayo ${numPart}, ${loc}, ${prov}, Argentina`);
    }
    if (numPart) {
      pushQ(`25 Mayo ${numPart}, ${loc}, Argentina`);
      pushQ(`Veinticinco de Mayo ${numPart}, ${loc}, Argentina`);
    }
  }

  if (/9\s*de\s*julio/i.test(cal)) {
    if (numPart && prov.length >= 2) {
      pushQ(`9 de Julio ${numPart}, ${loc}, ${prov}, Argentina`);
      pushQ(`Nueve de Julio ${numPart}, ${loc}, ${prov}, Argentina`);
      pushQ(`9 Julio ${numPart}, ${loc}, ${prov}, Argentina`);
    }
    if (numPart) {
      pushQ(`9 de Julio ${numPart}, ${loc}, Argentina`);
      pushQ(`Nueve de Julio ${numPart}, ${loc}, Argentina`);
      pushQ(`9 Julio ${numPart}, ${loc}, Argentina`);
    }
  }

  for (const q of qList) {
    const g = await geocodeAddressArgentina(q, {
      filterLocalidad: loc,
      filterState: prov.length >= 2 ? prov : "",
    });
    if (!g || !Number.isFinite(g.lat) || !Number.isFinite(g.lng)) continue;
    const la = g.lat;
    const lo = g.lng;
    if (bbox && !pointInBBox(la, lo, bbox)) continue;
    if (anchor && !isGeocodePlausibleForLocalityAnchor(la, lo, anchor)) continue;
    const revOk = await verifyCatalogGeocodeReverse(la, lo, loc, cal);
    if (!revOk) continue;
    return {
      ...g,
      audit: { source: "linea_libre_q", q },
    };
  }

  for (const q of qList) {
    const g = await geocodeAddressArgentina(q, {
      filterLocalidad: loc,
      filterState: prov.length >= 2 ? prov : "",
    });
    if (!g || !Number.isFinite(g.lat) || !Number.isFinite(g.lng)) continue;
    const la = g.lat;
    const lo = g.lng;
    if (bbox && !pointInBBox(la, lo, bbox)) continue;
    if (anchor && !isGeocodePlausibleForLocalityAnchor(la, lo, anchor)) continue;
    const rev = await reverseGeocodeArgentina(la, lo);
    if (!rev || !reverseHitMatchesLocalidadSolo(rev, loc)) continue;
    return {
      ...g,
      audit: { source: "linea_libre_relaxed", q },
    };
  }
  return null;
}

/** Números a probar: objetivo primero, luego ±2, ±4, … manteniendo paridad. */
export function iterHouseNumbersSameParity(numeroStr, maxSteps) {
  const steps = maxSteps != null ? maxSteps : houseParityMaxSteps();
  const t = parseHouseNumberInt(String(numeroStr || ""));
  if (t == null || t <= 0) return [];
  const out = [t];
  for (let s = 1; s <= steps; s++) {
    const d = 2 * s;
    out.push(t - d, t + d);
  }
  return out;
}

export function hasMeaningfulHouseNumber(numeroStr) {
  const t = parseHouseNumberInt(String(numeroStr || ""));
  return t != null && t > 0;
}

/**
 * Misma idea que escribir en la caja de búsqueda de nominatim.openstreetmap.org: una sola línea `q`,
 * minúsculas, sin comas ni signos, espacios simples (p. ej. "avenida argentina 1162 maria grande").
 * @param {...string} segments
 * @returns {string}
 */
export function normalizarQNominatimUiWeb(...segments) {
  const s = segments
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .join(" ");
  return String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pipeline “tipo Nominatim Simple” para domicilio: solo parámetro `q` en /search (nunca street/city separados aquí).
 * Prioridad 1: queries {@link normalizarQNominatimUiWeb} alineadas a la UI web; luego variantes con comas/Argentina.
 * Segmentos auxiliares: `calleSinPrefijoTipoViaParaQuery(calle)` para coincidencias y filtros.
 * Modo WhatsApp (`NOMINATIM_WHATSAPP_SEARCH_MODE=free-form`, default): `nominatimSearchFreeForm` + omisión opcional de countrycodes.
 *
 * @param {{ calle: string, numero?: string, localidad: string, stateOrProvince?: string, postalCode?: string }} o
 * @returns {Promise<{ lat: number, lng: number, displayName: string, barrio?: string, postcode?: string, audit?: object } | null>}
 */
export async function geocodeDomicilioSimpleQArgentina(o = {}) {
  const loc = String(o.localidad || "").trim();
  const calleFull = String(o.calle || "").trim();
  if (loc.length < 2 || calleFull.length < 2) return null;
  const calleCore = calleSinPrefijoTipoViaParaQuery(calleFull) || calleFull;
  const nRaw = String(o.numero ?? "").trim();
  const wantH = hasMeaningfulHouseNumber(nRaw) ? parseHouseNumberInt(nRaw) : null;
  const numPart = wantH != null ? String(wantH) : "";

  const state = String(o.stateOrProvince || "").trim();
  const postal = String(o.postalCode || "")
    .trim()
    .replace(/\D/g, "");

  const mode = String(process.env.NOMINATIM_WHATSAPP_SEARCH_MODE || "free-form")
    .trim()
    .toLowerCase();
  const useFreeForm = mode !== "structured" && mode !== "legacy";
  const enableFb =
    process.env.NOMINATIM_ENABLE_FALLBACKS !== "0" && process.env.NOMINATIM_ENABLE_FALLBACKS !== "false";

  if (DEBUG_NOMINATIM) {
    console.log(
      JSON.stringify({
        evt: "geocodeDomicilioSimpleQArgentina_in",
        calleCore,
        calleFull: calleFull.slice(0, 120),
        numPart,
        loc,
        state,
        mode,
        useFreeForm,
        baseUrl: getNominatimBaseUrl(),
        timeoutMs: nominatimFetchTimeoutMs(),
      })
    );
  }

  const qList = [];
  const pushQ = (qx) => {
    const s = String(qx || "")
      .replace(/\s+/g, " ")
      .trim();
    if (s.length >= 4 && !qList.includes(s)) qList.push(s);
  };

  /** Igual que la UI web: una sola cadena sin comas (prioridad máxima en qListOrdered). */
  const webStyleQs = [];
  if (numPart) {
    const wFull = normalizarQNominatimUiWeb(calleFull, numPart, loc);
    if (wFull.length >= 4) webStyleQs.push(wFull);
    const wCore = normalizarQNominatimUiWeb(calleCore, numPart, loc);
    if (wCore.length >= 4 && wCore !== wFull) webStyleQs.push(wCore);
    if (state.length >= 2) {
      const wSt = normalizarQNominatimUiWeb(calleFull, numPart, loc, state);
      if (wSt.length >= 4 && wSt !== wFull) webStyleQs.push(wSt);
      webStyleQs.push(normalizarQNominatimUiWeb(calleFull, numPart, loc, state, "argentina"));
      const wCoreSt = normalizarQNominatimUiWeb(calleCore, numPart, loc, state, "argentina");
      if (wCoreSt.length >= 4 && !webStyleQs.includes(wCoreSt)) webStyleQs.push(wCoreSt);
    } else {
      const wAr = normalizarQNominatimUiWeb(calleFull, numPart, loc, "argentina");
      if (wAr.length >= 4 && wAr !== wFull) webStyleQs.push(wAr);
    }
  } else {
    const w0 = normalizarQNominatimUiWeb(calleFull, loc);
    if (w0.length >= 4) webStyleQs.push(w0);
    const wAr = normalizarQNominatimUiWeb(calleFull, loc, "argentina");
    if (wAr.length >= 4 && wAr !== w0) webStyleQs.push(wAr);
  }
  const webStyleUnique = [...new Set(webStyleQs)];

  /** Queries cortas (algunas UI devuelven mejor sin “Argentina” al final). */
  const priorityMinimal = [];
  if (numPart) {
    priorityMinimal.push(`${calleCore} ${numPart} ${loc}`.replace(/\s+/g, " ").trim());
    priorityMinimal.push(`${calleCore} ${numPart}, ${loc}`.replace(/\s+/g, " ").trim());
  }

  let calleSinTilde = calleCore;
  try {
    calleSinTilde = calleCore.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  } catch (_) {}

  if (numPart) {
    pushQ(`${calleCore} ${numPart}, ${loc}`);
    pushQ(`${calleCore} ${numPart}, ${loc}, Argentina`);
    if (state.length >= 2) pushQ(`${calleCore} ${numPart}, ${loc}, ${state}, Argentina`);
    if (postal.length >= 4) pushQ(`${calleCore} ${numPart}, ${loc}, ${postal}, Argentina`);
    if (calleSinTilde !== calleCore) pushQ(`${calleSinTilde} ${numPart}, ${loc}, Argentina`);
    pushQ(`${numPart} ${calleCore}, ${loc}, Argentina`);
    pushQ(`${numPart} ${calleCore}, ${loc}`);
    if (calleFull.replace(/\s+/g, " ").trim().toLowerCase() !== calleCore.toLowerCase()) {
      pushQ(`${calleFull} ${numPart}, ${loc}, Argentina`);
    }
  } else {
    pushQ(`${calleCore}, ${loc}, Argentina`);
    pushQ(`${calleCore}, ${loc}`);
  }

  const qListOrdered = [
    ...new Set([...webStyleUnique, ...priorityMinimal.filter((x) => x.length >= 4), ...qList]),
  ];

  const geoOptsBase = {
    filterLocalidad: loc,
    filterState: state,
    filterCalle: calleCore,
    filterCalleAlt: calleFull,
    preferredHouseNumber: wantH,
    nominatimLimit: 25,
  };

  const hitToSimpleResult = (hit, qx, auditExtra = {}) => {
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const barrio = barrioDesdeNominatimAddress(hit.address);
    const postcode = postcodeDesdeNominatimAddress(hit.address);
    const qUiWeb = webStyleUnique.includes(String(qx || "").trim());
    return {
      lat,
      lng,
      displayName: String(hit.display_name || qx).trim(),
      ...(barrio ? { barrio } : {}),
      ...(postcode ? { postcode } : {}),
      audit: {
        source: "nominatim_simple_q_freeform",
        q: qx,
        approximate: false,
        ...(qUiWeb ? { q_format: "nominatim_ui_web" } : {}),
        ...auditExtra,
      },
    };
  };

  if (useFreeForm) {
    const omitFirst =
      process.env.NOMINATIM_FREEFORM_OMIT_COUNTRYCODES_FIRST !== "0" &&
      process.env.NOMINATIM_FREEFORM_OMIT_COUNTRYCODES_FIRST !== "false";
    const passes = omitFirst
      ? [
          { omitCountryCodes: true, tag: "omit_cc" },
          { omitCountryCodes: false, tag: "cc_ar" },
        ]
      : [
          { omitCountryCodes: false, tag: "cc_ar" },
          { omitCountryCodes: true, tag: "omit_cc" },
        ];

    for (const qx of qListOrdered) {
      for (const { omitCountryCodes, tag } of passes) {
        const hits = await nominatimSearchFreeForm(qx, {
          limit: 15,
          omitCountryCodes,
          addressdetails: true,
        });
        const hit = pickFreeFormHitForWhatsapp(hits, geoOptsBase);
        if (DEBUG_NOMINATIM) {
          console.log(
            JSON.stringify({
              evt: "geocodeDomicilioSimpleQArgentina_freeform_try",
              q: qx.slice(0, 160),
              omitCountryCodes,
              tag,
              hits: hits.length,
              picked: !!hit,
            })
          );
        }
        const g = hit ? hitToSimpleResult(hit, qx, { freeFormPass: tag }) : null;
        if (g) return g;
      }
    }

    if (enableFb && numPart) {
      const fb = [
        `${calleCore} ${loc}, Argentina`,
        `${calleCore}, ${loc}`,
        `${loc}, Argentina`,
      ];
      if (state.length >= 2) fb.push(`${loc}, ${state}, Argentina`);
      for (const qx of fb) {
        const s = qx.replace(/\s+/g, " ").trim();
        if (s.length < 4) continue;
        for (const omitCountryCodes of [true, false]) {
          const hits = await nominatimSearchFreeForm(s, { limit: 8, omitCountryCodes, addressdetails: true });
          const hit = pickFreeFormHitForWhatsapp(hits, geoOptsBase);
          const g = hit ? hitToSimpleResult(hit, s, { freeFormPass: "fallback", fallback: true }) : null;
          if (g) return g;
        }
      }
    }

    /* Tras fallar el número pedido: misma calle/localidad con números de la misma paridad (±2, ±4, …). */
    if (numPart && nominatimBuscarNumeroCercanoEnabled()) {
      const tHouse = parseHouseNumberInt(nRaw);
      const neighbors = iterHouseNumbersSameParity(nRaw, houseParityMaxSteps()).filter((h) => h !== tHouse);
      for (const hn of neighbors) {
        const qn = `${calleCore} ${hn}, ${loc}`.replace(/\s+/g, " ").trim();
        if (qn.length < 4) continue;
        for (const { omitCountryCodes, tag } of passes) {
          const hits = await nominatimSearchFreeForm(qn, {
            limit: 12,
            omitCountryCodes,
            addressdetails: true,
          });
          const hit = pickFreeFormHitForWhatsapp(hits, geoOptsBase);
          if (!hit) continue;
          const g = hitToSimpleResult(hit, qn, {
            freeFormPass: tag,
            approximate: true,
            source: "nominatim_simple_q_numero_cercano",
            requestedHouseNumber: tHouse,
            usedHouseNumber: hn,
          });
          if (g) {
            console.info("[nominatimClient] geocodeDomicilioSimpleQArgentina numero_cercano_freeform", {
              solicitado: tHouse,
              usado: hn,
              q: qn.slice(0, 160),
            });
            return g;
          }
        }
      }
    }
  }

  for (const qx of qListOrdered) {
    const g = await geocodeAddressArgentina(qx, geoOptsBase);
    if (g && Number.isFinite(g.lat) && Number.isFinite(g.lng)) {
      return { ...g, audit: { source: "nominatim_simple_q", q: qx, approximate: false } };
    }
  }

  for (const qx of qListOrdered) {
    const g = await geocodeAddressArgentina(qx, { ...geoOptsBase, skipStateFilter: true });
    if (g && Number.isFinite(g.lat) && Number.isFinite(g.lng)) {
      return {
        ...g,
        audit: { source: "nominatim_simple_q", q: qx, approximate: false, relaxed: "skip_state_osm_null" },
      };
    }
  }

  const gLoc = await geocodeAddressArgentina(`${loc}, Argentina`, {
    filterLocalidad: loc,
    filterState: state,
    nominatimLimit: 8,
  });
  if (gLoc && Number.isFinite(gLoc.lat) && Number.isFinite(gLoc.lng)) {
    return {
      ...gLoc,
      audit: { source: "nominatim_simple_q_ciudad", q: `${loc}, Argentina`, approximate: true },
    };
  }
  if (DEBUG_NOMINATIM) {
    console.warn(
      JSON.stringify({
        evt: "geocodeDomicilioSimpleQArgentina_miss",
        calleCore,
        loc,
        queriesTried: qListOrdered.length,
      })
    );
  }
  return null;
}

/**
 * Geocodifica calle + número + ciudad: localidad → viewbox → búsqueda estructurada + fallback paridad.
 * Sin localidad en catálogo (ciudad vacía): consultas libres como antes (sin sufijos de provincia arbitrarios).
 *
 * @param {{ tenantCentroid?: { lat: number, lng: number }, catalogStrict?: boolean, precomputedViewboxMeta?: object | null, allowTenantCentroidFallback?: boolean, stateOrProvince?: string, postalCode?: string, localityMaxDistanceMeters?: number }} options
 * catalogStrict: exige candidato dentro del viewbox cuando existe; si viola localidad, descarta.
 * allowTenantCentroidFallback: default !catalogStrict para el viewbox de localidad (catálogo no usa centro cooperativa como bbox sustituto).
 * stateOrProvince: provincia para desambiguar localidad en Nominatim.
 * postalCode: CPA (solo dígitos, 4–8) para búsqueda estructurada Nominatim.
 * precomputedViewboxMeta: evita un segundo geocode de la misma localidad (p. ej. WhatsApp ya calculó viewbox).
 * localityMaxDistanceMeters: tope de distancia al centroide de la localidad (Nominatim); por defecto env o 20 km.
 * @returns {Promise<{ lat: number, lng: number, displayName: string, barrio?: string, postcode?: string, audit?: object } | null>}
 *
 * Orden interno: viewbox de la ciudad → índice local (`LOCAL_ADDRESS_INDEX_PATH`) si aplica → búsqueda
 * estructurada Nominatim → `searchCalleLocalidadArgentina` + `resolveStructuredAddressCoords` → `q` acotada.
 */
export async function geocodeCalleNumeroLocalidadArgentina(ciudad, calle, numero, options = {}) {
  const c = String(ciudad || "").trim();
  const cal = String(calle || "").trim();
  const nRaw = String(numero ?? "").trim();
  if (cal.length < 2) return null;
  const catalogStrict = !!options.catalogStrict;
  const tenantCentroid = options.tenantCentroid;
  const allowTenantCentroidFallback =
    options.allowTenantCentroidFallback !== undefined
      ? !!options.allowTenantCentroidFallback
      : !catalogStrict;
  const stateOrProvince = String(options.stateOrProvince || "").trim();
  const postalCode = String(options.postalCode || "")
    .trim()
    .replace(/\D/g, "");

  const audit = {
    requestedHouseNumber: hasMeaningfulHouseNumber(nRaw) ? parseHouseNumberInt(nRaw) : null,
    usedHouseNumber: null,
    approximate: false,
    source: null,
    viewboxUsed: false,
    localityGeocoded: c.length >= 2,
  };

  if (c.length < 2) {
    const qAttempts = [];
    if (hasMeaningfulHouseNumber(nRaw)) {
      const n = parseHouseNumberInt(nRaw);
      qAttempts.push(`${n} ${cal}, Argentina`, `${cal} ${n}, Argentina`, `${c ? `${c}, ` : ""}${cal} ${n}, Argentina`.replace(/^, /, ""));
    } else {
      qAttempts.push(`${cal}, Argentina`);
    }
    for (const q of qAttempts) {
      const g = await geocodeAddressArgentina(q);
      if (g && nominatimDisplayMatchesCalle(g.displayName, cal)) {
        audit.source = "legacy_q_no_city";
        audit.usedHouseNumber = audit.requestedHouseNumber;
        return { ...g, audit };
      }
    }
    return null;
  }

  const vbMeta = Object.prototype.hasOwnProperty.call(options, "precomputedViewboxMeta")
    ? options.precomputedViewboxMeta
    : await geocodeLocalityViewboxArgentina(c, tenantCentroid, {
        allowTenantCentroidFallback,
        stateOrProvince: stateOrProvince || undefined,
        postalCode: postalCode.length >= 4 ? postalCode : undefined,
      });
  if (vbMeta?.viewboxStr) audit.viewboxUsed = true;
  const bbox = vbMeta?.bbox || null;
  const bounded = vbMeta?.viewboxStr ? { viewbox: vbMeta.viewboxStr, bounded: "1" } : {};
  const mayRunBoundedStructured = !catalogStrict || !!vbMeta?.viewboxStr;
  const maxDistOpt = options.localityMaxDistanceMeters;
  const passesLocalPlausibility = (la, lo) => {
    if (bbox != null && !pointInBBox(la, lo, bbox)) return false;
    if (!coordsPassLocalityCentroidGuard(la, lo, vbMeta, maxDistOpt)) return false;
    return true;
  };

  const anchorForStructured =
    vbMeta && !vbMeta.fromTenantCentroid && vbMeta.center &&
    Number.isFinite(Number(vbMeta.center.lat)) && Number.isFinite(Number(vbMeta.center.lng))
      ? { lat: Number(vbMeta.center.lat), lng: Number(vbMeta.center.lng) }
      : null;

  const localPt = lookupLocalAddressInIndex(c, cal, nRaw);
  if (localPt && Number.isFinite(localPt.lat) && Number.isFinite(localPt.lng)) {
    const la = localPt.lat;
    const lo = localPt.lng;
    if (passesLocalPlausibility(la, lo)) {
      const needsRev = c.length >= 2 && cal.length >= 2;
      const revOk = !needsRev || (await verifyCatalogGeocodeReverse(la, lo, c, cal));
      const plausible =
        !anchorForStructured || isGeocodePlausibleForLocalityAnchor(la, lo, anchorForStructured);
      if (revOk && plausible) {
        audit.source = "local_address_index";
        audit.usedHouseNumber = audit.requestedHouseNumber;
        audit.approximate = false;
        const hn = hasMeaningfulHouseNumber(nRaw) ? parseHouseNumberInt(nRaw) : null;
        const numBit = hn != null ? ` ${hn}` : "";
        return {
          lat: la,
          lng: lo,
          displayName: `Índice local: ${cal}${numBit}, ${c}`.replace(/\s+/g, " ").trim(),
          audit,
        };
      }
    }
  }

  const tryStructured = async (streetLine, wantHouse) => {
    if (!mayRunBoundedStructured) return null;
    const hits = await nominatimSearch({
      street: streetLine,
      city: c,
      country: "Argentina",
      ...(stateOrProvince.length >= 2 ? { state: stateOrProvince } : {}),
      ...(postalCode.length >= 4 ? { postalcode: postalCode } : {}),
      layer: "address",
      limit: "12",
      ...bounded,
    });
    /* Siempre acotar por bbox de la localidad cuando existe (antes solo con catalogStrict → homónimos lejanos). */
    return pickBestStructuredHit(hits, cal, c, bbox, wantHouse, anchorForStructured, stateOrProvince);
  };

  if (hasMeaningfulHouseNumber(nRaw)) {
    const target = parseHouseNumberInt(nRaw);
    const candidates = iterHouseNumbersSameParity(nRaw, houseParityMaxSteps());
    for (const hn of candidates) {
      const streetLine = `${hn} ${cal}`;
      const hit = await tryStructured(streetLine, hn);
      if (hit) {
        const hitHn = parseHouseNumberInt(hit.address?.house_number);
        if (hitHn !== hn) continue;
        const lat = Number(hit.lat);
        const lng = Number(hit.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        if (!passesLocalPlausibility(lat, lng)) continue;
        audit.usedHouseNumber = hn;
        audit.approximate = hn !== target;
        audit.source = audit.approximate ? "structured_parity_fallback" : "structured_exact";
        const barrio = barrioDesdeNominatimAddress(hit.address);
        const postcode = postcodeDesdeNominatimAddress(hit.address);
        return {
          lat,
          lng,
          displayName: String(hit.display_name || "").trim(),
          ...(barrio ? { barrio } : {}),
          ...(postcode ? { postcode } : {}),
          audit,
        };
      }
    }
  } else {
    const hit = await tryStructured(cal, null);
    if (hit) {
      const lat = Number(hit.lat);
      const lng = Number(hit.lon);
      if (Number.isFinite(lat) && Number.isFinite(lng) && passesLocalPlausibility(lat, lng)) {
        audit.source = "structured_street_only";
        audit.usedHouseNumber = null;
        const barrio = barrioDesdeNominatimAddress(hit.address);
        const postcode = postcodeDesdeNominatimAddress(hit.address);
        return {
          lat,
          lng,
          displayName: String(hit.display_name || "").trim(),
          ...(barrio ? { barrio } : {}),
          ...(postcode ? { postcode } : {}),
          audit,
        };
      }
    }
  }

  const pack = await searchCalleLocalidadArgentina(
    c,
    cal,
    40,
    vbMeta?.viewboxStr || null,
    stateOrProvince,
    postalCode.length >= 4 ? postalCode : null
  );
  let houseHits = pack.houseHits || [];
  let streetCenter = pack.streetCenter || null;
  if (bbox && houseHits.length) {
    houseHits = houseHits.filter((h) => pointInBBox(h.lat, h.lng, bbox));
    if (streetCenter && !pointInBBox(streetCenter.lat, streetCenter.lng, bbox)) streetCenter = null;
  }
  const targetNum = hasMeaningfulHouseNumber(nRaw) ? parseHouseNumberInt(nRaw) : null;
  const qCiudad =
    postalCode.length >= 4
      ? `${c}, ${postalCode}, ${stateOrProvince.length >= 2 ? `${stateOrProvince}, ` : ""}Argentina`.replace(
          /\s+/g,
          " "
        )
      : stateOrProvince.length >= 2
        ? `${c}, ${stateOrProvince}, Argentina`
        : `${c}, Argentina`;
  const geoCiudad =
    (await geocodeAddressArgentina(qCiudad, {
      filterLocalidad: c,
      filterState: stateOrProvince.length >= 2 ? stateOrProvince : "",
    })) ||
    (allowTenantCentroidFallback &&
    c.length < 2 &&
    tenantCentroid &&
    Number.isFinite(Number(tenantCentroid.lat)) &&
    Number.isFinite(Number(tenantCentroid.lng))
      ? {
          lat: Number(tenantCentroid.lat),
          lng: Number(tenantCentroid.lng),
          displayName: c,
        }
      : null);
  const fallbackCity =
    geoCiudad && Number.isFinite(geoCiudad.lat) && Number.isFinite(geoCiudad.lng)
      ? { lat: geoCiudad.lat, lng: geoCiudad.lng }
      : null;

  const picked = resolveStructuredAddressCoords({
    houseHits,
    streetCenter,
    targetNum,
    userGps: null,
    fallbackCity,
    nearMeters: 120,
  });
  if (
    picked &&
    Number.isFinite(picked.lat) &&
    Number.isFinite(picked.lng) &&
    passesLocalPlausibility(picked.lat, picked.lng)
  ) {
    audit.source = picked.source || "search_calle_resolve";
    audit.usedHouseNumber = picked.anchorHouse ?? audit.requestedHouseNumber;
    audit.approximate =
      audit.requestedHouseNumber != null &&
      audit.usedHouseNumber != null &&
      audit.usedHouseNumber !== audit.requestedHouseNumber;
    const anchorHouse = picked.anchorHouse;
    const displayTail = anchorHouse != null ? ` (ref. ${cal} ${anchorHouse})` : "";
    let postcodePick = null;
    try {
      const revPick = await reverseGeocodeArgentina(picked.lat, picked.lng);
      postcodePick = postcodeDesdeNominatimAddress(revPick?.address);
    } catch (_) {}
    return {
      lat: picked.lat,
      lng: picked.lng,
      displayName: `${picked.source}${displayTail}, ${cal}, ${c}`,
      ...(postcodePick ? { postcode: postcodePick } : {}),
      audit,
    };
  }

  if (hasMeaningfulHouseNumber(nRaw)) {
    const target = parseHouseNumberInt(nRaw);
    const candNums = iterHouseNumbersSameParity(nRaw, houseParityMaxSteps());
    for (const hn of candNums) {
      const attempts = [`${hn} ${cal}, ${c}, Argentina`, `${cal} ${hn}, ${c}, Argentina`];
      for (const q of attempts) {
        await throttle();
        const p = nominatimBaseParams();
        p.set("q", q);
        p.set("limit", "8");
        if (vbMeta?.viewboxStr) {
          p.set("viewbox", vbMeta.viewboxStr);
          p.set("bounded", "1");
        }
        const url = `${getNominatimBaseUrl()}/search?${p.toString()}`;
        const arr = await nominatimFetchSearchArrayWithPublicFallback(url);
        if (!Array.isArray(arr)) continue;
        for (const hit of arr) {
          if (!nominatimHitStrictLocalidad(hit, c) || !nominatimHitMatchesCalle(hit, cal)) continue;
          const hitHnQ = parseHouseNumberInt(hit.address?.house_number);
          if (hitHnQ !== hn) continue;
          if (
            stateOrProvince.length >= 2 &&
            !nominatimStateMatchesTenant(stateFromNominatimHit(hit), stateOrProvince)
          ) {
            continue;
          }
          const lat = Number(hit.lat);
          const lng = Number(hit.lon);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
          if (!passesLocalPlausibility(lat, lng)) continue;
          const approx = hn !== target;
          audit.source = approx ? "numero_cercano_q" : "final_q_filtered";
          audit.usedHouseNumber = hn;
          audit.requestedHouseNumber = target;
          audit.approximate = approx;
          if (approx) {
            console.info("[nominatimClient] geocodeCalleNumeroLocalidadArgentina numero_cercano_q", {
              calle: cal,
              localidad: c,
              solicitado: target,
              usado: hn,
              q: q.slice(0, 140),
            });
          }
          const br = barrioDesdeNominatimAddress(hit.address);
          const postcode = postcodeDesdeNominatimAddress(hit.address);
          return {
            lat,
            lng,
            displayName: String(hit.display_name || "").trim(),
            ...(br ? { barrio: br } : {}),
            ...(postcode ? { postcode } : {}),
            audit,
          };
        }
      }
    }
  }

  return null;
}

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

/** Máx. distancia (m) del centroide Nominatim de la localidad; evita pins en homónimos lejanos. */
export function localityCentroidMaxDistanceMetersFromEnv() {
  const v = Number(process.env.NOMINATIM_LOCALITY_MAX_DISTANCE_METERS);
  /* 20 km por defecto: separa localidades vecinas (p. ej. Hasenkamp vs Cerrito ~24–26 km). */
  return Number.isFinite(v) && v >= 5000 && v <= 200000 ? v : 20000;
}

/**
 * Si el viewbox viene del geocode de la localidad (no del centro del tenant), el punto no debe caer
 * demasiado lejos de ese centro (p. ej. Sarmiento en Cerrito vs Hasenkamp).
 */
export function coordsPassLocalityCentroidGuard(lat, lng, vbMeta, maxMeters) {
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return false;
  if (!vbMeta || vbMeta.fromTenantCentroid) return true;
  const c = vbMeta.center;
  if (!c || !Number.isFinite(Number(c.lat)) || !Number.isFinite(Number(c.lng))) return true;
  const cap =
    maxMeters != null && Number.isFinite(Number(maxMeters)) && Number(maxMeters) > 0
      ? Number(maxMeters)
      : localityCentroidMaxDistanceMetersFromEnv();
  const d = haversineMeters(la, lo, Number(c.lat), Number(c.lng));
  return Number.isFinite(d) && d <= cap;
}

/** Primer entero en el string (número de puerta). */
export function parseHouseNumberInt(numStr) {
  const m = String(numStr || "").match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return Number.isFinite(n) ? n : null;
}

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
 * @param {string | null} viewboxStr — si viene, bounded=1 (acota a la localidad conocida).
 * @param {string | null} [stateOrProvince] — restringe resultados a la provincia del tenant.
 * @param {string | null} [postalCode] — código postal (solo dígitos) para acotar la búsqueda libre.
 * @returns {{ houseHits: Array<{ lat: number, lng: number, houseNum: number, displayName: string }>, streetCenter: { lat: number, lng: number, displayName: string } | null }}
 */
export async function searchCalleLocalidadArgentina(
  ciudad,
  calle,
  limit = 40,
  viewboxStr = null,
  stateOrProvince = null,
  postalCode = null
) {
  const c = String(ciudad || "").trim();
  const cal = String(calle || "").trim();
  const st = String(stateOrProvince || "").trim();
  const pc = String(postalCode || "")
    .trim()
    .replace(/\D/g, "");
  if (c.length < 2 || cal.length < 2) return { houseHits: [], streetCenter: null };
  const lim = Math.min(50, Math.max(8, Number(limit) || 40));
  await throttle();
  const p = nominatimBaseParams();
  /* OSM devuelve mezcla de frentes con housenumber y geometrías de vía; se clasifican para paridad / eje. */
  let qStr;
  if (pc.length >= 4 && st.length >= 2) {
    qStr = `${cal}, ${c}, ${pc}, ${st}, Argentina`;
  } else if (st.length >= 2) {
    qStr = `${cal}, ${c}, ${st}, Argentina`;
  } else if (pc.length >= 4) {
    qStr = `${cal}, ${c}, ${pc}, Argentina`;
  } else {
    qStr = `${cal}, ${c}, Argentina`;
  }
  p.set("q", qStr);
  p.set("limit", String(lim));
  const vb = viewboxStr != null ? String(viewboxStr).trim() : "";
  if (vb.length > 0) {
    p.set("viewbox", vb);
    p.set("bounded", "1");
  }
  const url = `${getNominatimBaseUrl()}/search?${p.toString()}`;
  const arrRaw = await nominatimFetchSearchArrayWithPublicFallback(url);
  const arr = Array.isArray(arrRaw) ? arrRaw : [];
  if (!arr.length) return { houseHits: [], streetCenter: null };
  const houseHits = [];
  const streetCandidates = [];
  for (const hit of arr) {
    const displayName = String(hit.display_name || "").trim();
    if (!nominatimHitStrictLocalidad(hit, c)) continue;
    if (st.length >= 2 && !nominatimStateMatchesTenant(stateFromNominatimHit(hit), st)) continue;
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
    return pickCoordsWithParityAndGps(hits, targetNum, userGps, fallbackCity, near, streetCenter);
  }

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
      if (
        streetCenter &&
        Number.isFinite(streetCenter.lat) &&
        Number.isFinite(streetCenter.lng)
      ) {
        const ha = haversineMeters(a.lat, a.lng, streetCenter.lat, streetCenter.lng);
        const hb = haversineMeters(b.lat, b.lng, streetCenter.lat, streetCenter.lng);
        if (ha !== hb) return ha - hb;
      }
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
 */
export function pickCoordsWithParityAndGps(
  hits,
  targetNum,
  userGps,
  fallbackCoords,
  nearMeters = 120,
  streetCenter = null
) {
  const near = Number.isFinite(Number(nearMeters)) && Number(nearMeters) > 0 ? Number(nearMeters) : 120;
  if (!hits.length) {
    return fallbackCoords && Number.isFinite(fallbackCoords.lat) && Number.isFinite(fallbackCoords.lng)
      ? { lat: fallbackCoords.lat, lng: fallbackCoords.lng, source: "fallback" }
      : null;
  }
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
      if (
        streetCenter &&
        Number.isFinite(streetCenter.lat) &&
        Number.isFinite(streetCenter.lng)
      ) {
        const ha = haversineMeters(a.lat, a.lng, streetCenter.lat, streetCenter.lng);
        const hb = haversineMeters(b.lat, b.lng, streetCenter.lat, streetCenter.lng);
        if (ha !== hb) return ha - hb;
      }
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
  const url = `${getNominatimBaseUrl()}/reverse?${p.toString()}`;
  const hit = await nominatimFetchReverseHitWithPublicFallback(url);
  if (!hit || hit.error) return null;
  const dn = String(hit.display_name || "").trim();
  if (!dn) return null;
  const barrio = barrioDesdeNominatimAddress(hit.address);
  const addr = hit.address && typeof hit.address === "object" ? hit.address : null;
  return { displayName: dn, ...(barrio ? { barrio } : {}), ...(addr ? { address: addr } : {}) };
}

/**
 * Comprueba si un resultado de reverse encaja con localidad + calle del padrón (sin llamar a la red).
 */
export function reverseHitMatchesCatalog(rev, localidad, calle) {
  if (!rev || !rev.displayName) return false;
  const loc = String(localidad || "").trim();
  const cal = String(calle || "").trim();
  if (loc.length < 2 || cal.length < 2) return true;
  const hitLike = { display_name: rev.displayName, address: rev.address || null };
  return nominatimHitStrictLocalidad(hitLike, loc) && nominatimHitMatchesCalle(hitLike, cal);
}

/** Reverse encaja solo con la localidad del catálogo (sin exigir nombre de calle). Línea libre relajada. */
export function reverseHitMatchesLocalidadSolo(rev, localidad) {
  if (!rev || !rev.displayName) return false;
  const loc = String(localidad || "").trim();
  if (loc.length < 2) return true;
  const hitLike = { display_name: rev.displayName, address: rev.address || null };
  return nominatimHitStrictLocalidad(hitLike, loc);
}

/**
 * Reverse Nominatim y validación estricta para domicilio desde catálogo (evita pin en otra ciudad).
 */
export async function verifyCatalogGeocodeReverse(lat, lng, localidad, calle) {
  const loc = String(localidad || "").trim();
  const cal = String(calle || "").trim();
  if (loc.length < 2 || cal.length < 2) return true;
  const rev = await reverseGeocodeArgentina(lat, lng);
  if (!rev) return false;
  return reverseHitMatchesCatalog(rev, loc, cal);
}

/** Parámetros permitidos en el proxy (evita abuso como proxy HTTP genérico). */
const NOMINATIM_PROXY_SEARCH_ALLOW = new Set([
  "q",
  "street",
  "city",
  "state",
  "country",
  "postalcode",
  "countrycodes",
  "limit",
  "viewbox",
  "bounded",
  "extratags",
  "namedetails",
  "addressdetails",
]);

/**
 * Búsqueda Nominatim desde el servidor (panel web / GitHub Pages: el navegador no puede llamar OSM por CORS).
 * @param {Record<string, string|number>} clientParams
 * @returns {Promise<object[]>}
 */
export async function nominatimProxySearch(clientParams = {}) {
  const p = nominatimBaseParams();
  const o = clientParams && typeof clientParams === "object" && !Array.isArray(clientParams) ? clientParams : {};
  for (const [k, v] of Object.entries(o)) {
    const lk = String(k).toLowerCase();
    if (!NOMINATIM_PROXY_SEARCH_ALLOW.has(lk)) continue;
    if (v == null) continue;
    const s = String(v).trim();
    if (!s) continue;
    p.set(lk, s);
  }
  const url = `${getNominatimBaseUrl()}/search?${p.toString()}`;
  const backoff503 = [1500, 4000, 9000, 16000, 22000];
  let lastErr = null;
  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await throttle();
    const res = await nominatimFetch(url);
    if (res.status === 503 || res.status === 429) {
      lastErr = new Error(`nominatim search ${res.status}`);
      if (attempt < maxAttempts - 1) await sleep(backoff503[attempt]);
      continue;
    }
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`nominatim search ${res.status}: ${t.slice(0, 200)}`);
    }
    const j = await res.json();
    return Array.isArray(j) ? j : [];
  }
  throw lastErr || new Error("nominatim search failed after retries");
}

/**
 * Reverse Nominatim crudo (misma forma que consume el front para provincia desde coords).
 * @param {object} body lat, lon|lng, zoom opcional
 */
export async function nominatimProxyReverseRaw(body = {}) {
  const la = Number(body.lat);
  const lo = Number(body.lon ?? body.lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) {
    throw new Error("lat_lon_invalidos");
  }
  const zoom =
    body.zoom != null && String(body.zoom).trim() ? String(body.zoom).trim() : "18";
  const p = new URLSearchParams({
    format: "json",
    lat: String(la),
    lon: String(lo),
    addressdetails: "1",
    "accept-language": "es",
    zoom,
    email: process.env.NOMINATIM_FROM_EMAIL || process.env.NOMINATIM_FROM || "",
  });
  const url = `${getNominatimBaseUrl()}/reverse?${p.toString()}`;
  const backoff503 = [1500, 4000, 9000, 16000, 22000];
  let lastErr = null;
  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await throttle();
    const res = await nominatimFetch(url);
    if (res.status === 503 || res.status === 429) {
      lastErr = new Error(`nominatim reverse ${res.status}`);
      if (attempt < maxAttempts - 1) await sleep(backoff503[attempt]);
      continue;
    }
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`nominatim reverse ${res.status}: ${t.slice(0, 200)}`);
    }
    return await res.json();
  }
  throw lastErr || new Error("nominatim reverse failed after retries");
}
