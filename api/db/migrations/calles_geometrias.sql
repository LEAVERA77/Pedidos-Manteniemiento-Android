-- Caché de geometrías de vías (Overpass/OSM) para geocodificación catastral sin repetir consultas.
-- Ejecutar en Neon (SQL Editor) o psql tras revisar permisos de extensión.
-- made by leavera77

CREATE TABLE IF NOT EXISTS calles_geometrias (
    id SERIAL PRIMARY KEY,
    nombre_normalizado VARCHAR(200) NOT NULL,
    nombre_original VARCHAR(200),
    localidad VARCHAR(100) NOT NULL,
    provincia VARCHAR(100),
    geometria JSONB,
    longitud_total_metros DOUBLE PRECISION,
    fuente VARCHAR(50) DEFAULT 'overpass',
    ultima_consulta TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_calles_geometrias_unique
ON calles_geometrias (nombre_normalizado, localidad);

CREATE INDEX IF NOT EXISTS idx_calles_geometrias_localidad
ON calles_geometrias (localidad);

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_calles_geometrias_trgm
ON calles_geometrias USING gin (nombre_normalizado gin_trgm_ops);
