-- Migración: Agregar columnas de geocodificación a socios_catalogo
-- Fecha: 2026-04-11
-- Descripción: Agrega latitud, longitud, ubicacion_manual para el sistema de geocodificación inteligente

-- Agregar columnas si no existen
ALTER TABLE socios_catalogo 
ADD COLUMN IF NOT EXISTS latitud DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS longitud DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS ubicacion_manual BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS fecha_actualizacion_coords TIMESTAMP WITH TIME ZONE;

-- Crear índice para búsquedas por coordenadas
CREATE INDEX IF NOT EXISTS idx_socios_catalogo_coords 
ON socios_catalogo(latitud, longitud) 
WHERE latitud IS NOT NULL AND longitud IS NOT NULL;

-- Crear índice para búsquedas de coordenadas manuales
CREATE INDEX IF NOT EXISTS idx_socios_catalogo_ubicacion_manual 
ON socios_catalogo(ubicacion_manual) 
WHERE ubicacion_manual = TRUE;

-- Comentarios
COMMENT ON COLUMN socios_catalogo.latitud IS 'Latitud WGS84 del socio/cliente';
COMMENT ON COLUMN socios_catalogo.longitud IS 'Longitud WGS84 del socio/cliente';
COMMENT ON COLUMN socios_catalogo.ubicacion_manual IS 'TRUE si el admin reubicó el pin manualmente';
COMMENT ON COLUMN socios_catalogo.fecha_actualizacion_coords IS 'Última actualización de coordenadas';
