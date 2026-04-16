-- Métricas de broadcast + hardening de lookup/recordatorios.
-- made by leavera77

ALTER TABLE comunicaciones_envios
  ADD COLUMN IF NOT EXISTS duracion_ms INTEGER,
  ADD COLUMN IF NOT EXISTS reintentos_total INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS errores_detalle JSONB;

ALTER TABLE avisos_comunitarios
  ADD COLUMN IF NOT EXISTS duracion_ms INTEGER,
  ADD COLUMN IF NOT EXISTS reintentos_total INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS errores_detalle JSONB;

CREATE INDEX IF NOT EXISTS idx_recordatorios_antispam
  ON recordatorios_reclamos (tenant_id, pedido_id, telefono_usuario, fecha_solicitud DESC);

CREATE INDEX IF NOT EXISTS idx_pedidos_identificador_digits
  ON pedidos (tenant_id, business_type, (regexp_replace(COALESCE(identificador, ''), '\D', '', 'g')));

CREATE INDEX IF NOT EXISTS idx_pedidos_nismedidor_digits
  ON pedidos (tenant_id, business_type, (regexp_replace(COALESCE(nis_medidor, ''), '\D', '', 'g')));
