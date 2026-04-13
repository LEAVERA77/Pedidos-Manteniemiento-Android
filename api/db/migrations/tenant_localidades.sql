-- Catálogo opcional por tenant para validar localidad en el bot WhatsApp y acotar bbox en geocodificación.
-- Ejecutar en Neon tras deploy. made by leavera77

CREATE TABLE IF NOT EXISTS tenant_localidades (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  nombre TEXT NOT NULL,
  nombre_normalizado TEXT NOT NULL,
  provincia TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  bounding_box JSONB,
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_tenant_localidad_norm UNIQUE (tenant_id, nombre_normalizado)
);

CREATE INDEX IF NOT EXISTS idx_tenant_localidades_tenant ON tenant_localidades (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_localidades_tenant_activo ON tenant_localidades (tenant_id) WHERE activo IS NOT FALSE;

COMMENT ON TABLE tenant_localidades IS 'Localidades permitidas / metadatos (bbox) por tenant — WhatsApp + pipeline. made by leavera77';

-- Ejemplo (ajustar tenant_id y ejecutar a mano si aplica):
-- INSERT INTO tenant_localidades (tenant_id, nombre, nombre_normalizado, provincia, lat, lng, bounding_box)
-- VALUES (
--   1,
--   'Cerrito',
--   'cerrito',
--   'Entre Ríos',
--   -31.5827461,
--   -60.0721595,
--   '{"minLat": -31.62, "maxLat": -31.55, "minLon": -60.10, "maxLon": -60.02}'::jsonb
-- )
-- ON CONFLICT (tenant_id, nombre_normalizado) DO NOTHING;
