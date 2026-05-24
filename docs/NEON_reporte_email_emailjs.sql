-- EmailJS guardado por tenant (informes automáticos sin duplicar secretos en Render).
-- Ejecutar en Neon después de NEON_fcm_reportes_sla.sql

ALTER TABLE tenant_reporte_email_config
  ADD COLUMN IF NOT EXISTS emailjs_config JSONB;

-- made by leavera77
