-- =============================================================================
-- Neon — cambio manual de `tenant_id` del administrador (recuperar datos de un tenant)
--
-- Caso: la sesión apunta a un `clientes.id` equivocado y en Neon ya identificaste
-- el tenant bueno (nombre + id). Esto mueve **solo** tu fila en `usuarios` al
-- `clientes.id` correcto. No mueve pedidos; para datos huérfanos usá:
--   docs/NEON_ops_reasignar_tenant_datos.sql
--
-- Tras ejecutar: cerrá sesión en el panel y volvé a entrar para alinear el JWT.
--
-- made by leavera77
-- =============================================================================

-- ── 1) Listar tenants (elegí destino por nombre) ────────────────────────────
SELECT id, nombre, tipo, activo, fecha_registro
FROM clientes
ORDER BY id;

-- ── 2) Admins actuales ─────────────────────────────────────────────────────
SELECT id, tenant_id, email, nombre, rol, activo
FROM usuarios
WHERE lower(trim(coalesce(rol, ''))) IN ('admin', 'administrador')
ORDER BY tenant_id, id;

-- ── 3) Parámetros: una sola fila (editá user_id y tenant_destino) ───────────
DROP TABLE IF EXISTS _gn_admin_cambiar_tenant_params;
CREATE TEMP TABLE _gn_admin_cambiar_tenant_params (
    user_id INTEGER NOT NULL,
    tenant_destino INTEGER NOT NULL
);
INSERT INTO _gn_admin_cambiar_tenant_params (user_id, tenant_destino)
VALUES (116, 1);

-- ── 4) Actualizar (aborta si hay otro usuario con el mismo email en el destino)
DO $$
DECLARE
    p RECORD;
    em TEXT;
BEGIN
    SELECT * INTO p FROM _gn_admin_cambiar_tenant_params LIMIT 1;
    IF p IS NULL THEN
        RAISE EXCEPTION 'Falta fila en _gn_admin_cambiar_tenant_params';
    END IF;

    SELECT lower(trim(coalesce(email, ''))) INTO em FROM usuarios WHERE id = p.user_id;
    IF em IS NULL OR em = '' THEN
        RAISE EXCEPTION 'Usuario % sin email', p.user_id;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM usuarios u
        WHERE u.tenant_id = p.tenant_destino
          AND u.id <> p.user_id
          AND lower(trim(coalesce(u.email, ''))) = em
    ) THEN
        RAISE EXCEPTION
            'Email duplicado en tenant_id=%: resolvé antes (cambiar email o desactivar la otra fila).',
            p.tenant_destino;
    END IF;

    UPDATE usuarios u
    SET tenant_id = p.tenant_destino
    FROM _gn_admin_cambiar_tenant_params pr
    WHERE u.id = pr.user_id
      AND lower(trim(coalesce(u.rol, ''))) IN ('admin', 'administrador');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No se actualizó: user_id=% inexistente o rol no es admin.', p.user_id;
    END IF;
END $$;

-- ── 5) Verificación ─────────────────────────────────────────────────────────
SELECT u.id, u.tenant_id, u.email, u.nombre, u.rol, c.nombre AS cliente_nombre
FROM usuarios u
JOIN _gn_admin_cambiar_tenant_params p ON u.id = p.user_id
LEFT JOIN clientes c ON c.id = u.tenant_id;
