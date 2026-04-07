/**
 * Cliente Nominatim (OSM) con rate limit ~1 req/s y cabeceras de uso responsable.
 * Geocodificación estructurada + viewbox por localidad del catálogo (evita homónimos entre ciudades).
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

function localityMarginDeg() {
  const v = Number(process.env.NOMINATIM_LOCALITY_VIEWBOX_MARGIN_DEG);
  return Number.isFinite(v) && v > 0 && v < 2 ? v : 0.07;
}

function tenantViewboxDeltaDeg() {
  const v = Number(process.env.NOMINATIM_TENANT_VIEWBOX_DELTA_DEG);
  return Number.isFinite(v) && v > 0 && v < 2 ? v : 0.11;
}

function houseParityMaxSteps() {
  const v = parseInt(process.env.NOMINATIM_HOUSE_PARITY_MAX_STEPS || "8", 10);
  return Number.isFinite(v) ? Math.min(20, Math.max(1, v)) : 8;
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

function normTxt(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
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
 * Geocode solo localidad → bbox ampliada + viewbox string. Fallback: centro tenant si viene.
 * @returns {Promise<{ viewboxStr: string, bbox: object, center: {lat,lng}, fromTenantCentroid?: boolean } | null>}
 */
export async function geocodeLocalityViewboxArgentina(localidad, tenantCentroid) {
  const loc = String(localidad || "").trim();
  if (loc.length < 2) return null;
  const delta = tenantViewboxDeltaDeg();
  await throttle();
  const p = nominatimBaseParams();
  p.set("city", loc);
  p.set("country", "Argentina");
  p.set("limit", "10");
  const url = `https://nominatim.openstreetmap.org/search?${p.toString()}`;
  const res = await fetch(url, { headers: nominatimHeaders() });
  if (!res.ok) return null;
  const arr = await res.json();
  if (!Array.isArray(arr) || !arr.length) {
    if (
      tenantCentroid &&
      Number.isFinite(Number(tenantCentroid.lat)) &&
      Number.isFinite(Number(tenantCentroid.lng))
    ) {
      const vb = viewboxAroundPoint(Number(tenantCentroid.lat), Number(tenantCentroid.lng), delta);
      if (vb) return { viewboxStr: vb.viewboxStr, bbox: vb, center: vb.center, fromTenantCentroid: true };
    }
    return null;
  }
  const filtered = arr.filter((h) => nominatimHitStrictLocalidad(h, loc));
  const hit = filtered[0];
  if (!hit) {
    if (
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
  const margin = localityMarginDeg();
  if (Array.isArray(bb) && bb.length >= 4) {
    const expanded = expandBBoxFromNominatim(bb, margin);
    if (expanded) {
      const lat = Number(hit.lat);
      const lng = Number(hit.lon);
      return {
        viewboxStr: viewboxStringFromBBox(expanded),
        bbox: expanded,
        center: { lat: Number.isFinite(lat) ? lat : (expanded.minLat + expanded.maxLat) / 2, lng: Number.isFinite(lng) ? lng : (expanded.minLon + expanded.maxLon) / 2 },
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
  const url = `https://nominatim.openstreetmap.org/search?${p.toString()}`;
  const res = await fetch(url, { headers: nominatimHeaders() });
  if (!res.ok) return [];
  const arr = await res.json();
  return Array.isArray(arr) ? arr : [];
}

function scoreStructuredHit(hit, wantHouse) {
  const hn = hit.address?.house_number;
  const parsed = hn != null ? parseHouseNumberInt(String(hn)) : null;
  if (wantHouse != null && Number.isFinite(wantHouse) && parsed === wantHouse) return 0;
  if (parsed != null) return 1;
  return 2;
}

function pickBestStructuredHit(hits, calle, localidad, bbox, wantHouse) {
  const cal = String(calle || "").trim();
  const loc = String(localidad || "").trim();
  let pool = hits.filter((h) => nominatimHitStrictLocalidad(h, loc) && nominatimHitMatchesCalle(h, cal));
  if (bbox) {
    pool = pool.filter((h) => {
      const la = Number(h.lat);
      const lo = Number(h.lon);
      return Number.isFinite(la) && Number.isFinite(lo) && pointInBBox(la, lo, bbox);
    });
  }
  if (!pool.length) return null;
  pool.sort((a, b) => scoreStructuredHit(a, wantHouse) - scoreStructuredHit(b, wantHouse));
  return pool[0];
}

/**
 * @param {string} query
 * @param {{ filterLocalidad?: string } | undefined} opts
 * @returns {Promise<{ lat: number, lng: number, displayName: string, barrio?: string } | null>}
 */
export async function geocodeAddressArgentina(query, opts = {}) {
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
  const filterLoc = opts.filterLocalidad != null ? String(opts.filterLocalidad).trim() : "";
  const hit =
    filterLoc.length >= 2 ? arr.find((h) => nominatimHitStrictLocalidad(h, filterLoc)) : arr[0];
  if (!hit) return null;
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
 * Geocodifica calle + número + ciudad: localidad → viewbox → búsqueda estructurada + fallback paridad.
 * Sin localidad en catálogo (ciudad vacía): consultas libres como antes (sin sufijos de provincia arbitrarios).
 *
 * @param {{ tenantCentroid?: { lat: number, lng: number }, catalogStrict?: boolean, precomputedViewboxMeta?: object | null }} options
 * catalogStrict: exige candidato dentro del viewbox cuando existe; si viola localidad, descarta.
 * precomputedViewboxMeta: evita un segundo geocode de la misma localidad (p. ej. WhatsApp ya calculó viewbox).
 * @returns {Promise<{ lat: number, lng: number, displayName: string, barrio?: string, audit?: object } | null>}
 */
export async function geocodeCalleNumeroLocalidadArgentina(ciudad, calle, numero, options = {}) {
  const c = String(ciudad || "").trim();
  const cal = String(calle || "").trim();
  const nRaw = String(numero ?? "").trim();
  if (cal.length < 2) return null;
  const catalogStrict = !!options.catalogStrict;
  const tenantCentroid = options.tenantCentroid;

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
    : await geocodeLocalityViewboxArgentina(c, tenantCentroid);
  if (vbMeta?.viewboxStr) audit.viewboxUsed = true;
  const bbox = vbMeta?.bbox || null;
  const bounded = vbMeta?.viewboxStr ? { viewbox: vbMeta.viewboxStr, bounded: "1" } : {};

  const tryStructured = async (streetLine, wantHouse) => {
    const hits = await nominatimSearch({
      street: streetLine,
      city: c,
      country: "Argentina",
      limit: "12",
      ...bounded,
    });
    return pickBestStructuredHit(hits, cal, c, catalogStrict ? bbox : null, wantHouse);
  };

  if (hasMeaningfulHouseNumber(nRaw)) {
    const target = parseHouseNumberInt(nRaw);
    const candidates = iterHouseNumbersSameParity(nRaw, houseParityMaxSteps());
    for (const hn of candidates) {
      const streetLine = `${hn} ${cal}`;
      const hit = await tryStructured(streetLine, hn);
      if (hit) {
        const lat = Number(hit.lat);
        const lng = Number(hit.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        if (catalogStrict && bbox && !pointInBBox(lat, lng, bbox)) continue;
        audit.usedHouseNumber = hn;
        audit.approximate = hn !== target;
        audit.source = audit.approximate ? "structured_parity_fallback" : "structured_exact";
        const barrio = barrioDesdeNominatimAddress(hit.address);
        return {
          lat,
          lng,
          displayName: String(hit.display_name || "").trim(),
          ...(barrio ? { barrio } : {}),
          audit,
        };
      }
    }
  } else {
    const hit = await tryStructured(cal, null);
    if (hit) {
      const lat = Number(hit.lat);
      const lng = Number(hit.lon);
      if (Number.isFinite(lat) && Number.isFinite(lng) && (!catalogStrict || !bbox || pointInBBox(lat, lng, bbox))) {
        audit.source = "structured_street_only";
        audit.usedHouseNumber = null;
        const barrio = barrioDesdeNominatimAddress(hit.address);
        return {
          lat,
          lng,
          displayName: String(hit.display_name || "").trim(),
          ...(barrio ? { barrio } : {}),
          audit,
        };
      }
    }
  }

  const pack = await searchCalleLocalidadArgentina(c, cal, 40, vbMeta?.viewboxStr || null);
  let houseHits = pack.houseHits || [];
  let streetCenter = pack.streetCenter || null;
  if (catalogStrict && bbox && houseHits.length) {
    houseHits = houseHits.filter((h) => pointInBBox(h.lat, h.lng, bbox));
    if (streetCenter && !pointInBBox(streetCenter.lat, streetCenter.lng, bbox)) streetCenter = null;
  }
  const targetNum = hasMeaningfulHouseNumber(nRaw) ? parseHouseNumberInt(nRaw) : null;
  const geoCiudad =
    (await geocodeAddressArgentina(`${c}, Argentina`, { filterLocalidad: c })) ||
    (tenantCentroid &&
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
  if (picked && Number.isFinite(picked.lat) && Number.isFinite(picked.lng)) {
    audit.source = picked.source || "search_calle_resolve";
    audit.usedHouseNumber = picked.anchorHouse ?? audit.requestedHouseNumber;
    audit.approximate =
      audit.requestedHouseNumber != null &&
      audit.usedHouseNumber != null &&
      audit.usedHouseNumber !== audit.requestedHouseNumber;
    const anchorHouse = picked.anchorHouse;
    const displayTail = anchorHouse != null ? ` (ref. ${cal} ${anchorHouse})` : "";
    return {
      lat: picked.lat,
      lng: picked.lng,
      displayName: `${picked.source}${displayTail}, ${cal}, ${c}`,
      audit,
    };
  }

  if (hasMeaningfulHouseNumber(nRaw)) {
    const n = parseHouseNumberInt(nRaw);
    const attempts = [`${n} ${cal}, ${c}, Argentina`, `${cal} ${n}, ${c}, Argentina`];
    for (const q of attempts) {
      await throttle();
      const p = nominatimBaseParams();
      p.set("q", q);
      p.set("limit", "8");
      if (vbMeta?.viewboxStr) {
        p.set("viewbox", vbMeta.viewboxStr);
        p.set("bounded", "1");
      }
      const url = `https://nominatim.openstreetmap.org/search?${p.toString()}`;
      const res = await fetch(url, { headers: nominatimHeaders() });
      if (!res.ok) continue;
      const arr = await res.json();
      if (!Array.isArray(arr)) continue;
      for (const hit of arr) {
        if (!nominatimHitStrictLocalidad(hit, c) || !nominatimHitMatchesCalle(hit, cal)) continue;
        const lat = Number(hit.lat);
        const lng = Number(hit.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        if (catalogStrict && bbox && !pointInBBox(lat, lng, bbox)) continue;
        audit.source = "final_q_filtered";
        audit.usedHouseNumber = n;
        return {
          lat,
          lng,
          displayName: String(hit.display_name || "").trim(),
          ...(barrioDesdeNominatimAddress(hit.address)
            ? { barrio: barrioDesdeNominatimAddress(hit.address) }
            : {}),
          audit,
        };
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
 * @returns {{ houseHits: Array<{ lat: number, lng: number, houseNum: number, displayName: string }>, streetCenter: { lat: number, lng: number, displayName: string } | null }}
 */
export async function searchCalleLocalidadArgentina(ciudad, calle, limit = 40, viewboxStr = null) {
  const c = String(ciudad || "").trim();
  const cal = String(calle || "").trim();
  if (c.length < 2 || cal.length < 2) return { houseHits: [], streetCenter: null };
  const lim = Math.min(50, Math.max(8, Number(limit) || 40));
  await throttle();
  const p = nominatimBaseParams();
  p.set("q", `${cal}, ${c}, Argentina`);
  p.set("limit", String(lim));
  const vb = viewboxStr != null ? String(viewboxStr).trim() : "";
  if (vb.length > 0) {
    p.set("viewbox", vb);
    p.set("bounded", "1");
  }
  const url = `https://nominatim.openstreetmap.org/search?${p.toString()}`;
  const res = await fetch(url, { headers: nominatimHeaders() });
  if (!res.ok) return { houseHits: [], streetCenter: null };
  const arr = await res.json();
  if (!Array.isArray(arr)) return { houseHits: [], streetCenter: null };
  const houseHits = [];
  const streetCandidates = [];
  for (const hit of arr) {
    const displayName = String(hit.display_name || "").trim();
    if (!nominatimHitStrictLocalidad(hit, c)) continue;
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
