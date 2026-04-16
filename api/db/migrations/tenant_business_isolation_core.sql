-- Aislamiento completo por (tenant_id, business_type)
-- made by leavera77

CREATE TABLE IF NOT EXISTS tenant_businesses (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  business_type VARCHAR(50) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, business_type)
);

CREATE TABLE IF NOT EXISTS tenant_active_business (
  tenant_id INTEGER PRIMARY KEY REFERENCES clientes(id) ON DELETE CASCADE,
  active_business_type VARCHAR(50) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backfill desde clientes.tipo / clientes.active_business_type (si existe)
INSERT INTO tenant_businesses (tenant_id, business_type, active)
SELECT c.id,
       CASE
         WHEN LOWER(COALESCE(c.active_business_type, '')) IN ('electricidad','agua','municipio')
           THEN LOWER(c.active_business_type)
         WHEN c.tipo IN ('cooperativa_agua') THEN 'agua'
         WHEN c.tipo IN ('municipio') THEN 'municipio'
         ELSE 'electricidad'
       END,
       TRUE
FROM clientes c
ON CONFLICT (tenant_id, business_type) DO NOTHING;

INSERT INTO tenant_active_business (tenant_id, active_business_type, updated_at)
SELECT c.id,
       CASE
         WHEN LOWER(COALESCE(c.active_business_type, '')) IN ('electricidad','agua','municipio')
           THEN LOWER(c.active_business_type)
         WHEN c.tipo IN ('cooperativa_agua') THEN 'agua'
         WHEN c.tipo IN ('municipio') THEN 'municipio'
         ELSE 'electricidad'
       END,
       NOW()
FROM clientes c
ON CONFLICT (tenant_id)
DO UPDATE SET active_business_type = EXCLUDED.active_business_type,
              updated_at = NOW();

CREATE INDEX IF NOT EXISTS idx_tenant_businesses_tenant_active
  ON tenant_businesses (tenant_id, active, business_type);
