-- Derivación operativa a terceros (admin): el reclamo queda fuera de la operación del tenant.
-- Ejecutar en Neon (o Postgres del tenant) cuando uses POST /api/pedidos/:id/derivar-externo.
-- Auditoría: no se borra el pedido; se marcan flags y se guarda snapshot del mensaje.

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS derivado_externo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS derivado_a varchar(64),
  ADD COLUMN IF NOT EXISTS derivado_destino_nombre varchar(200),
  ADD COLUMN IF NOT EXISTS fecha_derivacion timestamptz,
  ADD COLUMN IF NOT EXISTS usuario_derivacion_id integer,
  ADD COLUMN IF NOT EXISTS derivacion_nota text,
  ADD COLUMN IF NOT EXISTS derivacion_mensaje_snapshot text;

COMMENT ON COLUMN pedidos.derivado_externo IS 'True cuando el tenant derivó el reclamo a otra empresa; excluir de operativa por defecto en UI/API.';
COMMENT ON COLUMN pedidos.derivado_a IS 'Clave destino (ej. empresa_gas_natural, empresa_internet).';
COMMENT ON COLUMN pedidos.derivacion_mensaje_snapshot IS 'Texto enviado o generado para auditoría (WhatsApp).';
