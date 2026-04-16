-- Reset de datos para pruebas de filtros tenant/business_type en Neon.
-- IMPORTANTE: cambiar el tenant_id objetivo antes de ejecutar.
-- Este script NO elimina estructura/tablas, solo datos operativos.
--
-- made by leavera77

BEGIN;

-- 1) Elegí tenant objetivo (editar este valor)
WITH target AS (SELECT 1::int AS tenant_id)

-- 2) Pedidos (base de estadísticas operativas)
DELETE FROM pedidos p
USING target t
WHERE p.tenant_id = t.tenant_id;

-- 3) Tablas de métricas / auditoría relacionadas (si existen)
DO $$
DECLARE
  v_tenant int := 1; -- mismo tenant_id elegido arriba
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='kpi_snapshots') THEN
    EXECUTE 'DELETE FROM kpi_snapshots WHERE tenant_id = $1' USING v_tenant;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='clientes_afectados_log') THEN
    EXECUTE 'DELETE FROM clientes_afectados_log WHERE tenant_id = $1' USING v_tenant;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='comunicaciones_envios') THEN
    EXECUTE 'DELETE FROM comunicaciones_envios WHERE tenant_id = $1' USING v_tenant;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='cortes_programados') THEN
    EXECUTE 'DELETE FROM cortes_programados WHERE tenant_id = $1' USING v_tenant;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='whatsapp_notificaciones') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='whatsapp_notificaciones' AND column_name='tenant_id'
    ) THEN
      EXECUTE 'DELETE FROM whatsapp_notificaciones WHERE tenant_id = $1' USING v_tenant;
    END IF;
  END IF;
END $$;

-- 4) Forzar "primera vez" del setup para ese tenant.
--    Esto hace que el wizard vuelva a exigir nombre/tipo/ubicación al admin.
WITH target AS (SELECT 1::int AS tenant_id)
UPDATE clientes c
SET
  active_business_type = NULL,
  configuracion = COALESCE(configuracion, '{}'::jsonb)
    || jsonb_build_object('setup_wizard_completado', false, 'marca_publicada_admin', false),
  fecha_actualizacion = NOW()
FROM target t
WHERE c.id = t.tenant_id;

COMMIT;

-- Si querés resetear OTRO tenant, reemplazá "1" por su id
-- en los tres puntos marcados (target y v_tenant).
