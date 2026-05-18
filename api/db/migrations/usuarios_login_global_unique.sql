-- Login único global en `usuarios.email` (identificador de acceso; no es obligatorio formato email).
-- Reemplaza unicidad por tenant (usuarios_login_lower_per_tenant_uidx) para evitar ambigüedad en login multitenant.
-- Ejecutar en Neon tras revisar duplicados (ver api/scripts/migrar-usuarios-login-unicos.mjs).
-- made by leavera77

DROP INDEX IF EXISTS public.usuarios_login_lower_per_tenant_uidx;
DROP INDEX IF EXISTS public.usuarios_login_lower_per_cliente_uidx;

ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_email_key;
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_email_unique;
DROP INDEX IF EXISTS public.usuarios_email_key;
DROP INDEX IF EXISTS public.usuarios_email_unique;

CREATE UNIQUE INDEX IF NOT EXISTS usuarios_login_lower_global_uidx
  ON public.usuarios ((lower(btrim(coalesce(email, '')))))
  WHERE btrim(coalesce(email, '')) <> '';

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS es_usuario_default BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN usuarios.es_usuario_default IS 'TRUE si fue creado automáticamente al dar de alta el tenant (admin bootstrap).';
