-- KPI snapshots separados por línea de negocio (electricidad | agua | municipio).
-- Ejecutar en Neon si ya existe docs/NEON_kpi_snapshots.sql.

BEGIN;

ALTER TABLE kpi_snapshots ADD COLUMN IF NOT EXISTS business_type VARCHAR(32);

UPDATE kpi_snapshots SET business_type = COALESCE(NULLIF(TRIM(business_type), ''), 'electricidad')
WHERE business_type IS NULL;

DROP INDEX IF EXISTS uq_kpi_snapshots_tenant_metrica_periodo;

CREATE UNIQUE INDEX IF NOT EXISTS uq_kpi_snapshots_tenant_line_metrica_periodo
    ON kpi_snapshots (tenant_id, business_type, metrica, periodo_inicio, periodo_fin);

COMMENT ON COLUMN kpi_snapshots.business_type IS 'Línea operativa (electricidad, agua, municipio); alineado con pedidos.business_type';

COMMIT;
