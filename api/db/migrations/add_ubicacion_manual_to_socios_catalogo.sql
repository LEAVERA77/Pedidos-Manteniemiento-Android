-- Migración: Agregar columna ubicacion_manual a socios_catalogo
-- Esta columna marca coordenadas corregidas manualmente que NO deben sobrescribirse
-- made by leavera77

-- 1. Agregar columna si no existe
ALTER TABLE socios_catalogo 
ADD COLUMN IF NOT EXISTS ubicacion_manual BOOLEAN DEFAULT FALSE;

-- 2. Crear índice para mejorar queries que filtran por ubicacion_manual
CREATE INDEX IF NOT EXISTS idx_socios_catalogo_ubicacion_manual 
ON socios_catalogo (ubicacion_manual) 
WHERE ubicacion_manual = TRUE;

-- 3. Agregar columna fecha_correccion_coords para auditoría
ALTER TABLE socios_catalogo 
ADD COLUMN IF NOT EXISTS fecha_correccion_coords TIMESTAMP WITH TIME ZONE;

-- 4. Comentarios para documentación
COMMENT ON COLUMN socios_catalogo.ubicacion_manual IS 
'TRUE si las coordenadas fueron corregidas manualmente por el administrador. Estas coordenadas tienen prioridad absoluta y NO deben sobrescribirse en importaciones de Excel.';

COMMENT ON COLUMN socios_catalogo.fecha_correccion_coords IS 
'Timestamp de la última corrección manual de coordenadas (NULL si nunca fueron corregidas).';

-- 5. Verificar resultado
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'socios_catalogo' 
AND column_name IN ('ubicacion_manual', 'fecha_correccion_coords', 'latitud', 'longitud', 'lat', 'lng')
ORDER BY column_name;
