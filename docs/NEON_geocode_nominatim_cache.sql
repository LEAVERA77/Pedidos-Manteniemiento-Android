-- Caché de proxy Nominatim (opcional: la API crea la tabla al vuelo con ensureGeocodeNominatimCacheTable).
-- Ejecutar en Neon si preferís DDL explícito.

CREATE TABLE IF NOT EXISTS geocode_nominatim_cache (
  cache_key TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_geocode_nominatim_cache_created ON geocode_nominatim_cache (created_at DESC);

-- made by leavera77
