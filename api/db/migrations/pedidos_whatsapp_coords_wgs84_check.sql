-- Regla de producto: pedidos con origen_reclamo = 'whatsapp' deben tener lat/lng WGS84 válidos
-- (no NULL, no (0,0), rangos coherentes). Alineado con coordsValidasWgs84 / parLatLngPasaCheckWhatsappDb en API.
--
-- IMPORTANTE: el CHECK debe referenciar columnas `lat` y `lng` de `public.pedidos` (como inserta la API).
-- Si en algún entorno el constraint quedó sobre `latitud`/`longitud`, los INSERT con lat/lng dejan NULL
-- en esas columnas y el CHECK falla. En ese caso ejecutar también:
--   api/db/migrations/fix_neon_pedidos_whatsapp_check_lat_lng.sql
--
-- Uso `IS DISTINCT FROM 'whatsapp'` (no `!=`) para que filas con origen_reclamo NULL no queden con CHECK ambiguo.
--
-- Despliegue:
-- 1) Backfill de filas históricas que violen la regla ANTES de VALIDATE.
-- 2) Opcional: NOT VALID primero; luego ALTER TABLE pedidos VALIDATE CONSTRAINT ...;
--
-- made by leavera77

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
  'WhatsApp: lat/lng obligatorios y válidos WGS84 (no placeholder 0,0). Columnas lat/lng (no latitud/longitud). made by leavera77';
