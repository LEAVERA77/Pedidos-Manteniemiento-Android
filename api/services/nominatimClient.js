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
 * @param {string} query
 * @returns {Promise<{ lat: number, lng: number, displayName: string } | null>}
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
  return {
    lat,
    lng,
    displayName: String(hit.display_name || q).trim(),
  };
}

/**
 * @returns {Promise<{ displayName: string } | null>}
 */
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
  return dn ? { displayName: dn } : null;
}
