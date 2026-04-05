-- ============================================================
-- Nexxo — Operación en campo, NIS, firma, materiales, socios
-- Ejecutar en Neon (SQL Editor) una vez.
-- Compatible con app web (SQL directo) y Android WebView.
-- ============================================================

-- Pedidos: identidad del socio, asignación, prueba de cierre, seguridad
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS nis_medidor TEXT;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS tecnico_asignado_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS fecha_asignacion TIMESTAMPTZ;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS firma_cliente TEXT;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS checklist_seguridad TEXT;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS usuario_creador_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pedidos_nis ON pedidos (nis_medidor);
CREATE INDEX IF NOT EXISTS idx_pedidos_tecnico_asignado ON pedidos (tecnico_asignado_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_fecha_creacion ON pedidos (fecha_creacion DESC);

COMMENT ON COLUMN pedidos.nis_medidor IS 'NIS o n° medidor del socio (trazabilidad y facturación)';
COMMENT ON COLUMN pedidos.firma_cliente IS 'Imagen base64 (PNG) firma del socio al cierre';
COMMENT ON COLUMN pedidos.checklist_seguridad IS 'JSON: {epp,corte,senalizacion} cumplimiento EPPS/corte';

-- Catálogo de socios (importación Excel admin)
CREATE TABLE IF NOT EXISTS socios_catalogo (
    id                  SERIAL PRIMARY KEY,
    nis_medidor         TEXT NOT NULL,
    nombre              TEXT,
    calle               TEXT,
    numero              TEXT,
    telefono            TEXT,
    distribuidor_codigo TEXT,
    activo              BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (nis_medidor)
);

CREATE INDEX IF NOT EXISTS idx_socios_activo ON socios_catalogo (activo);

ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS localidad TEXT;
ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS tipo_tarifa TEXT;
ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS urbano_rural TEXT;
ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS transformador TEXT;
ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS calle TEXT;
ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS numero TEXT;

-- Si existía la columna antigua domicilio, copiar a calle y eliminar (ejecutar una vez si aplica)
-- UPDATE socios_catalogo SET calle = TRIM(domicilio) WHERE calle IS NULL AND domicilio IS NOT NULL;
-- ALTER TABLE socios_catalogo DROP COLUMN IF EXISTS domicilio;

-- Opcional: pedidos con técnico ya asignados pasan a estado coherente con la app
-- UPDATE pedidos SET estado = 'Asignado'
-- WHERE tecnico_asignado_id IS NOT NULL AND estado = 'Pendiente';

-- Consumo de materiales por pedido
CREATE TABLE IF NOT EXISTS pedido_materiales (
    id              SERIAL PRIMARY KEY,
    pedido_id       INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    descripcion     TEXT NOT NULL,
    cantidad        NUMERIC,
    unidad          TEXT,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pedido_materiales_pedido ON pedido_materiales (pedido_id);
