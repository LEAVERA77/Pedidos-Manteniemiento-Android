-- Columnas libres del Excel de socios (JSON). made by leavera77
-- Aplicar en Neon sobre public.socios_catalogo.

ALTER TABLE socios_catalogo
  ADD COLUMN IF NOT EXISTS datos_extra JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN socios_catalogo.datos_extra IS 'Encabezados del Excel no mapeados a columnas fijas; merge en import/upsert.';
