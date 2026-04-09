/**
 * Tabla cache_geocodificacion: clave de dirección normalizada → lat/lng (Nominatim por lotes o on-demand).
 * made by leavera77
 */
import { query } from "../db/neon.js";

let _ensured = false;

export async function ensureCacheGeocodificacionTable() {
  if (_ensured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS cache_geocodificacion (
      direccion_normalizada TEXT PRIMARY KEY,
      latitud NUMERIC(10, 8) NOT NULL,
      longitud NUMERIC(11, 8) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_cache_geocodificacion_created ON cache_geocodificacion (created_at DESC)`
  );
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
  const r = await query(
    `SELECT latitud, longitud FROM cache_geocodificacion WHERE direccion_normalizada = $1 LIMIT 1`,
    [k]
  );
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
    `INSERT INTO cache_geocodificacion (direccion_normalizada, latitud, longitud)
     VALUES ($1, $2, $3)
     ON CONFLICT (direccion_normalizada) DO UPDATE SET
       latitud = EXCLUDED.latitud,
       longitud = EXCLUDED.longitud,
       created_at = NOW()`,
    [k, la, lo]
  );
}
