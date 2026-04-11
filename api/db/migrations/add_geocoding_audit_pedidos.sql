-- Auditoría de modo de ubicación (re-geocodificación / política A)
-- made by leavera77
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS geocoding_audit JSONB;

COMMENT ON COLUMN pedidos.geocoding_audit IS 'JSON: fuente, modo (exacto_aprox|interpolado_via|localidad|tenant|region), at ISO';
