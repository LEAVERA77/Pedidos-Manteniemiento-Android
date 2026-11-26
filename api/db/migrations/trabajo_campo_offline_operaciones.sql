-- Dedupe de operaciones offline de campo. Aplicar solo tras revisar y probar la migración.
CREATE TABLE IF NOT EXISTS trabajo_campo_offline_operaciones (
  tenant_id INTEGER NOT NULL,
  usuario_id INTEGER NOT NULL,
  operacion_id UUID NOT NULL,
  pedido_id INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
  contenido_hash CHAR(64) NOT NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, usuario_id, operacion_id)
);
