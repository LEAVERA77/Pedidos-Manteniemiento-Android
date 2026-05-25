-- =============================================================================
-- Neon: eliminar tenant «Cooperativa El Chaja» (cooperativa eléctrica u otro tipo)
--
-- 1) Ejecutá primero el bloque DIAGNÓSTICO.
-- 2) Revisá conteos; si es el tenant correcto, ejecutá BORRADO en transacción.
-- 3) Si falla por FK, leé el mensaje: puede faltar borrar una tabla hija.
--
-- made by leavera77
-- =============================================================================

-- ── Parámetro: nombre exacto o parcial ─────────────────────────────────────
DROP TABLE IF EXISTS _gn_tenant_delete_target;
CREATE TEMP TABLE _gn_tenant_delete_target AS
SELECT id, nombre, tipo, activo
FROM clientes
WHERE lower(trim(nombre)) = lower(trim('Cooperativa El Chaja'))
   OR lower(trim(nombre)) LIKE '%el chaja%'
ORDER BY id;

-- Debe devolver UNA fila (o elegí el id a mano y usá solo ese id abajo)
SELECT * FROM _gn_tenant_delete_target;

-- Si hay más de un candidato, detenete y ajustá el WHERE del CREATE TEMP TABLE.

-- ── DIAGNÓSTICO (conteos por tenant_id) ────────────────────────────────────
SELECT t.id AS tenant_id, t.nombre, t.tipo,
       (SELECT COUNT(*)::bigint FROM usuarios u WHERE u.tenant_id = t.id) AS usuarios,
       (SELECT COUNT(*)::bigint FROM pedidos p WHERE p.tenant_id = t.id) AS pedidos,
       (SELECT COUNT(*)::bigint FROM socios_catalogo s WHERE s.tenant_id = t.id) AS socios,
       (SELECT COUNT(*)::bigint FROM distribuidores_red dr WHERE dr.tenant_id = t.id) AS distribuidores_red,
       (SELECT COUNT(*)::bigint FROM distribuidores d WHERE d.tenant_id = t.id) AS distribuidores_legacy
FROM _gn_tenant_delete_target t;

-- Opcionales (si existen en tu esquema)
DO $$
DECLARE
  tid INT;
  cnt BIGINT;
  r RECORD;
BEGIN
  SELECT id INTO tid FROM _gn_tenant_delete_target LIMIT 1;
  IF tid IS NULL THEN
    RAISE NOTICE 'No hay tenant en _gn_tenant_delete_target';
    RETURN;
  END IF;

  FOR r IN
    SELECT unnest(ARRAY[
      'kpi_snapshots',
      'pedido_contador',
      'empresa_config',
      'recordatorios_reclamos',
      'notificaciones_movil',
      'tenant_localidades',
      'broadcast_metrics'
    ]) AS tbl
  LOOP
    IF to_regclass('public.' || r.tbl) IS NOT NULL THEN
      EXECUTE format('SELECT COUNT(*)::bigint FROM %I WHERE tenant_id = $1', r.tbl) INTO cnt USING tid;
      RAISE NOTICE '%: % filas', r.tbl, cnt;
    END IF;
  END LOOP;

  IF to_regclass('public.infra_transformadores') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*)::bigint FROM infra_transformadores WHERE tenant_id = $1' INTO cnt USING tid;
    RAISE NOTICE 'infra_transformadores: % filas', cnt;
  END IF;
END $$;

-- ── BORRADO (destructivo) ──────────────────────────────────────────────────
-- Sustituí el id si ya lo conocés: WHERE id = 123

BEGIN;

-- FK RESTRICT en distribuidores: borrar hijos antes de clientes
DELETE FROM distribuidores d
USING _gn_tenant_delete_target t
WHERE d.tenant_id = t.id;

-- Infra eléctrica (si existe)
DO $$
BEGIN
  IF to_regclass('public.infra_transformadores') IS NOT NULL THEN
    DELETE FROM infra_transformadores it
    USING _gn_tenant_delete_target t
    WHERE it.tenant_id = t.id;
  END IF;
  IF to_regclass('public.clientes_afectados_log') IS NOT NULL THEN
    DELETE FROM clientes_afectados_log l
    USING _gn_tenant_delete_target t
    WHERE l.tenant_id = t.id;
  END IF;
END $$;

-- Tenant: muchas tablas tienen ON DELETE CASCADE desde clientes(id)
DELETE FROM clientes c
USING _gn_tenant_delete_target t
WHERE c.id = t.id
RETURNING c.id, c.nombre, c.tipo;

COMMIT;

-- Verificación
SELECT id, nombre FROM clientes
WHERE lower(trim(nombre)) LIKE '%chaja%';
