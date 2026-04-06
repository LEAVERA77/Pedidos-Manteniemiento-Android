-- Localidad por distribuidor (resumen infra / listados).
-- Ejecutar en Neon una vez; idempotente.

ALTER TABLE distribuidores
    ADD COLUMN IF NOT EXISTS localidad TEXT;

COMMENT ON COLUMN distribuidores.localidad IS 'Localidad o zona geográfica del distribuidor (opcional).';
