-- Trafo (transformador del catálogo de socios) cuando el reclamo tiene NIS/medidor resuelto en socios_catalogo.
-- Distribuidor y trafo quedan vacíos si el cliente solo cargó nombre y dirección.
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS trafo TEXT;

COMMENT ON COLUMN pedidos.trafo IS 'Transformador / trafo desde socios_catalogo al validar NIS; vacío si no hay identificador de suministro.';

-- Permite pedidos sin distribuidor asignado (solo nombre/dirección).
ALTER TABLE pedidos ALTER COLUMN distribuidor DROP NOT NULL;
