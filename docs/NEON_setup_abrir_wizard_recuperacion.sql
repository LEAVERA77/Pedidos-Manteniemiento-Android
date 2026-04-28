-- Obligar al panel a abrir el wizard de setup al próximo ingreso (admin),
-- aunque setup_wizard_completado ya sea true. El wizard precarga nombre/tipo
-- desde la fila actual de clientes (GET /api/clientes/mi-configuracion).
--
-- Tras "Finalizar", la app envía abrir_wizard_recuperacion: false y queda normal.
--
-- made by leavera77

UPDATE clientes
SET configuracion = COALESCE(configuracion, '{}'::jsonb) || jsonb_build_object('abrir_wizard_recuperacion', true)
WHERE id = 1;
