-- WhatsApp dedicado para notificaciones (panel admin usuarios). Distinto de telefono genérico si aplica.
-- made by leavera77

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefono_whatsapp VARCHAR(32);

COMMENT ON COLUMN usuarios.telefono_whatsapp IS 'E.164 preferido para WA (ej. +543434540250, sin 9 móvil tras 54).';
