-- Métricas por distribuidor para análisis SAIDI/SAIFI (cooperativa eléctrica).
-- Idempotente.

ALTER TABLE public.distribuidores
    ADD COLUMN IF NOT EXISTS trafos INTEGER;

ALTER TABLE public.distribuidores
    ADD COLUMN IF NOT EXISTS kva_saidi DOUBLE PRECISION;

ALTER TABLE public.distribuidores
    ADD COLUMN IF NOT EXISTS clientes_saidi INTEGER;

COMMENT ON COLUMN public.distribuidores.trafos IS 'Cantidad de transformadores asociados al distribuidor (import Excel SAIDI/SAIFI).';
COMMENT ON COLUMN public.distribuidores.kva_saidi IS 'Potencia instalada en kVA (import Excel SAIDI/SAIFI).';
COMMENT ON COLUMN public.distribuidores.clientes_saidi IS 'Cantidad de clientes conectados (import Excel SAIDI/SAIFI).';
