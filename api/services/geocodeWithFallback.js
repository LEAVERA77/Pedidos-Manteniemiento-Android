/**
 * Geocodificación con caché (geocodificacion_cache) + Nominatim + reintentos.
 * Uso: script por lotes o fallback opcional (WHATSAPP_GEOCODE_NOMINATIM_FALLBACK).
 * made by leavera77
 */
import { geocodeCalleNumeroLocalidadArgentina } from "./nominatimClient.js";
import {
  cacheGeocodificacionGet,
  cacheGeocodificacionSet,
  normalizarClaveDireccion,
} from "./cacheGeocodificacion.js";
import { query } from "../db/neon.js";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function loadTenantGeocodeHints(tenantId) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) {
    return { geocodeState: null, tenantCentroid: null };
  }
  const r = await query(`SELECT configuracion FROM clientes WHERE id = $1 AND activo = TRUE LIMIT 1`, [tid]);
  let cfg = r.rows?.[0]?.configuracion;
  if (typeof cfg === "string") {
    try {
      cfg = JSON.parse(cfg);
    } catch (_) {
      cfg = {};
    }
  }
  const c = cfg && typeof cfg === "object" ? cfg : {};
  const provRaw = c.provincia ?? c.state ?? c.provincia_nominatim ?? c.provincia_geocode;
  const geocodeState =
    provRaw != null && String(provRaw).trim().length >= 2 ? String(provRaw).trim() : null;
  const lat = c.lat_base != null ? Number(c.lat_base) : null;
  const lng = c.lng_base != null ? Number(c.lng_base) : null;
  const tenantCentroid =
    Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  return { geocodeState, tenantCentroid };
}

function coordsUsables(la, lo) {
  const a = Number(la);
  const b = Number(lo);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (Math.abs(a) < 1e-6 && Math.abs(b) < 1e-6) return false;
  if (Math.abs(a) > 90 || Math.abs(b) > 180) return false;
  return true;
}

/**
 * @param {object} o
 * @param {string} o.calle
 * @param {string} o.localidad
 * @param {string} [o.numero]
 * @param {string} [o.codigoPostal]
 * @param {number} [o.tenantId]
 * @param {string} [o.stateOrProvince] provincia (p. ej. Entre Ríos) si no hay tenant o para reforzar Nominatim
 * @param {number} [o.retries] reintentos tras fallo (default 2)
 * @returns {Promise<{ lat: number, lng: number, displayName?: string, fromCache: boolean } | null>}
 */
export async function geocodeWithFallback(o) {
  if (process.env.DISABLE_NOMINATIM === "1" || process.env.DISABLE_NOMINATIM === "true") {
    return null;
  }
  const calle = String(o.calle || "").trim();
  const loc = String(o.localidad || "").trim();
  if (calle.length < 2 || loc.length < 2) return null;

  const num = o.numero != null && String(o.numero).trim() ? String(o.numero).trim() : "0";
  const cp = o.codigoPostal != null ? String(o.codigoPostal).trim() : "";
  const clave = normalizarClaveDireccion(calle, num === "0" ? "" : num, loc, cp);
  if (clave.length < 3) return null;

  const cached = await cacheGeocodificacionGet(clave);
  if (cached) {
    return { lat: cached.lat, lng: cached.lng, fromCache: true };
  }

  const hints = o.tenantId != null ? await loadTenantGeocodeHints(o.tenantId) : { geocodeState: null, tenantCentroid: null };
  const explicitState = String(o.stateOrProvince || "").trim();
  const stateOrProvince =
    explicitState.length >= 2 ? explicitState : hints.geocodeState || undefined;
  const retries = Number.isFinite(Number(o.retries)) ? Math.max(0, Math.min(5, Number(o.retries))) : 2;

  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const g = await geocodeCalleNumeroLocalidadArgentina(loc, calle, num, {
        allowTenantCentroidFallback: true,
        tenantCentroid: hints.tenantCentroid || undefined,
        stateOrProvince: stateOrProvince || undefined,
      });
      if (g && coordsUsables(g.lat, g.lng)) {
        await cacheGeocodificacionSet(clave, g.lat, g.lng);
        return {
          lat: g.lat,
          lng: g.lng,
          displayName: g.displayName,
          fromCache: false,
        };
      }
    } catch (e) {
      lastErr = e;
    }
    if (attempt < retries) {
      await sleep(1500 * (attempt + 1));
    }
  }
  if (lastErr) {
    console.warn("[geocode-with-fallback] agotados reintentos", lastErr?.message || lastErr);
  }
  return null;
}
