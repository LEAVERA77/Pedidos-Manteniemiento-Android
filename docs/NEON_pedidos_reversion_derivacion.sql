-- Auditoría al volver un pedido de «Derivado externo» a «Pendiente» (admin).
-- Ejecutar en Neon cuando uses PUT /api/pedidos/:id con estado Pendiente desde Derivado externo.
-- No borra derivado_a / fecha_derivacion / usuario_derivacion_id / etc.; solo marca reversión.

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS fecha_reversion_pendiente timestamptz,
  ADD COLUMN IF NOT EXISTS usuario_reversion_id integer;

COMMENT ON COLUMN pedidos.fecha_reversion_pendiente IS 'Momento en que un administrador pasó el pedido de Derivado externo a Pendiente.';
COMMENT ON COLUMN pedidos.usuario_reversion_id IS 'Usuario admin que ejecutó la vuelta a Pendiente.';
