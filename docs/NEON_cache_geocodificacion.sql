-- LEGACY: nombre antiguo `cache_geocodificacion`. Preferí `geocodificacion_cache` (ver NEON_geocodificacion_cache.sql).
-- La API puede migrar filas al arrancar (ensureCacheGeocodificacionTable).
-- Caché de direcciones → coordenadas (evita golpear Nominatim con la misma consulta).

CREATE TABLE IF NOT EXISTS cache_geocodificacion (
    direccion_normalizada TEXT PRIMARY KEY,
    latitud NUMERIC(10, 8) NOT NULL,
    longitud NUMERIC(11, 8) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cache_geocodificacion_created ON cache_geocodificacion (created_at DESC);

-- made by leavera77
