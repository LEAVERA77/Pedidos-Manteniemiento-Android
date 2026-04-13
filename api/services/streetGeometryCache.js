/**
 * Geometría de vía desde OSM con caché en PostgreSQL (tabla calles_geometrias).
 * made by leavera77
 */

import { query } from "../db/neon.js";
import { obtenerGeometriaCalle } from "./interpolacionAlturas.js";
import { normalizarNombreCalle } from "./streetNormalizer.js";

/**
 * @param {number} lat1
 * @param {number} lng1
 * @param {number} lat2
 * @param {number} lng2
 * @returns {number}
 */
export function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * @param {Array<{ lat: number, lng: number }>} geometria
 * @returns {number}
 */
export function longitudPolylineMetros(geometria) {
  if (!geometria || geometria.length < 2) return 0;
  let t = 0;
  for (let i = 1; i < geometria.length; i++) {
    const a = geometria[i - 1];
    const b = geometria[i];
    t += haversineMeters(Number(a.lat), Number(a.lng), Number(b.lat), Number(b.lng));
  }
  return t;
}

function claveLocalidad(loc) {
  return String(loc || "")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * @param {unknown} g
 * @returns {Array<{ lat: number, lng: number }>|null}
 */
function parseGeometriaJson(g) {
  if (g == null) return null;
  if (Array.isArray(g)) {
    const out = [];
    for (const p of g) {
      const lat = Number(p?.lat);
      const lng = Number(p?.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) out.push({ lat, lng });
    }
    return out.length >= 2 ? out : null;
  }
  if (typeof g === "string") {
    try {
      return parseGeometriaJson(JSON.parse(g));
    } catch {
      return null;
    }
  }
  return null;
}

let warnedMissingTable = false;

/**
 * Geometría + longitud; usa caché BD si existe la tabla.
 * @param {string} calle
 * @param {string} localidad
 * @param {string} [provincia]
 * @returns {Promise<{ hit: boolean, geometria?: Array<{lat:number,lng:number}>, longitudTotal?: number, source?: string, error?: string }>}
 */
export async function obtenerGeometriaCalleCacheada(calle, localidad, provincia = "") {
  const nombreNorm = normalizarNombreCalle(calle);
  const locKey = claveLocalidad(localidad);
  const provTrim = provincia ? String(provincia).trim() : "";

  if (nombreNorm.length < 2 || locKey.length < 2) {
    return { hit: false };
  }

  try {
    const cached = await query(
      `SELECT geometria, longitud_total_metros
       FROM calles_geometrias
       WHERE nombre_normalizado = $1 AND localidad = $2
       LIMIT 1`,
      [nombreNorm, locKey]
    );
    if (cached.rows.length > 0) {
      await query(
        `UPDATE calles_geometrias SET ultima_consulta = NOW() WHERE nombre_normalizado = $1 AND localidad = $2`,
        [nombreNorm, locKey]
      );
      const geom = parseGeometriaJson(cached.rows[0].geometria);
      const L = Number(cached.rows[0].longitud_total_metros);
      if (geom && geom.length >= 2 && Number.isFinite(L) && L > 1) {
        return { hit: true, geometria: geom, longitudTotal: L, source: "cache" };
      }
    }
  } catch (e) {
    const msg = String(e?.message || e);
    if (/relation .*calles_geometrias/i.test(msg) || /does not exist/i.test(msg)) {
      if (!warnedMissingTable) {
        warnedMissingTable = true;
        console.warn("[streetGeometryCache] Tabla calles_geometrias no existe; ejecutar migración calles_geometrias.sql");
      }
    } else {
      console.warn("[streetGeometryCache] cache read:", msg);
    }
  }

  const pack = await obtenerGeometriaCalle(String(calle).trim(), locKey, provTrim);
  const raw = pack?.geometry;
  if (!raw || raw.length < 2) {
    return { hit: false };
  }
  const geometria = raw.map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }));
  const longitudTotal = longitudPolylineMetros(geometria);
  if (!Number.isFinite(longitudTotal) || longitudTotal < 2) {
    return { hit: false };
  }

  try {
    await query(
      `INSERT INTO calles_geometrias
        (nombre_normalizado, nombre_original, localidad, provincia, geometria, longitud_total_metros, fuente, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, 'overpass', NOW())
       ON CONFLICT (nombre_normalizado, localidad) DO UPDATE SET
         nombre_original = EXCLUDED.nombre_original,
         provincia = COALESCE(EXCLUDED.provincia, calles_geometrias.provincia),
         geometria = EXCLUDED.geometria,
         longitud_total_metros = EXCLUDED.longitud_total_metros,
         fuente = EXCLUDED.fuente,
         updated_at = NOW()`,
      [
        nombreNorm,
        String(calle).trim().slice(0, 200),
        locKey,
        provTrim ? provTrim.slice(0, 100) : null,
        JSON.stringify(geometria),
        longitudTotal,
      ]
    );
  } catch (e) {
    const msg = String(e?.message || e);
    if (!/calles_geometrias/i.test(msg)) {
      console.warn("[streetGeometryCache] cache write:", msg);
    }
  }

  return { hit: true, geometria, longitudTotal, source: "overpass" };
}
