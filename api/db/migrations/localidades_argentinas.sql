-- Catálogo nacional de localidades (Georef datos.gob.ar). Poblar con generate-localidades-argentinas-sql.mjs
-- made by leavera77

CREATE TABLE IF NOT EXISTS localidades_argentinas (
  id SERIAL PRIMARY KEY,
  georef_id TEXT UNIQUE,
  nombre VARCHAR(200) NOT NULL,
  nombre_normalizado VARCHAR(200) NOT NULL,
  provincia VARCHAR(120) NOT NULL,
  provincia_normalizado VARCHAR(120) NOT NULL,
  provincia_id INTEGER,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  codigo_postal VARCHAR(12),
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_localidades_arg_nn ON localidades_argentinas (nombre_normalizado);
CREATE INDEX IF NOT EXISTS idx_localidades_arg_nn_prov ON localidades_argentinas (nombre_normalizado, provincia_normalizado);
CREATE INDEX IF NOT EXISTS idx_localidades_arg_prov ON localidades_argentinas (provincia_normalizado);

COMMENT ON TABLE localidades_argentinas IS 'Localidades AR (Georef). made by leavera77';
