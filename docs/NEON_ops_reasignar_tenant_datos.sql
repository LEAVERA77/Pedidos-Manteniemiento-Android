-- =============================================================================
-- Operación Neon: reasignar datos de un tenant viejo → tenant nuevo (clientes.id)
--
-- Caso típico: wizard "nueva instancia" creó otro `clientes` y el JWT apunta al nuevo
-- id, pero `pedidos`, `usuarios`, etc. siguen con el `tenant_id` anterior → "huérfanos".
-- El wizard no asocia por nombre de empresa: hay que alinear `tenant_id` en filas.
--
-- Uso:
--   1) Listá clientes:  SELECT id, nombre, tipo FROM clientes ORDER BY id;
--   2) Editá SOLO la fila VALUES abajo (old_id, new_id).
--   3) Ejecutá el bloque "SETUP + DIAGNÓSTICO".
--   4) Si los conteos son los esperados, ejecutá el bloque "ACTUALIZAR" (transacción).
--
-- Riesgos: UNIQUE por tenant (socios_catalogo, distribuidores, pedido_contador).
-- Si algo falla, ROLLBACK y revisá el mensaje de error de Postgres.
--
-- made by leavera77
-- =============================================================================

-- ── 1) Parámetros: editar solo esta línea VALUES ───────────────────────────
DROP TABLE IF EXISTS _gn_reassign_tenant_params;
CREATE TEMP TABLE _gn_reassign_tenant_params (old_id INTEGER NOT NULL, new_id INTEGER NOT NULL);
INSERT INTO _gn_reassign_tenant_params (old_id, new_id) VALUES (1, 17);

DROP TABLE IF EXISTS _gn_diag_optional;
CREATE TEMP TABLE _gn_diag_optional (tabla TEXT, filas BIGINT);


-- ── 2) DIAGNÓSTICO (solo lectura) ─────────────────────────────────────────
SELECT 'clientes_origen' AS k, c.id, c.nombre, c.tipo
FROM clientes c
JOIN _gn_reassign_tenant_params p ON c.id = p.old_id;

SELECT 'clientes_destino' AS k, c.id, c.nombre, c.tipo
FROM clientes c
JOIN _gn_reassign_tenant_params p ON c.id = p.new_id;

SELECT 'pedidos' AS tabla, COUNT(*)::bigint AS filas
FROM pedidos x JOIN _gn_reassign_tenant_params p ON x.tenant_id = p.old_id;

SELECT 'usuarios' AS tabla, COUNT(*)::bigint AS filas
FROM usuarios x JOIN _gn_reassign_tenant_params p ON x.tenant_id = p.old_id;

SELECT 'socios_catalogo' AS tabla, COUNT(*)::bigint AS filas
FROM socios_catalogo x JOIN _gn_reassign_tenant_params p ON x.tenant_id = p.old_id;

SELECT 'kpi_snapshots' AS tabla, COUNT(*)::bigint AS filas
FROM kpi_snapshots x JOIN _gn_reassign_tenant_params p ON x.tenant_id = p.old_id;

SELECT 'pedido_contador' AS tabla, COUNT(*)::bigint AS filas
FROM pedido_contador x JOIN _gn_reassign_tenant_params p ON x.tenant_id = p.old_id;

SELECT 'correcciones_direcciones' AS tabla, COUNT(*)::bigint AS filas
FROM correcciones_direcciones x JOIN _gn_reassign_tenant_params p ON x.tenant_id = p.old_id;

-- Tablas opcionales: el motor valida FROM aunque el WHERE sea falso; usamos EXECUTE.
DO $$
DECLARE
    cnt BIGINT;
