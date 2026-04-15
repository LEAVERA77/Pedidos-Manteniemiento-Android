-- Estado global ON/OFF del bot de reclamos por WhatsApp (una fila, no multitenant).
-- Comandos activar/desactivar vía WhatsApp solo para teléfonos en WHATSAPP_BOT_MASTER_PHONE(S).

CREATE TABLE IF NOT EXISTS global_bot_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  bot_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_phone TEXT,
  CONSTRAINT global_bot_state_single CHECK (id = 1)
);

INSERT INTO global_bot_state (id, bot_active)
VALUES (1, TRUE)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE global_bot_state IS 'Interruptor persistente del bot WA (reclamos). Complementa WHATSAPP_BOT_ENABLED en env. made by leavera77';
