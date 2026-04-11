-- Log de re-geocodificación automática (WhatsApp) para trazabilidad en panel admin.
-- Ejecutar en Neon / Postgres del tenant cuando se despliegue la API.

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS geocode_log_whatsapp JSONB;

COMMENT ON COLUMN pedidos.geocode_log_whatsapp IS 'JSON: regeo servidor post-alta WA (success, fuente, log[], pin_ok, at). made by leavera77';
