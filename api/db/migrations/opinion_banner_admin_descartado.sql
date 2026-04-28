-- Banner admin "opinión baja": si el admin cierra el aviso, no volver a mostrarlo (sobrevive a borrar caché del navegador).
-- Ejecutar en Neon (SQL Editor). Sin esto, solo aplica localStorage.

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS opinion_banner_admin_descartado BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN pedidos.opinion_banner_admin_descartado IS 'TRUE cuando el admin cerró el banner de calificación baja para este pedido; el listado SQL lo excluye.';

-- made by leavera77
