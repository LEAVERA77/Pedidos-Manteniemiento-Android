-- Motivos de rechazo de foto / desestimación y flag de validación admin (Neon).
-- made by leavera77

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS motivo_rechazo_foto text;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS motivo_desestimacion text;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS foto_evidencia_validada boolean NOT NULL DEFAULT false;
