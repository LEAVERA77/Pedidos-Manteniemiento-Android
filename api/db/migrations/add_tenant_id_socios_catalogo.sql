-- socios_catalogo.tenant_id — multitenant (purge seguro, import por cliente)
-- Ejecutar en Neon (SQL Editor). Requiere al menos una fila en `clientes` para el backfill.
-- Revisá el backfill si ya tenías varios clientes con datos mezclados (todo el legacy se asigna al MIN(id)).
--
-- Tras aplicar: reiniciá el servicio Node (p. ej. Render) para que la API no use caché vieja de esquema.
-- Índices extra: docs/NEON_escala_catalogo_indices.sql (bloque tenant_id).

-- 1) Columna
ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS tenant_id INTEGER;

-- 2) Backfill: legacy sin tenant → menor id en clientes (ajustar manualmente si hacía falta otro mapeo)
UPDATE socios_catalogo sc
SET tenant_id = sub.first_id
FROM (SELECT MIN(id) AS first_id FROM clientes) sub
WHERE sc.tenant_id IS NULL
  AND sub.first_id IS NOT NULL;

-- 3) Obligatorio tras backfill (antes del UNIQUE compuesto)
ALTER TABLE socios_catalogo ALTER COLUMN tenant_id SET NOT NULL;

-- 4) Quitar UNIQUE global solo sobre nis_medidor (sustituido por par tenant+nis)
DO $$
DECLARE
 r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.relname = 'socios_catalogo'
      AND c.contype = 'u'
  LOOP
    IF r.def ~* '^UNIQUE\s*\(\s*nis_medidor\s*\)\s*$' THEN
      EXECUTE format('ALTER TABLE socios_catalogo DROP CONSTRAINT IF EXISTS %I', r.conname);
    END IF;
  END LOOP;
END $$;

-- 5) Unicidad por tenant (falla si hay duplicados mismo tenant+nis_medidor)
ALTER TABLE socios_catalogo DROP CONSTRAINT IF EXISTS socios_catalogo_tenant_nis_medidor_key;
ALTER TABLE socios_catalogo
  ADD CONSTRAINT socios_catalogo_tenant_nis_medidor_key UNIQUE (tenant_id, nis_medidor);

-- 6) FK a clientes
ALTER TABLE socios_catalogo DROP CONSTRAINT IF EXISTS socios_catalogo_tenant_id_fkey;
ALTER TABLE socios_catalogo
  ADD CONSTRAINT socios_catalogo_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES clientes(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_socios_tenant_id ON socios_catalogo (tenant_id);
CREATE INDEX IF NOT EXISTS idx_socios_tenant_nis ON socios_catalogo (tenant_id, nis_medidor);

COMMENT ON COLUMN socios_catalogo.tenant_id IS 'clientes.id — aislamiento catálogo socios por tenant (GestorNova SaaS)';
