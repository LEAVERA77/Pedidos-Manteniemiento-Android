-- Operaciones de geocodificación WhatsApp (alta pre-INSERT): pasos incrementales para panel admin / polling.
-- TTL: limpiar filas antiguas con job manual o DELETE WHERE started_at < now() - interval '30 days';
-- made by leavera77

CREATE TABLE IF NOT EXISTS geocod_wa_operaciones (
  id BIGSERIAL PRIMARY KEY,
  correlation_id TEXT NOT NULL UNIQUE,
  tenant_id INTEGER NOT NULL,
  telefono_masked TEXT,
  estado TEXT NOT NULL DEFAULT 'running' CHECK (estado IN ('running', 'ok', 'error')),
  pasos JSONB NOT NULL DEFAULT '[]'::jsonb,
  mensaje_error TEXT,
  meta JSONB,
  pedido_id INTEGER,
  numero_pedido TEXT,
  fuente_final TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_geocod_wa_tenant_started ON geocod_wa_operaciones (tenant_id, started_at DESC);

COMMENT ON TABLE geocod_wa_operaciones IS 'Telemetría alta WhatsApp: pipeline geocod antes/durante INSERT; polling admin. made by leavera77';
