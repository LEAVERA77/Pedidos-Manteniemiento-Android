-- STOP / opt-in masivos, warm-up número Whapi y métricas de respuestas.
-- Ejecutar en Neon (public). Idempotente con IF NOT EXISTS.

ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS acepta_avisos BOOLEAN NOT NULL DEFAULT TRUE;
COMMENT ON COLUMN socios_catalogo.acepta_avisos IS 'FALSE = no recibir avisos masivos (STOP). Default TRUE. made by leavera77';

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS whapi_activated_at TIMESTAMPTZ;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS whapi_warmup_status VARCHAR(32) DEFAULT 'unknown';
COMMENT ON COLUMN clientes.whapi_activated_at IS 'Fecha de alta del número en Whapi (inicio warm-up ~10 días). made by leavera77';
COMMENT ON COLUMN clientes.whapi_warmup_status IS 'Estado operativo: unknown | pending | warming | warmed (informativo). made by leavera77';

CREATE TABLE IF NOT EXISTS broadcast_metrics (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL,
  mensajes_enviados INTEGER NOT NULL DEFAULT 0,
  respuestas_recibidas INTEGER NOT NULL DEFAULT 0,
  respuestas_stop INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_broadcast_metrics_tenant_date ON broadcast_metrics (tenant_id, metric_date DESC);

COMMENT ON TABLE broadcast_metrics IS 'Métricas diarias envíos masivos vs respuestas (ratio anti-spam Whapi). made by leavera77';
