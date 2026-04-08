-- Solicitud de derivación a terceros desde el técnico (cola de aprobación admin).
-- Ejecutar en Neon junto con NEON_pedidos_derivacion_externa.sql.

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS solicitud_derivacion_pendiente boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS solicitud_derivacion_fecha timestamptz,
  ADD COLUMN IF NOT EXISTS solicitud_derivacion_usuario_id integer,
  ADD COLUMN IF NOT EXISTS solicitud_derivacion_motivo text,
  ADD COLUMN IF NOT EXISTS solicitud_derivacion_destino_sugerido varchar(64);

COMMENT ON COLUMN pedidos.solicitud_derivacion_pendiente IS 'True: el técnico pidió derivar; el admin confirma con POST derivar-externo o rechaza.';
COMMENT ON COLUMN pedidos.solicitud_derivacion_destino_sugerido IS 'Opcional: clave destino sugerida (mismo vocabulario que derivacion_reclamos).';
