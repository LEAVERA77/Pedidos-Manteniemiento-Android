-- Socios: asegurar calle y numero (sin columna domicilio).
-- Idempotente con IF NOT EXISTS.

ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS calle TEXT;
ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS numero TEXT;

-- Solo si todavía existe domicilio y querés migrar antes de borrarla:
-- UPDATE socios_catalogo SET calle = TRIM(domicilio)
-- WHERE (calle IS NULL OR TRIM(COALESCE(calle,'')) = '')
--   AND domicilio IS NOT NULL AND TRIM(COALESCE(domicilio,'')) <> '';
-- ALTER TABLE socios_catalogo DROP COLUMN IF EXISTS domicilio;
