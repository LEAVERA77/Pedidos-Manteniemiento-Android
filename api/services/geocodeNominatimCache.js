/**
 * Caché persistente de respuestas Nominatim (reduce 502 por rate limit y sirve stale si OSM falla).
 * made by leavera77
 */
import crypto from "crypto";
import { query } from "../db/neon.js";

let _ensured = false;

export async function ensureGeocodeNominatimCacheTable() {
  if (_ensured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS geocode_nominatim_cache (
      cache_key TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_geocode_nominatim_cache_created ON geocode_nominatim_cache (created_at DESC)`
  );
  _ensured = true;
}

function stableKey(obj) {
  const o = obj && typeof obj === "object" ? obj : {};
  const keys = Object.keys(o).sort();
  const norm = {};
  for (const k of keys) {
    if (o[k] == null) continue;
    norm[k] = String(o[k]).trim();
  }
  return crypto.createHash("sha256").update(JSON.stringify(norm)).digest("hex");
}

export function cacheKeySearch(params) {
  return `s:${stableKey(params)}`;
}

export function cacheKeyReverse(lat, lon, zoom) {
  const la = Number(lat);
  const lo = Number(lon);
  const z = zoom != null ? String(zoom) : "18";
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  return `r:${la.toFixed(5)}:${lo.toFixed(5)}:${z}`;
}

export async function geocodeCacheGet(key) {
  if (!key) return null;
  await ensureGeocodeNominatimCacheTable();
  const r = await query(`SELECT payload, created_at FROM geocode_nominatim_cache WHERE cache_key = $1 LIMIT 1`, [
    key,
  ]);
  const row = r.rows?.[0];
  if (!row) return null;
  return { payload: row.payload, createdAt: row.created_at };
}

export async function geocodeCacheSet(key, kind, payload) {
  if (!key || !kind) return;
  await ensureGeocodeNominatimCacheTable();
  await query(
    `INSERT INTO geocode_nominatim_cache (cache_key, kind, payload)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (cache_key) DO UPDATE SET payload = EXCLUDED.payload, created_at = NOW()`,
    [key, kind, JSON.stringify(payload)]
  );
}

/** Última entrada reciente (cualquier key) para kind — no usado; reservado para métricas. */
export async function geocodeCacheStats() {
  await ensureGeocodeNominatimCacheTable();
  const r = await query(`SELECT COUNT(*)::int AS n FROM geocode_nominatim_cache`);
  return r.rows?.[0]?.n ?? 0;
}
