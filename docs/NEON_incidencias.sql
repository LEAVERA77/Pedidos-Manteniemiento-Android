-- Incidencias: agrupación de pedidos relacionados (todos los rubros).
-- Ejecutar en Neon (SQL Editor) antes de usar la API / UI.

CREATE TABLE IF NOT EXISTS incidencias (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES clientes(id),
    nombre VARCHAR(200),
    criterio_agrupacion VARCHAR(50),
    valor_criterio VARCHAR(200),
    fecha_creacion TIMESTAMPTZ DEFAULT NOW(),
    usuario_creador_id INTEGER REFERENCES usuarios(id),
    estado VARCHAR(30) DEFAULT 'abierta'
);

CREATE INDEX IF NOT EXISTS idx_incidencias_tenant ON incidencias(tenant_id);
CREATE INDEX IF NOT EXISTS idx_incidencias_estado ON incidencias(estado);

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS incidencia_id INTEGER REFERENCES incidencias(id);

CREATE INDEX IF NOT EXISTS idx_pedidos_incidencia ON pedidos(incidencia_id) WHERE incidencia_id IS NOT NULL;

COMMENT ON TABLE incidencias IS 'Agrupa reclamos relacionados bajo una misma incidencia operativa.';
COMMENT ON COLUMN pedidos.incidencia_id IS 'FK opcional a incidencias; varios pedidos pueden compartir incidencia.';

-- made by leavera77
