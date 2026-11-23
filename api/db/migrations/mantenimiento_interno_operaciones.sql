-- Control de reintentos de altas desde Android offline. Aplicar antes de habilitar la función.
-- Conserva la identidad de la operación incluso si se interrumpe la respuesta HTTP.
CREATE TABLE IF NOT EXISTS mantenimiento_interno_operaciones (
  tenant_id INTEGER NOT NULL,
  usuario_id INTEGER NOT NULL,
  operacion_id UUID NOT NULL,
  contenido_hash CHAR(64) NOT NULL,
  pedido_id INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, usuario_id, operacion_id)
);
