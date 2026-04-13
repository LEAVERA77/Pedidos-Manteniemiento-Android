-- Overrides manuales de geocodificación (lat/lng) por domicilio normalizado.
-- Ejecutar en Neon (SQL editor) o vía migración del equipo.
-- made by leavera77

CREATE TABLE IF NOT EXISTS correcciones_direcciones (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER,
  calle_norm TEXT NOT NULL,
  numero_norm TEXT NOT NULL DEFAULT '',
  localidad_norm TEXT NOT NULL,
  provincia_norm TEXT NOT NULL DEFAULT '',
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  nota TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_corr_dir_global ON correcciones_direcciones (calle_norm, numero_norm, localidad_norm, provincia_norm)
  WHERE tenant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_corr_dir_tenant ON correcciones_direcciones (tenant_id, calle_norm, numero_norm, localidad_norm, provincia_norm)
  WHERE tenant_id IS NOT NULL;

-- María Grande — Avenida Argentina 1162 (Nominatim suele devolver punto genérico lejos del frente real)
INSERT INTO correcciones_direcciones (tenant_id, calle_norm, numero_norm, localidad_norm, provincia_norm, lat, lng, nota)
SELECT NULL, 'avenida argentina', '1162', 'maria grande', 'entre rios', -31.659899, -59.914584,
       'Referencia operativa; OSM sin housenumber fiable en esta cuadra.'
WHERE NOT EXISTS (
  SELECT 1 FROM correcciones_direcciones c
  WHERE c.tenant_id IS NULL
    AND c.calle_norm = 'avenida argentina'
    AND c.numero_norm = '1162'
    AND c.localidad_norm = 'maria grande'
    AND c.provincia_norm = 'entre rios'
);
