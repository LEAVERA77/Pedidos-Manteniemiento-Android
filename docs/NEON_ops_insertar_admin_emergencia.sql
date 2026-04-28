-- =============================================================================
-- Neon — recrear usuario administrador cuando se borró de `usuarios`
--
-- El login del panel (GitHub Pages con Neon en el navegador) ejecuta SQL del tipo:
--   WHERE email = '<lo que escribís>' AND password_hash = '<contraseña>'
-- es decir, compara la contraseña en **texto plano** con la columna password_hash.
-- Por eso, para poder entrar con admin / admin en ese modo, password_hash debe
-- ser literalmente la cadena "admin" (solo recuperación / pruebas).
--
-- La API Node (POST /api/auth/login) acepta también texto plano si el hash no
-- empieza por $2a$ / $2b$ / $2y$ (ver api/routes/auth.js).
--
-- Cambiá tenant_id si tu único `clientes.id` no es 1.
--
-- made by leavera77
-- =============================================================================

DELETE FROM usuarios WHERE lower(trim(email)) = lower(trim('admin'));

INSERT INTO usuarios (tenant_id, email, nombre, password_hash, rol, activo)
VALUES (
    1,
    'admin',
    'Administrador',
    'admin',
    'admin',
    TRUE
);

SELECT setval(
    pg_get_serial_sequence('usuarios', 'id'),
    (SELECT COALESCE(MAX(id), 1) FROM usuarios)
);

SELECT id, tenant_id, email, nombre, rol, activo FROM usuarios ORDER BY id;

-- Si el usuario ya existía con hash bcrypt y solo usás API (sin Neon en browser),
-- podés poner hash bcrypt con Node; para el login **Neon en navegador** seguí
-- usando texto plano en password_hash o ajustá app.js (futuro).


-- =============================================================================
-- Producción: contraseña fuerte + hash bcrypt (API Node)
-- =============================================================================
--   node -e "require('bcryptjs').hash('TuClaveSegura',10).then(console.log)"
-- Pegá el resultado en password_hash y entrá por API; el login SQL directo
-- en browser no validará bcrypt hasta que el código lo soporte.
-- =============================================================================
