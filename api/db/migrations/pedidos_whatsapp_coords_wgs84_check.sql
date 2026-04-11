-- Regla de producto: pedidos con origen_reclamo = 'whatsapp' deben tener lat/lng WGS84 válidos
-- (no NULL, no (0,0), rangos coherentes). Alineado con coordsValidasWgs84 en API.
-- Nota esquema: en `public.pedidos` las coords del pin son columnas `lat`/`lng` (no `latitud`/`longitud`;
-- esas nombres existen p. ej. en `socios_catalogo`). Sin trigger en repo que reemplace `lat`/`lng` al INSERT.
--
-- Despliegue:
-- 1) Backfill de filas históricas que violen la regla (re-geocodificación o centro ciudad) ANTES de VALIDATE.
-- 2) O dejar NOT VALID hasta completar backfill, luego: ALTER TABLE pedidos VALIDATE CONSTRAINT pedidos_whatsapp_coords_wgs84_check;
--
-- made by leavera77

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
  'WhatsApp: lat/lng obligatorios y válidos WGS84 (no placeholder 0,0). NOT VALID hasta backfill. made by leavera77';
