-- Infraestructura eléctrica por distribuidor (SAIDI/SAIFI denominadores).
-- Ejecutar en Neon (tenant compartido en public).

CREATE TABLE IF NOT EXISTS distribuidores_red (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES clientes (id) ON DELETE CASCADE,
  codigo VARCHAR(50) NOT NULL,
  nombre VARCHAR(200) NOT NULL,
  localidad VARCHAR(200),
  nivel_tension INTEGER NOT NULL DEFAULT 0,
  trafos INTEGER NOT NULL DEFAULT 0,
  kva INTEGER NOT NULL DEFAULT 0,
  clientes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_distribuidores_red_tenant_codigo UNIQUE (tenant_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_distribuidores_red_tenant ON distribuidores_red (tenant_id);

COMMENT ON TABLE distribuidores_red IS 'Carga admin Excel: trafos/KVA/clientes por código distribuidor para índices de confiabilidad.';
