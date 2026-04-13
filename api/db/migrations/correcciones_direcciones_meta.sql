-- Metadatos y contador de uso para correcciones_direcciones (Neon / migración manual).
-- made by leavera77

ALTER TABLE correcciones_direcciones ADD COLUMN IF NOT EXISTS veces_usado INTEGER NOT NULL DEFAULT 0;
ALTER TABLE correcciones_direcciones ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE correcciones_direcciones ADD COLUMN IF NOT EXISTS corregido_por INTEGER;
ALTER TABLE correcciones_direcciones ADD COLUMN IF NOT EXISTS corregido_en TIMESTAMPTZ;

UPDATE correcciones_direcciones SET veces_usado = 0 WHERE veces_usado IS NULL;
