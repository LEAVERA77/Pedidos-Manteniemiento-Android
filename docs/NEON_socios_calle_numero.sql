-- Socios: columnas calle y numero (Neon). Ejecutar si la app ya tenía solo domicilio.
-- Idempotente con IF NOT EXISTS.

ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS calle TEXT;
ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS numero TEXT;

UPDATE socios_catalogo SET calle = TRIM(domicilio)
WHERE (calle IS NULL OR TRIM(COALESCE(calle,'')) = '')
  AND domicilio IS NOT NULL AND TRIM(COALESCE(domicilio,'')) <> '';
