# Migración gradual: notificaciones propias

## Qué cambia

Con la API configurada, el sondeo web/Android consulta `GET /api/notificaciones/pendientes` y marca una notificación mediante `PATCH /api/notificaciones/:id/leer`. La API obtiene la identidad de la sesión, ignora los identificadores de usuario enviados por el cliente y consulta/marca solamente filas del usuario autenticado. Las consultas son parametrizadas; la lista de pendientes omite la caché. Si la sesión cambia mientras llega la lista, el cliente descarta esa respuesta.

Cuando hay API configurada, un error de red, esquema, token o autorización **no provoca un retorno a SQL**: las notificaciones quedan pendientes hasta poder volver a consultar. Si no hay API configurada, se conserva temporalmente el cliente SQL heredado para no cortar instalaciones antiguas; esa vía no es una frontera segura. El envío y otras operaciones de notificaciones aún utilizan SQL genérico.

## Límites importantes

- Este cambio protege únicamente estas dos rutas y el cliente actualizado. El gateway SQL y acceso directo siguen activos y pueden eludir los controles de estas rutas. No afirmar aislamiento integral de tenants ni que los usuarios no puedan ver otras tablas.
- Una API antigua, un servidor no disponible, un cliente antiguo o un esquema incompleto pueden impedir las notificaciones. La operación offline de técnicos y su cola de pedidos no se modifica; el sondeo de notificaciones sigue requiriendo conectividad.
- El servidor usa el id verificado del usuario, pero la verificación y la actualización son consultas separadas, no una operación transaccional integral que impida cualquier carrera durante una baja o reasignación.
- Las notificaciones en WebView, Android, navegador y servicios externos deben probarse en la instalación real. No se garantiza entrega única ni instantánea ni que el dispositivo tenga la app actualizada.

## Antes de publicar

Con un operador autorizado y sin compartir información sensible, comprobar que la tabla y columnas existen:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'notificaciones_movil'
  AND column_name IN ('id','usuario_id','titulo','cuerpo','pedido_id','leida')
ORDER BY column_name;
```

Si falta la tabla o alguna columna, diagnosticar y respaldar antes de modificar el esquema; no ejecutar migraciones a ciegas. Revisar también el tipo booleano de `leida`, permisos de la API para `SELECT` y `UPDATE`, usuarios, disponibilidad de JWT y procedimientos de respaldo/restauración.

Publicar API y cliente coordinadamente. Si GitHub Pages se actualiza antes de que Render termine, el cliente actualizado no usará el gateway como respaldo y las notificaciones podrán quedar temporalmente pendientes. Verificar commit de API antes de probar. Probar con cuentas y notificaciones de prueba de dos entidades y dos usuarios de la misma entidad: el usuario solo debe consultar y marcar las suyas. Comprobar luego notificaciones reales autorizadas y un dispositivo Android sin exponer tokens o datos personales.

La prueba `api/tests/notificacionesPostgres.test.js` se ejecuta únicamente con `NOTIF_TEST_DATABASE_URL` apuntando a una base local vacía llamada `gestornova_notifications_test`. Crea y elimina tablas de prueba; jamás usar la base real. Sin esa variable se omite. Una prueba local no garantiza la seguridad integral del sistema ni sustituye las pruebas de producción controladas.
