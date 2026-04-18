-- Banner admin: persiste cierre por pedido (no reaparece tras F5 / otro dispositivo).
-- Ejecutar en Neon cuando se despliegue la API correspondiente.

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS banner_calificacion_cerrado BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN pedidos.banner_calificacion_cerrado IS 'Admin cerró el aviso de opinión baja para este pedido.';
