-- Auditoría de calidad de coordenadas en socios_catalogo (marcar sospechosas, verificación).
-- made by leavera77

ALTER TABLE socios_catalogo
  ADD COLUMN IF NOT EXISTS coordenada_sospechosa BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS motivo_sospecha TEXT,
  ADD COLUMN IF NOT EXISTS fecha_sospecha TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS coordenada_verificada BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fecha_verificacion TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verificada_por INTEGER;

CREATE INDEX IF NOT EXISTS idx_socios_catalogo_coords_sospechosas
  ON socios_catalogo (coordenada_sospechosa)
  WHERE coordenada_sospechosa = TRUE;

COMMENT ON COLUMN socios_catalogo.coordenada_sospechosa IS 'TRUE si el pin fue marcado como dudoso (admin o script). made by leavera77';
