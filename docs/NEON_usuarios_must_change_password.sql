-- Obligatorio para: clave provisional de técnico + cambio forzado en Android
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
