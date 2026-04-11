-- Provincia explícita para desambiguar geocodificación y mostrar en UI (Neon).
-- made by leavera77

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS provincia TEXT;
ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS provincia TEXT;

COMMENT ON COLUMN pedidos.provincia IS 'Provincia Argentina del domicilio (desambiguación geográfica; alineada con tenant/oficina).';
COMMENT ON COLUMN socios_catalogo.provincia IS 'Provincia del socio (import Excel / catálogo).';
