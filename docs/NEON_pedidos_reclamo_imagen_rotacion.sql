-- Rotación persistida de la vista «Imagen del reclamo» (panel / modal detalle).
-- Ejecutar una vez en Neon (SQL Editor) antes de usar «Guardar rotación en BD».

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS reclamo_imagen_rotacion SMALLINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN pedidos.reclamo_imagen_rotacion IS 'Grados 0-359, rotación horaria de la imagen del reclamo en el visor (PATCH /api/pedidos/:id/reclamo-imagen-rotacion).';

-- made by leavera77
