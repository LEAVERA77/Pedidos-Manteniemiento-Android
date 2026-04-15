-- usuarios.tenant_id — purge seguro en multitenant (rubro / setup wizard)
-- Ejecutar en Neon (SQL Editor). Requiere al menos una fila en `clientes` para el backfill por defecto.
-- Si ya tenías columna `cliente_id` en usuarios, se copia a `tenant_id` antes del fallback MIN(clientes.id).
--
-- Tras aplicar: reiniciá el servicio Node (Render) para releer el esquema en caché.

-- 1) Columna
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS tenant_id INTEGER;

-- 2a) Instalaciones que ya usaban cliente_id como tenant
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'usuarios' AND column_name = 'cliente_id'
  ) THEN
    UPDATE usuarios SET tenant_id = cliente_id WHERE tenant_id IS NULL AND cliente_id IS NOT NULL;
  END IF;
END $$;

-- 2b) Resto: legacy → primer cliente por id (revisar si había usuarios de varios tenants sin columna)
UPDATE usuarios u
SET tenant_id = sub.first_id
FROM (SELECT MIN(id) AS first_id FROM clientes) sub
WHERE u.tenant_id IS NULL
  AND sub.first_id IS NOT NULL;

-- 3) Obligatorio
ALTER TABLE usuarios ALTER COLUMN tenant_id SET NOT NULL;

-- 4) FK
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_tenant_id_fkey;
ALTER TABLE usuarios
  ADD CONSTRAINT usuarios_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES clientes(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_usuarios_tenant_id ON usuarios (tenant_id);

COMMENT ON COLUMN usuarios.tenant_id IS 'clientes.id — aislamiento usuarios/técnicos por tenant (GestorNova SaaS)';
