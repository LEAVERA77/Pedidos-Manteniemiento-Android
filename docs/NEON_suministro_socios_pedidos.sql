-- Cooperativa eléctrica: catálogo de socios (padrón) y datos guardados en cada reclamo.
-- Ejecutar en Neon (SQL Editor) o vía cliente psql. Idempotente (IF NOT EXISTS).

ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS tipo_conexion TEXT;
ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS fases TEXT;

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS suministro_tipo_conexion TEXT;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS suministro_fases TEXT;
