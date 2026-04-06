-- Ampliación: transformadores con distribuidor + alimentador; registro de afectación por suma de trafos.
-- Ejecutar en Neon después de docs/NEON_clientes_afectados_infra.sql

ALTER TABLE infra_transformadores
    ADD COLUMN IF NOT EXISTS distribuidor_id INTEGER REFERENCES distribuidores (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS alimentador VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_infra_trafo_distrib
    ON infra_transformadores (tenant_id, distribuidor_id)
    WHERE activo = TRUE;

CREATE INDEX IF NOT EXISTS idx_infra_trafo_alim
    ON infra_transformadores (tenant_id, distribuidor_id, alimentador)
    WHERE activo = TRUE AND alimentador IS NOT NULL AND TRIM(alimentador) <> '';

ALTER TABLE clientes_afectados_log
    ADD COLUMN IF NOT EXISTS distribuidor_id INTEGER REFERENCES distribuidores (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS alimentador VARCHAR(100);

ALTER TABLE clientes_afectados_log DROP CONSTRAINT IF EXISTS chk_metodo_afect;
ALTER TABLE clientes_afectados_log ADD CONSTRAINT chk_metodo_afect CHECK (
    metodo IN ('transformador', 'zona', 'distribuidor', 'alimentador', 'rango', 'manual')
);
