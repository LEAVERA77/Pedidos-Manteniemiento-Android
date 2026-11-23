-- Bajas por sesión de Baileys (la sesión puede ser compartida por varios tenants).
-- Aplicar manualmente antes de habilitar campañas Baileys. No borra bajas previas.
CREATE TABLE IF NOT EXISTS baileys_broadcast_opt_out (
  session_id TEXT NOT NULL,
  phone_digits TEXT NOT NULL CHECK (phone_digits ~ '^[0-9]{10,20}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, phone_digits)
);
COMMENT ON TABLE baileys_broadcast_opt_out IS 'Bajas voluntarias de avisos masivos para una sesión Baileys; no implica consentimiento de otros destinatarios.';

CREATE TABLE IF NOT EXISTS baileys_broadcast_safety_state (
  session_id TEXT PRIMARY KEY,
  paused BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
