-- Catálogo de transformadores (pestaña admin Subestaciones). Un registro por trafo.
-- Ejecutar en Neon (multitenant en public).

CREATE TABLE IF NOT EXISTS subestaciones_catalogo (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES clientes (id) ON DELETE CASCADE,
  codigo VARCHAR(80) NOT NULL,
  nombre VARCHAR(200),
  subestacion VARCHAR(200),
  distribuidor_codigo VARCHAR(50),
  capacidad_kva INTEGER NOT NULL DEFAULT 0,
  clientes_conectados INTEGER NOT NULL DEFAULT 0,
  barrio VARCHAR(200),
  alimentador VARCHAR(200),
  localidad VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_subestaciones_catalogo_tenant_codigo UNIQUE (tenant_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_subestaciones_catalogo_tenant ON subestaciones_catalogo (tenant_id);
CREATE INDEX IF NOT EXISTS idx_subestaciones_catalogo_dist ON subestaciones_catalogo (tenant_id, distribuidor_codigo);

COMMENT ON TABLE subestaciones_catalogo IS 'Carga admin Excel: transformadores para pedidos manuales y operativa.';
