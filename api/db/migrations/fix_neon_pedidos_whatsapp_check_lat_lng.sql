-- =============================================================================
-- Fix Neon (y cualquier entorno donde el CHECK quedó mal definido):
-- Si `pedidos_whatsapp_coords_wgs84_check` valida `latitud`/`longitud` pero los
-- INSERT de la API escriben `lat`/`lng`, las filas WhatsApp violan el CHECK.
--
-- Ejecutar en una sesión con permisos DDL (Neon SQL Editor o psql).
-- Revisar primero las consultas de diagnóstico comentadas abajo.
-- made by leavera77
-- =============================================================================

-- --- Diagnóstico (opcional, descomentar) ---
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'pedidos'
-- ORDER BY ordinal_position;
--
-- SELECT conname, convalidated, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.pedidos'::regclass AND contype = 'c';

-- --- Backup opcional ---
-- CREATE TABLE IF NOT EXISTS pedidos_whatsapp_backup_20260411 AS
-- SELECT * FROM pedidos WHERE origen_reclamo = 'whatsapp';

ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_whatsapp_coords_wgs84_check;

ALTER TABLE pedidos
  ADD CONSTRAINT pedidos_whatsapp_coords_wgs84_check
  CHECK (
    origen_reclamo IS DISTINCT FROM 'whatsapp'
    OR (
      lat IS NOT NULL
      AND lng IS NOT NULL
      AND lat::double precision BETWEEN -90 AND 90
      AND lng::double precision BETWEEN -180 AND 180
      AND NOT (
        abs(lat::double precision) < 0.000001
        AND abs(lng::double precision) < 0.000001
      )
    )
  )
  NOT VALID;

COMMENT ON CONSTRAINT pedidos_whatsapp_coords_wgs84_check ON pedidos IS
  'WhatsApp: obliga lat/lng WGS84 válidos (no 0,0). IS DISTINCT FROM maneja NULL en origen. NOT VALID hasta VALIDATE. made by leavera77';

-- Post-mantenimiento (bajo tráfico), cuando las filas históricas cumplan la regla:
-- ALTER TABLE pedidos VALIDATE CONSTRAINT pedidos_whatsapp_coords_wgs84_check;
