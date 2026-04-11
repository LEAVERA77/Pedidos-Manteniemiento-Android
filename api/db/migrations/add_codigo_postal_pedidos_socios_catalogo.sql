-- Código postal para Nominatim estructurado y UI (Neon).
-- provincia puede existir por migración previa; se asegura con IF NOT EXISTS.
-- made by leavera77

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS provincia TEXT;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS codigo_postal TEXT;
ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS provincia TEXT;
ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS codigo_postal TEXT;

COMMENT ON COLUMN pedidos.codigo_postal IS 'CPA / código postal declarado (WhatsApp, import, manual).';
COMMENT ON COLUMN socios_catalogo.codigo_postal IS 'Código postal del socio (import Excel / catálogo).';
