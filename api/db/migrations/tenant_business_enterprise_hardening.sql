-- Hardening enterprise: constraints + auditoría de cambios de negocio.
-- made by leavera77

CREATE TABLE IF NOT EXISTS tenant_business_audit (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  previous_business_type VARCHAR(50),
  new_business_type VARCHAR(50) NOT NULL,
  changed_by_user_id INTEGER REFERENCES usuarios(id),
  source VARCHAR(40) NOT NULL DEFAULT 'switch',
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_business_audit_tenant_time
  ON tenant_business_audit (tenant_id, changed_at DESC);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='pedidos' AND column_name='business_type'
  ) THEN
    UPDATE pedidos p
    SET business_type = COALESCE(NULLIF(TRIM(p.business_type), ''), c.active_business_type, 'electricidad')
    FROM clientes c
    WHERE c.id = p.tenant_id
      AND (p.business_type IS NULL OR TRIM(p.business_type) = '');
    ALTER TABLE pedidos ALTER COLUMN business_type SET NOT NULL;
    ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS chk_pedidos_business_type_valid;
    ALTER TABLE pedidos ADD CONSTRAINT chk_pedidos_business_type_valid
      CHECK (business_type IN ('electricidad','agua','municipio'));
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='socios_catalogo' AND column_name='business_type'
  ) THEN
    UPDATE socios_catalogo s
    SET business_type = COALESCE(NULLIF(TRIM(s.business_type), ''), c.active_business_type, 'electricidad')
    FROM clientes c
    WHERE c.id = s.tenant_id
      AND (s.business_type IS NULL OR TRIM(s.business_type) = '');
    ALTER TABLE socios_catalogo ALTER COLUMN business_type SET NOT NULL;
    ALTER TABLE socios_catalogo DROP CONSTRAINT IF EXISTS chk_socios_business_type_valid;
    ALTER TABLE socios_catalogo ADD CONSTRAINT chk_socios_business_type_valid
      CHECK (business_type IN ('electricidad','agua','municipio'));
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='estadisticas' AND column_name='business_type'
  ) THEN
    UPDATE estadisticas e
    SET business_type = COALESCE(NULLIF(TRIM(e.business_type), ''), c.active_business_type, 'electricidad')
    FROM clientes c
    WHERE c.id = e.tenant_id
      AND (e.business_type IS NULL OR TRIM(e.business_type) = '');
    ALTER TABLE estadisticas ALTER COLUMN business_type SET NOT NULL;
    ALTER TABLE estadisticas DROP CONSTRAINT IF EXISTS chk_estadisticas_business_type_valid;
    ALTER TABLE estadisticas ADD CONSTRAINT chk_estadisticas_business_type_valid
      CHECK (business_type IN ('electricidad','agua','municipio'));
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='kpi_snapshots' AND column_name='business_type'
  ) THEN
    UPDATE kpi_snapshots k
    SET business_type = COALESCE(NULLIF(TRIM(k.business_type), ''), c.active_business_type, 'electricidad')
    FROM clientes c
    WHERE c.id = k.tenant_id
      AND (k.business_type IS NULL OR TRIM(k.business_type) = '');
    ALTER TABLE kpi_snapshots ALTER COLUMN business_type SET NOT NULL;
    ALTER TABLE kpi_snapshots DROP CONSTRAINT IF EXISTS chk_kpi_snapshots_business_type_valid;
    ALTER TABLE kpi_snapshots ADD CONSTRAINT chk_kpi_snapshots_business_type_valid
      CHECK (business_type IN ('electricidad','agua','municipio'));
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='usuarios' AND column_name='business_type'
  ) THEN
    ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS chk_usuarios_business_type_role;
    ALTER TABLE usuarios ADD CONSTRAINT chk_usuarios_business_type_role
      CHECK (
        (rol = 'admin' AND (business_type IS NULL OR business_type IN ('electricidad','agua','municipio')))
        OR
        (rol <> 'admin' AND business_type IN ('electricidad','agua','municipio'))
      );
  END IF;
END $$;
