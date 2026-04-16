-- Multi-negocio por tenant: filtrado por business_type sin borrar datos.
-- Ejecutar en Neon. Reiniciar API tras aplicar.
-- made by leavera77

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS active_business_type VARCHAR(50);

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS business_type VARCHAR(50);
ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS business_type VARCHAR(50);

-- NULL = visible en todas las vistas (admin/técnico compartido)
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS business_type VARCHAR(50);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'kpi_snapshots'
  ) THEN
    ALTER TABLE kpi_snapshots ADD COLUMN IF NOT EXISTS business_type VARCHAR(50);
  END IF;
END $$;

UPDATE clientes c
SET active_business_type = CASE
  WHEN lower(trim(c.tipo::text)) IN ('cooperativa_agua') THEN 'agua'
  WHEN lower(trim(c.tipo::text)) IN ('municipio') THEN 'municipio'
  ELSE 'electricidad'
END
WHERE c.active_business_type IS NULL OR trim(c.active_business_type::text) = '';

UPDATE pedidos p
SET business_type = CASE
  WHEN lower(trim(cl.tipo::text)) IN ('cooperativa_agua') THEN 'agua'
  WHEN lower(trim(cl.tipo::text)) IN ('municipio') THEN 'municipio'
  ELSE 'electricidad'
END
FROM clientes cl
WHERE p.tenant_id = cl.id
  AND (p.business_type IS NULL OR trim(p.business_type::text) = '');

UPDATE socios_catalogo s
SET business_type = CASE
  WHEN lower(trim(cl.tipo::text)) IN ('cooperativa_agua') THEN 'agua'
  WHEN lower(trim(cl.tipo::text)) IN ('municipio') THEN 'municipio'
  ELSE 'electricidad'
END
FROM clientes cl
WHERE s.tenant_id = cl.id
  AND (s.business_type IS NULL OR trim(s.business_type::text) = '');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'kpi_snapshots'
  ) THEN
    UPDATE kpi_snapshots k
    SET business_type = CASE
      WHEN lower(trim(cl.tipo::text)) IN ('cooperativa_agua') THEN 'agua'
      WHEN lower(trim(cl.tipo::text)) IN ('municipio') THEN 'municipio'
      ELSE 'electricidad'
    END
    FROM clientes cl
    WHERE k.tenant_id = cl.id
      AND (k.business_type IS NULL OR trim(k.business_type::text) = '');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pedidos_tenant_business
  ON pedidos (tenant_id, business_type)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_socios_tenant_business
  ON socios_catalogo (tenant_id, business_type);

CREATE TABLE IF NOT EXISTS comunicaciones_envios (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  business_type VARCHAR(50) NOT NULL,
  canal VARCHAR(32) NOT NULL DEFAULT 'whatsapp',
  titulo TEXT,
  cuerpo TEXT NOT NULL,
  imagen_url TEXT,
  botones_json JSONB,
  destinatarios_total INTEGER NOT NULL DEFAULT 0,
  enviados_ok INTEGER NOT NULL DEFAULT 0,
  enviados_error INTEGER NOT NULL DEFAULT 0,
  meta JSONB,
  creado_por_usuario_id INTEGER REFERENCES usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cortes_programados (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  business_type VARCHAR(50) NOT NULL,
  zona_afectada TEXT,
  fecha_inicio TIMESTAMPTZ,
  fecha_fin TIMESTAMPTZ,
  motivo VARCHAR(120),
  mensaje_enviado BOOLEAN NOT NULL DEFAULT FALSE,
  mensaje_texto TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
