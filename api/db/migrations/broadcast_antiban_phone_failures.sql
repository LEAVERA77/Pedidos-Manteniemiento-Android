-- Fallos consecutivos por número en masivos → pausa automática (anti-baneo / lista sucia).
-- Ejecutar en Neon (public).

CREATE TABLE IF NOT EXISTS broadcast_phone_failures (
  tenant_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  phone_digits TEXT NOT NULL,
  consecutive_fails INTEGER NOT NULL DEFAULT 0,
  last_fail_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, phone_digits)
);

CREATE INDEX IF NOT EXISTS idx_broadcast_phone_failures_tenant_fails
  ON broadcast_phone_failures (tenant_id, consecutive_fails DESC);

COMMENT ON TABLE broadcast_phone_failures IS 'Conteo de fallos de envío WA masivo por número; excluir del próximo masivo al superar umbral. made by leavera77';
