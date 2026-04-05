-- Observaciones del cliente tras cierre de reclamo (WhatsApp). Idempotente.
-- La API también intenta crear la tabla al primer uso.

CREATE TABLE IF NOT EXISTS cliente_observaciones_cierre (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  pedido_id INTEGER NOT NULL,
  phone_canonical VARCHAR(40),
  texto TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cli_obs_cierre_pedido ON cliente_observaciones_cierre (pedido_id);
CREATE INDEX IF NOT EXISTS idx_cli_obs_cierre_tenant_created ON cliente_observaciones_cierre (tenant_id, created_at DESC);
