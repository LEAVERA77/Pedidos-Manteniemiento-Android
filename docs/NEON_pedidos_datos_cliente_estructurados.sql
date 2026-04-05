-- Ejecutar una vez en Neon (SQL Editor) si aún no existen las columnas.
-- Separa datos del reclamante (WhatsApp / formulario) en lugar de un solo texto en cliente_direccion.

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_nombre VARCHAR(200);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_calle TEXT;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_numero_puerta VARCHAR(20);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_localidad TEXT;

COMMENT ON COLUMN pedidos.cliente_nombre IS 'Nombre y apellido del reclamante (p. ej. WhatsApp).';
COMMENT ON COLUMN pedidos.cliente_calle IS 'Calle declarada por el cliente.';
COMMENT ON COLUMN pedidos.cliente_numero_puerta IS 'Número de puerta / altura.';
COMMENT ON COLUMN pedidos.cliente_localidad IS 'Ciudad o localidad del reclamo.';
-- cliente_direccion: texto auxiliar (p. ej. reverse geocoding / referencia), no reemplaza los campos anteriores.
