-- Auditoría de cierre de incidencias (fecha y usuario en servidor).
-- Ejecutar en Neon tras desplegar API que usa estos campos en PUT /api/incidencias.

ALTER TABLE incidencias ADD COLUMN IF NOT EXISTS fecha_cierre TIMESTAMPTZ;
ALTER TABLE incidencias ADD COLUMN IF NOT EXISTS usuario_cierre_id INTEGER REFERENCES usuarios(id);

CREATE INDEX IF NOT EXISTS idx_incidencias_fecha_cierre ON incidencias(fecha_cierre)
    WHERE fecha_cierre IS NOT NULL;

COMMENT ON COLUMN incidencias.fecha_cierre IS 'Momento en que la incidencia pasó a estado cerrada (primera vez).';
COMMENT ON COLUMN incidencias.usuario_cierre_id IS 'Usuario admin que cerró la incidencia (PUT estado cerrada).';

-- made by leavera77
