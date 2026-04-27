-- Aislamiento de catálogo `distribuidores` por tenant (Neon).
-- Sin esta columna, la web y la API listan todas las filas de la tabla.
-- Idempotente: se puede ejecutar más de una vez.
--
-- Backfill: todas las filas existentes quedan en el cliente (tenant) con id mínimo.
-- Si tenías varios negocios en la misma base sin columna, revisá y actualizá tenant_id a mano antes de NOT NULL.

ALTER TABLE public.distribuidores
    ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES public.clientes (id) ON DELETE RESTRICT;

UPDATE public.distribuidores d
SET tenant_id = s.min_id
FROM (SELECT MIN(id) AS min_id FROM public.clientes) s
WHERE d.tenant_id IS NULL
  AND s.min_id IS NOT NULL;

-- Si no hay filas en clientes, no forzar NOT NULL (evita fallo).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.clientes LIMIT 1)
       AND NOT EXISTS (SELECT 1 FROM public.distribuidores WHERE tenant_id IS NULL) THEN
        ALTER TABLE public.distribuidores ALTER COLUMN tenant_id SET NOT NULL;
    END IF;
END $$;

-- Índice para listados por tenant
CREATE INDEX IF NOT EXISTS idx_distribuidores_tenant_id ON public.distribuidores (tenant_id);

-- Mismo código puede repetirse en distintos tenants: sustituir UNIQUE global solo en codigo.
ALTER TABLE public.distribuidores DROP CONSTRAINT IF EXISTS distribuidores_codigo_key;
ALTER TABLE public.distribuidores DROP CONSTRAINT IF EXISTS distribuidores_codigo_unique;
DROP INDEX IF EXISTS distribuidores_codigo_key;
DROP INDEX IF EXISTS distribuidores_codigo_unique;

CREATE UNIQUE INDEX IF NOT EXISTS ux_distribuidores_tenant_codigo
    ON public.distribuidores (tenant_id, (upper(trim(codigo::text))));

COMMENT ON COLUMN public.distribuidores.tenant_id IS 'Cliente (tenant) dueño del catálogo; obligatorio para aislar admin y API.';
