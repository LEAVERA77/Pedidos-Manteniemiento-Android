-- Auditoría operativa (cambios de estado en pedidos).
-- Ejecutar en Neon si la API aún no creó la tabla automáticamente.
-- made by leavera77

CREATE TABLE IF NOT EXISTS operacion_audit_log (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  usuario_id INTEGER,
  pedido_id INTEGER,
  accion VARCHAR(64) NOT NULL,
  detalle JSONB,
  estado_anterior VARCHAR(64),
  estado_nuevo VARCHAR(64),
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operacion_audit_tenant_created
  ON operacion_audit_log (tenant_id, created_at DESC);
