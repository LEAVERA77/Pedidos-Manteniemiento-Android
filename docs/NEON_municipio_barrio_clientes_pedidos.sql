-- =============================================================
-- GestorNova — Barrio (municipio / metadatos tenant) en clientes
-- y barrio por pedido (KPIs, mapas, WhatsApp).
-- Ejecutar en Neon (PostgreSQL) una vez por entorno.
-- =============================================================

BEGIN;

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS barrio TEXT;

COMMENT ON COLUMN clientes.barrio IS 'Opcional: referencia de barrio/sede para el tenant (SaaS). Distinto del barrio en cada pedido.';

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS barrio TEXT;

COMMENT ON COLUMN pedidos.barrio IS 'Barrio del reclamo (municipios). Cooperativas eléctricas siguen usando distribuidor/trafo; agua usa distribuidor como ramal.';

-- Multitenant: el índice siguiente requiere tenant_id. Si tu BD aún no la tiene (solo pedidos mono-tenant), se agrega aquí.
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_pedidos_tenant ON pedidos (tenant_id);

CREATE INDEX IF NOT EXISTS idx_pedidos_tenant_barrio_fecha
  ON pedidos (tenant_id, barrio, fecha_creacion DESC)
  WHERE barrio IS NOT NULL AND TRIM(barrio) <> '';

COMMIT;
