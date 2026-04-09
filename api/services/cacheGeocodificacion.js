/**
 * Tabla geocodificacion_cache: clave de dirección normalizada → lat/lng (lotes / on-demand).
 * Migra datos desde cache_geocodificacion si existía (compatibilidad).
 * made by leavera77
 */
import { query } from "../db/neon.js";

let _ensured = false;

async function migrateFromLegacyIfExists() {
  try {
    const r = await query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'cache_geocodificacion' LIMIT 1`
    );
    if (!r.rows.length) return;
    await query(`
      INSERT INTO geocodificacion_cache (direccion_normalizada, latitud, longitud, fecha_actualizacion)
      SELECT direccion_normalizada, latitud, longitud, COALESCE(created_at, NOW())
      FROM cache_geocodificacion
      ON CONFLICT (direccion_normalizada) DO NOTHING
    `);
  } catch (_) {
    /* ignore */
  }
}

export async function ensureCacheGeocodificacionTable() {
  if (_ensured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS geocodificacion_cache (
      direccion_normalizada TEXT PRIMARY KEY,
      latitud NUMERIC(10, 8) NOT NULL,
      longitud NUMERIC(11, 8) NOT NULL,
      fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_geocod_cache_fecha ON geocodificacion_cache (fecha_actualizacion DESC)`
  );
  await migrateFromLegacyIfExists();
  _ensured = true;
}

/** Clave estable: calle|numero|localidad|cp (minúsculas, espacios colapsados). */
export function normalizarClaveDireccion(calle, numero, localidad, codigoPostal) {
  const norm = (s) =>
    String(s || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ");
  const p = [norm(calle), norm(numero), norm(localidad), norm(codigoPostal)].filter((x) => x.length > 0);
  return p.join("|") || "";
}

export async function cacheGeocodificacionGet(clave) {
  const k = String(clave || "").trim();
  if (k.length < 3) return null;
  await ensureCacheGeocodificacionTable();
  let r = await query(
    `SELECT latitud, longitud FROM geocodificacion_cache WHERE direccion_normalizada = $1 LIMIT 1`,
    [k]
  );
  if (!r.rows?.[0]) {
    try {
      r = await query(
        `SELECT latitud, longitud FROM cache_geocodificacion WHERE direccion_normalizada = $1 LIMIT 1`,
        [k]
      );
    } catch (_) {
      r = { rows: [] };
    }
  }
  const row = r.rows?.[0];
  if (!row) return null;
  const la = Number(row.latitud);
  const lo = Number(row.longitud);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  if (Math.abs(la) < 1e-6 && Math.abs(lo) < 1e-6) return null;
  if (Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
  return { lat: la, lng: lo };
}

export async function cacheGeocodificacionSet(clave, lat, lng) {
  const k = String(clave || "").trim();
  const la = Number(lat);
  const lo = Number(lng);
  if (k.length < 3 || !Number.isFinite(la) || !Number.isFinite(lo)) return;
  if (Math.abs(la) < 1e-6 && Math.abs(lo) < 1e-6) return;
  await ensureCacheGeocodificacionTable();
  await query(
    `INSERT INTO geocodificacion_cache (direccion_normalizada, latitud, longitud)
     VALUES ($1, $2, $3)
     ON CONFLICT (direccion_normalizada) DO UPDATE SET
       latitud = EXCLUDED.latitud,
       longitud = EXCLUDED.longitud,
       fecha_actualizacion = NOW()`,
    [k, la, lo]
  );
}
