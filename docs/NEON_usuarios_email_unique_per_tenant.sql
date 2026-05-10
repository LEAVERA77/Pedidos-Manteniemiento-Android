-- ═══════════════════════════════════════════════════════════════════════════
-- Neon: permitir el mismo login (`email`) en distintos tenants
-- ═══════════════════════════════════════════════════════════════════════════
-- Problema: un UNIQUE solo sobre `email` impide crear "lea" en tenant 1 si ya
-- existe en tenant 20.
-- Solución: quitar la unicidad global y crear índice único compuesto
-- (tenant_id, login normalizado) o (cliente_id, login normalizado).
--
-- Ejecutá en Neon **una vez**, en ventana de mantenimiento si hay mucho tráfico.
-- Revisá errores: si el índice ya existe o el nombre del constraint difiere, ajustá.
-- made by leavera77
-- ═══════════════════════════════════════════════════════════════════════════

-- Quitar unicidad global típica en PostgreSQL (el nombre puede variar).
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_email_key;
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_email_unique;

-- Por si existía como índice único suelto
DROP INDEX IF EXISTS public.usuarios_email_key;
DROP INDEX IF EXISTS public.usuarios_email_unique;

-- Índice único por tenant + login (minúsculas, sin espacios extremos).
-- Usá SOLO el bloque que corresponda a tu columna multitenant en `usuarios`.

-- ── Opción A: columna tenant_id ───────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_login_lower_per_tenant_uidx
  ON public.usuarios (tenant_id, (lower(btrim(coalesce(email, '')))));

-- ── Opción B: si tu tabla usa cliente_id en lugar de tenant_id ─────────────
-- (descomentá y ejecutá en lugar de la opción A; no mantengas ambos índices
--  salvo que tengas ambas columnas con semántica distinta, lo cual no es lo habitual.)
-- DROP INDEX IF EXISTS public.usuarios_login_lower_per_tenant_uidx;
-- CREATE UNIQUE INDEX IF NOT EXISTS usuarios_login_lower_per_cliente_uidx
--   ON public.usuarios (cliente_id, (lower(btrim(coalesce(email, '')))));

-- Notas:
-- * Filas con tenant_id NULL seguirán permitiendo emails repetidos entre sí
--   (NULL se excluye del índice único de forma laxa en PG). Conviene tener
--   tenant_id siempre NOT NULL en entornos multitenant.
-- * Tras esto, la API y el login por JWT comparan contraseña contra todas las
--   filas candidatas con el mismo login cuando hace falta (ver api/routes/auth.js).
