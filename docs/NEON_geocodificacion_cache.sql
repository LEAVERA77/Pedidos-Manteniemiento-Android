-- Caché interna de direcciones geocodificadas (fuente de verdad en BD; sin depender de Nominatim en reclamo).
-- Ejecutar en Neon si no usás ensureCacheGeocodificacionTable() desde la API.
-- made by leavera77

CREATE TABLE IF NOT EXISTS geocodificacion_cache (
    direccion_normalizada TEXT PRIMARY KEY,
    latitud NUMERIC(10, 8) NOT NULL,
    longitud NUMERIC(11, 8) NOT NULL,
    fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_geocod_cache_fecha ON geocodificacion_cache (fecha_actualizacion DESC);

-- Opcional: migrar desde nombre antiguo (si existía)
-- INSERT INTO geocodificacion_cache (direccion_normalizada, latitud, longitud, fecha_actualizacion)
-- SELECT direccion_normalizada, latitud, longitud, COALESCE(created_at, NOW()) FROM cache_geocodificacion
-- ON CONFLICT (direccion_normalizada) DO NOTHING;
