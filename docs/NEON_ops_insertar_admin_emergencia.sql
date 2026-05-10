-- =============================================================================
-- Neon — recrear usuario administrador «admin» / contraseña «admin»
--
-- Login WebView / GitHub Pages (Neon en el navegador) compara contraseña en
-- texto plano con password_hash (ver app.js login Neon). Por eso password_hash
-- debe ser literalmente la cadena «admin» para entrar así.
--
-- La API (POST /api/auth/login) también acepta texto plano si el hash no es bcrypt.
--
-- Este bloque asigna el admin al tenant «vigente»: primer `clientes.id` con
-- activo = true (ORDER BY id). Si tenés varios tenants, cambiá la subconsulta
-- o ejecutá antes el SELECT y reemplazá el id en la sección «MANUAL» abajo.
--
-- made by leavera77
-- =============================================================================

-- ── 0) Ver tenants (elegí el id correcto si hay más de uno) ─────────────────
SELECT id, nombre, tipo, COALESCE(activo, true) AS activo
FROM clientes
ORDER BY id;

-- ── 1) Recrear admin solo en el tenant activo por defecto (menor id activo) ─
DO $$
DECLARE
    tid INTEGER;
    has_tenant BOOLEAN;
    has_cliente BOOLEAN;
BEGIN
    SELECT c.id
    INTO tid
    FROM clientes c
    WHERE COALESCE(c.activo, true) = true
    ORDER BY c.id ASC
    LIMIT 1;

    IF tid IS NULL THEN
        RAISE EXCEPTION 'No hay fila en clientes con activo=true. Revisá la tabla clientes.';
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'usuarios' AND column_name = 'tenant_id'
    )
    INTO has_tenant;

    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'usuarios' AND column_name = 'cliente_id'
    )
    INTO has_cliente;

    IF has_tenant THEN
        DELETE FROM usuarios u
        WHERE lower(trim(coalesce(u.email, ''))) = 'admin'
          AND u.tenant_id = tid;

        INSERT INTO usuarios (tenant_id, email, nombre, password_hash, rol, activo)
        VALUES (tid, 'admin', 'Administrador', 'admin', 'admin', TRUE);
    ELSIF has_cliente THEN
        DELETE FROM usuarios u
        WHERE lower(trim(coalesce(u.email, ''))) = 'admin'
          AND u.cliente_id = tid;

        INSERT INTO usuarios (cliente_id, email, nombre, password_hash, rol, activo)
        VALUES (tid, 'admin', 'Administrador', 'admin', 'admin', TRUE);
    ELSE
        DELETE FROM usuarios u WHERE lower(trim(coalesce(u.email, ''))) = 'admin';
        INSERT INTO usuarios (email, nombre, password_hash, rol, activo)
        VALUES ('admin', 'Administrador', 'admin', 'admin', TRUE);
    END IF;
END $$;

SELECT setval(
    pg_get_serial_sequence('usuarios', 'id'),
    (SELECT COALESCE(MAX(id), 1) FROM usuarios)
);

SELECT *
FROM usuarios
WHERE lower(trim(coalesce(email, ''))) = 'admin'
ORDER BY id;

-- =============================================================================
-- MANUAL — si el tenant vigente NO es el de menor id
-- =============================================================================
-- Sustituí :TID por el id de clientes deseado y ejecutá solo el bloque que
-- corresponda (tenant_id o cliente_id), sin el DO de arriba.
--
-- DELETE FROM usuarios WHERE lower(trim(email))='admin' AND tenant_id = :TID;
-- INSERT INTO usuarios (tenant_id, email, nombre, password_hash, rol, activo)
-- VALUES (:TID, 'admin', 'Administrador', 'admin', 'admin', TRUE);
-- =============================================================================

-- =============================================================================
-- Producción: contraseña fuerte + bcrypt (solo API / login con bcrypt en app)
-- =============================================================================
--   node -e "require('bcryptjs').hash('TuClaveSegura',10).then(console.log)"
-- Pegá el resultado en password_hash. El login Neon directo en navegador no
-- validará bcrypt hasta que el código lo soporte en SQL.
-- =============================================================================
