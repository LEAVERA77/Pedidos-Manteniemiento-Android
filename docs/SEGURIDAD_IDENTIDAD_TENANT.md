# Verificación fresca de identidad y preparación de tenant estricto

## Qué cambia

- En rutas que usan `authMiddleware`, el servidor lee usuario, rol y estado directamente de la base, omitiendo caché L1/L2 y singleflight. La consulta de asignación del usuario a entidad también omite caché. Esto reduce el uso de información obsoleta cuando se cambia o desactiva una cuenta por fuera de la API o en otra instancia.
- Esas consultas adicionales aumentan la carga y podrían incrementar la latencia. Vigilar conexiones y tiempos en preproducción antes de ampliar el uso.
- `AUTH_STRICT_TENANT=true` activa una validación adicional: exige una asignación positiva a una entidad existente y activa; exige que el `tenant_id` del JWT coincida con la base; ante un error de base no asigna la entidad 1. **Está desactivada por defecto** para no interrumpir usuarios, flujos de alta o versiones antiguas sin validación previa.
- Si hay una columna `usuarios.tenant_id`, se usa esa columna; solo si no existe se usa `usuarios.cliente_id`. Si ambas existen, no se usa la segunda como respaldo.

## Limitaciones críticas

- El modo legado sigue usando entidad 1 como respaldo cuando falta asignación o hay error; el despliegue del código **no activa** el modo estricto.
- Ni el modo estricto ni la lectura fresca aíslan los datos por sí solos. El SQL genérico y el acceso directo a Neon siguen abiertos; las rutas alternativas, soporte compartido, otras funciones que resuelven tenant por separado y el offline no están cubiertos por esta mejora. No prometer aislamiento entre entidades ni revocación total.
- La revocación del usuario o un cambio de rol se ve en la próxima comprobación online de este middleware. Las solicitudes ya autorizadas pueden seguir en curso y no se revocan automáticamente tokens o credenciales offline. Cambiar la contraseña no invalida automáticamente todas las sesiones.
- La comprobación usa consultas separadas; no constituye una transacción de autorización y mutación, ni elimina todas las carreras de cambios concurrentes. Tampoco valida el aislamiento de cada ruta o de la caché de datos.
- Las rutas que usan `authMiddleware` pasan por este control, pero el login, el onboarding, los webhooks, rutas públicas y cualquier acceso alternativo requieren su propia revisión.

## Diagnóstico antes de activar

Realizarlo con un operador autorizado. No compartir contraseñas, tokens, cadenas de conexión ni datos personales. La consulta siguiente muestra **solo cantidades** y presupone que existen `usuarios.tenant_id`, `clientes.id` y `clientes.activo`. Si la primera consulta no devuelve `tenant_id`, no ejecutar la segunda sin adaptar y revisar previamente el esquema.

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'usuarios'
  AND column_name IN ('tenant_id', 'cliente_id', 'activo');
```

```sql
SELECT
  COUNT(*) AS usuarios_activos,
  COUNT(*) FILTER (WHERE u.tenant_id IS NULL OR u.tenant_id < 1) AS sin_tenant_valido,
  COUNT(*) FILTER (WHERE u.tenant_id > 0 AND c.id IS NULL) AS entidad_inexistente,
  COUNT(*) FILTER (WHERE c.id IS NOT NULL AND c.activo = FALSE) AS entidad_inactiva
FROM usuarios u
LEFT JOIN clientes c ON c.id = u.tenant_id
WHERE u.activo = TRUE;
```

Cantidades iguales a cero no prueban por sí solas la compatibilidad. Corregir asociaciones únicamente tras verificar con responsables y respaldo. No reasignar automáticamente todos los usuarios a la entidad 1.

## Activación gradual y pruebas

1. Verificar migraciones, respaldo restaurable, usuarios activos y funciones de alta, vinculación o cambio de entidad. Verificar los JWT emitidos por todos los clientes y rutas: el estricto requiere un `tenant_id` positivo y correcto. Una cuenta reasignada con token antiguo debe iniciar sesión de nuevo; el onboarding que cambia entidad podría interrumpirse.
2. Probar primero en un entorno aislado con al menos dos entidades y roles admin/técnico: entradas, rutas habituales, reasignaciones, baja, errores de base, arranque y sincronización de la cola offline. Medir latencia y conexiones. No instalar como política de producción si faltan estas pruebas.
3. Solo tras aprobar esas verificaciones, programar activación de `AUTH_STRICT_TENANT=true` en Render. Guardar variables puede disparar un despliegue. Coordinar horario, sesiones y plan de contingencia; monitorizar y verificar las rutas más usadas. La opción no modifica por sí misma la base ni la app offline.
4. Ante una interrupción, el retorno a `false` restaura el comportamiento legado **y también el riesgo de fallback a entidad 1**; debe tratarse como medida temporal de incidente, no como solución permanente. No activar el modo estricto como sustituto de la migración SQL y el aislamiento de base.

## Prueba con PostgreSQL local descartable

La prueba `api/tests/authFreshTenant.postgres.test.js` solo corre si se configura `AUTH_TEST_DATABASE_URL` con una base local llamada exactamente `gestornova_security_test`. Crea y elimina sus propias tablas `usuarios` y `clientes`; usar una base vacía y descartable, nunca una instalación real. Sin esta variable la prueba se omite. La prueba no representa una validación de seguridad de todas las rutas.
