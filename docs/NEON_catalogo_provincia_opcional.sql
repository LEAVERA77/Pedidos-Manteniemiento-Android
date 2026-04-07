-- Opcional: provincia en catálogo para desambiguar localidades homónimas en Nominatim (state / q).
-- Ejecutar en Neon solo si querés cargar provincia por fila (además de tenant.configuracion).

ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS provincia TEXT;
COMMENT ON COLUMN socios_catalogo.provincia IS 'Provincia para geocodificación (ej. Entre Ríos); prioridad sobre provincia del tenant en WhatsApp.';

ALTER TABLE clientes_finales ADD COLUMN IF NOT EXISTS provincia TEXT;
COMMENT ON COLUMN clientes_finales.provincia IS 'Provincia del socio para Nominatim cuando difiere del default del tenant.';
