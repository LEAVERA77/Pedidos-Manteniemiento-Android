-- =============================================================================
-- Neon — recrear usuario administrador cuando se borró de `usuarios`
--
-- El login (POST /api/auth/login) compara por columna **email** (texto exacto).
-- El placeholder del panel dice "Email (usuario)": lo que escribís ahí debe
-- coincidir con `usuarios.email` en la base.
--
-- Este script inserta un admin en tenant_id = 1 con:
--   email:    admin
--   password: admin   (bcrypt $2a$10$… generado con bcryptjs cost 10)
--
-- Cambiá tenant_id si tu único `clientes.id` no es 1.
-- Tras INSERT: ingresá email "admin" y contraseña "admin", luego cambiá la clave.
--
-- made by leavera77
-- =============================================================================

-- Contraseña en texto plano: admin
-- (hash bcrypt; no lo reutilices en producción real)
-- Si preferís email tipo admin@cooperativa.org, cambiá la columna email abajo
-- y usá ese valor en el login.

DELETE FROM usuarios WHERE lower(trim(email)) = lower(trim('admin'));

INSERT INTO usuarios (tenant_id, email, nombre, password_hash, rol, activo)
VALUES (
    1,
    'admin',
    'Administrador',
    '$2a$10$jRuwUecLwquqt3YW5sJOrurLb5ZOx2galnxxWcj/FdMNIiMutjCYO',
    'admin',
    TRUE
);

-- Si tu tabla tiene business_type NOT NULL sin default, descomentá y ajustá:
-- UPDATE usuarios SET business_type = NULL WHERE email = 'admin';

SELECT setval(
    pg_get_serial_sequence('usuarios', 'id'),
    (SELECT COALESCE(MAX(id), 1) FROM usuarios)
);

SELECT id, tenant_id, email, nombre, rol, activo FROM usuarios ORDER BY id;

-- Si ya habías ejecutado una versión vieja de este script y el login falla,
-- corregí solo el hash (contraseña sigue siendo admin):
-- UPDATE usuarios SET password_hash = '$2a$10$jRuwUecLwquqt3YW5sJOrurLb5ZOx2galnxxWcj/FdMNIiMutjCYO'
-- WHERE lower(trim(email)) = lower(trim('admin'));


-- =============================================================================
-- Alternativa (recomendada en producción): email válido + contraseña fuerte
-- =============================================================================
-- INSERT ... email 'admin@tu-dominio.org' y generá hash con Node:
--   node -e "require('bcryptjs').hash('TuClaveSegura',10).then(console.log)"
-- =============================================================================