BEGIN
    IF to_regclass('public.distribuidores') IS NOT NULL
       AND EXISTS (
           SELECT 1
           FROM information_schema.columns c
           WHERE c.table_schema = 'public'
             AND c.table_name = 'distribuidores'
             AND c.column_name = 'tenant_id'
       ) THEN
        EXECUTE
            'SELECT COUNT(*)::bigint FROM distribuidores x JOIN _gn_reassign_tenant_params p ON x.tenant_id = p.old_id'
            INTO cnt;
        INSERT INTO _gn_diag_optional VALUES ('distribuidores', cnt);
    END IF;

    IF to_regclass('public.recordatorios_reclamos') IS NOT NULL THEN
        EXECUTE
            'SELECT COUNT(*)::bigint FROM recordatorios_reclamos x JOIN _gn_reassign_tenant_params p ON x.tenant_id = p.old_id'
            INTO cnt;
        INSERT INTO _gn_diag_optional VALUES ('recordatorios_reclamos', cnt);
    END IF;

    IF to_regclass('public.geocod_wa_operaciones') IS NOT NULL THEN
        EXECUTE
            'SELECT COUNT(*)::bigint FROM geocod_wa_operaciones x JOIN _gn_reassign_tenant_params p ON x.tenant_id = p.old_id'
            INTO cnt;
        INSERT INTO _gn_diag_optional VALUES ('geocod_wa_operaciones', cnt);
    END IF;

    IF to_regclass('public.tenant_localidades') IS NOT NULL THEN
        EXECUTE
            'SELECT COUNT(*)::bigint FROM tenant_localidades x JOIN _gn_reassign_tenant_params p ON x.tenant_id = p.old_id'
            INTO cnt;
        INSERT INTO _gn_diag_optional VALUES ('tenant_localidades', cnt);
    END IF;

    IF to_regclass('public.tenant_businesses') IS NOT NULL THEN
        EXECUTE
            'SELECT COUNT(*)::bigint FROM tenant_businesses x JOIN _gn_reassign_tenant_params p ON x.tenant_id = p.old_id'
            INTO cnt;
        INSERT INTO _gn_diag_optional VALUES ('tenant_businesses', cnt);
    END IF;

    IF to_regclass('public.tenant_business_audit') IS NOT NULL THEN
        EXECUTE
            'SELECT COUNT(*)::bigint FROM tenant_business_audit x JOIN _gn_reassign_tenant_params p ON x.tenant_id = p.old_id'
            INTO cnt;
        INSERT INTO _gn_diag_optional VALUES ('tenant_business_audit', cnt);
    END IF;
END $$;

SELECT * FROM _gn_diag_optional ORDER BY tabla;


-- =============================================================================
-- 3) ACTUALIZAR — ejecutar en un solo bloque cuando el diagnóstico sea correcto
-- =============================================================================

BEGIN;

UPDATE pedidos p SET tenant_id = (SELECT new_id FROM _gn_reassign_tenant_params LIMIT 1)
WHERE p.tenant_id = (SELECT old_id FROM _gn_reassign_tenant_params LIMIT 1);

UPDATE usuarios u SET tenant_id = (SELECT new_id FROM _gn_reassign_tenant_params LIMIT 1)
WHERE u.tenant_id = (SELECT old_id FROM _gn_reassign_tenant_params LIMIT 1);

UPDATE socios_catalogo s SET tenant_id = (SELECT new_id FROM _gn_reassign_tenant_params LIMIT 1)
WHERE s.tenant_id = (SELECT old_id FROM _gn_reassign_tenant_params LIMIT 1);

-- Tablas opcionales (omitidas si no existen o sin columna tenant_id)
DO $$
DECLARE o INTEGER; n INTEGER;
BEGIN
    SELECT old_id, new_id INTO o, n FROM _gn_reassign_tenant_params LIMIT 1;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'distribuidores' AND column_name = 'tenant_id'
    ) THEN
        UPDATE distribuidores d SET tenant_id = n WHERE d.tenant_id = o;
    END IF;
END $$;

UPDATE kpi_snapshots k SET tenant_id = (SELECT new_id FROM _gn_reassign_tenant_params LIMIT 1)
WHERE k.tenant_id = (SELECT old_id FROM _gn_reassign_tenant_params LIMIT 1);

UPDATE correcciones_direcciones c SET tenant_id = (SELECT new_id FROM _gn_reassign_tenant_params LIMIT 1)
WHERE c.tenant_id = (SELECT old_id FROM _gn_reassign_tenant_params LIMIT 1);

