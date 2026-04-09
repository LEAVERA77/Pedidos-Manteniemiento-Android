-- Opcional: columnas separadas NIS / medidor en socios_catalogo (la app también hace ADD COLUMN IF NOT EXISTS al iniciar).
ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS nis TEXT;
ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS medidor TEXT;
