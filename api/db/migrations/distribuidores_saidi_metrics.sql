-- Métricas por distribuidor para cálculos SAIDI / SAIFI (import Excel admin).
-- Idempotente: ADD COLUMN IF NOT EXISTS.
-- made by leavera77

ALTER TABLE public.distribuidores ADD COLUMN IF NOT EXISTS trafos INTEGER;
ALTER TABLE public.distribuidores ADD COLUMN IF NOT EXISTS kva_saidi NUMERIC(14, 3);
ALTER TABLE public.distribuidores ADD COLUMN IF NOT EXISTS clientes_saidi INTEGER;

COMMENT ON COLUMN public.distribuidores.trafos IS 'Cantidad de transformadores asociados al distribuidor (carga Excel SAIDI/SAIFI).';
COMMENT ON COLUMN public.distribuidores.kva_saidi IS 'KVA (potencia instalada referida; carga Excel SAIDI/SAIFI).';
COMMENT ON COLUMN public.distribuidores.clientes_saidi IS 'Clientes/socios conectados para denominador SAIDI/SAIFI (carga Excel).';
