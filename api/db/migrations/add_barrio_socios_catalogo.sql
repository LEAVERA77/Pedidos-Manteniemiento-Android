-- Agrega columna barrio a socios_catalogo para enriquecimiento desde Nominatim
-- made by leavera77
ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS barrio TEXT;