DO $$
DECLARE o INTEGER; n INTEGER;
BEGIN
    SELECT old_id, new_id INTO o, n FROM _gn_reassign_tenant_params LIMIT 1;
    IF to_regclass('public.recordatorios_reclamos') IS NOT NULL THEN
        EXECUTE 'UPDATE recordatorios_reclamos r SET tenant_id = $1 WHERE r.tenant_id = $2' USING n, o;
    END IF;
END $$;

DO $$
DECLARE o INTEGER; n INTEGER;
BEGIN
    SELECT old_id, new_id INTO o, n FROM _gn_reassign_tenant_params LIMIT 1;
    IF to_regclass('public.geocod_wa_operaciones') IS NOT NULL THEN
        EXECUTE 'UPDATE geocod_wa_operaciones g SET tenant_id = $1 WHERE g.tenant_id = $2' USING n, o;
    END IF;
END $$;

DO $$
DECLARE o INTEGER; n INTEGER;
BEGIN
    SELECT old_id, new_id INTO o, n FROM _gn_reassign_tenant_params LIMIT 1;
    IF to_regclass('public.tenant_localidades') IS NOT NULL THEN
        EXECUTE 'UPDATE tenant_localidades t SET tenant_id = $1 WHERE t.tenant_id = $2' USING n, o;
    END IF;
END $$;

-- Contadores por año: fusionar máximo si ya existe fila en destino
INSERT INTO pedido_contador (tenant_id, anio, ultimo_numero)
SELECT (SELECT new_id FROM _gn_reassign_tenant_params LIMIT 1), o.anio, o.ultimo_numero
FROM pedido_contador o
WHERE o.tenant_id = (SELECT old_id FROM _gn_reassign_tenant_params LIMIT 1)
ON CONFLICT (tenant_id, anio) DO UPDATE
SET ultimo_numero = GREATEST(pedido_contador.ultimo_numero, EXCLUDED.ultimo_numero);

DELETE FROM pedido_contador o
WHERE o.tenant_id = (SELECT old_id FROM _gn_reassign_tenant_params LIMIT 1);

-- Líneas de negocio: no pisar filas ya presentes en el tenant destino
INSERT INTO tenant_businesses (tenant_id, business_type, active)
SELECT (SELECT new_id FROM _gn_reassign_tenant_params LIMIT 1), b.business_type, b.active
FROM tenant_businesses b
WHERE b.tenant_id = (SELECT old_id FROM _gn_reassign_tenant_params LIMIT 1)
ON CONFLICT (tenant_id, business_type) DO NOTHING;

DELETE FROM tenant_businesses b
WHERE b.tenant_id = (SELECT old_id FROM _gn_reassign_tenant_params LIMIT 1);

INSERT INTO tenant_active_business (tenant_id, active_business_type, updated_at)
SELECT (SELECT new_id FROM _gn_reassign_tenant_params LIMIT 1), a.active_business_type, a.updated_at
FROM tenant_active_business a
WHERE a.tenant_id = (SELECT old_id FROM _gn_reassign_tenant_params LIMIT 1)
ON CONFLICT (tenant_id) DO UPDATE
SET active_business_type = EXCLUDED.active_business_type,
    updated_at = EXCLUDED.updated_at;

DELETE FROM tenant_active_business a
WHERE a.tenant_id = (SELECT old_id FROM _gn_reassign_tenant_params LIMIT 1);

DO $$
DECLARE o INTEGER; n INTEGER;
BEGIN
    SELECT old_id, new_id INTO o, n FROM _gn_reassign_tenant_params LIMIT 1;
    IF to_regclass('public.tenant_business_audit') IS NOT NULL THEN
        EXECUTE 'UPDATE tenant_business_audit e SET tenant_id = $1 WHERE e.tenant_id = $2' USING n, o;
    END IF;
END $$;

COMMIT;


-- =============================================================================
-- Notas
-- * `empresa_config`, `configuracion`, notificaciones sin tenant_id: no van aquí.
-- * Si `infra_transformadores` / `clientes_afectados_log` tienen tenant_id en tu
--   esquema, agregá UPDATE análogos antes del COMMIT.
-- * Tras COMMIT: cerrar sesión en la app o recargar para que el JWT y caches
--   coincidan (ver invalidarCachesMultitenant en app.js).
-- =============================================================================
