-- Descargo / respuesta de la empresa ante valoración WhatsApp del cliente
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS opinion_descargo_empresa TEXT;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS fecha_descargo_empresa TIMESTAMPTZ;
