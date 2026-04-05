# Notificaciones a técnicos (Nexxo)

1. **Base de datos**: en Neon, ejecutá el script `docs/NEON_notificaciones_movil.sql`.
2. **Web / GitHub Pages**: el `index.html` permite al administrador, desde el mapa principal, el mapa del panel «Ubicaciones» o el detalle del pedido, elegir un usuario y **encolar** un aviso.
3. **Cierre remoto del pedido**: si un administrador (u otro usuario que no sea el técnico asignado) pasa el pedido a **Cerrado** desde la web conectada a Neon (`updPedido`) o desde la API (`PUT /api/pedidos/:id`), se inserta una fila en `notificaciones_movil` para el técnico asignado (mismo texto tipo «cerrado desde la central»). El técnico no recibe aviso si él mismo cierra el reclamo.
4. **Android**: la WebView registra el puente `AndroidLocalNotify`. Cada ~45 s (y al volver a la app) se leen filas no leídas de `notificaciones_movil` y se muestran como notificaciones del sistema. Solo entonces se marcan `leida = TRUE` (si el técnico entra solo por navegador web en PC, los avisos no se consumen hasta abrir la app Android).

**Permisos**: en Android 13+, la app solicita el permiso de notificaciones la primera vez.

**Límite sin FCM**: con la app cerrada o en reposo agresivo, el intervalo JS de 45 s no corre; WorkManager no garantiza avisos instantáneos (intervalo mínimo ~15 min en trabajo periódico, más las políticas de ahorro de batería del sistema). Al **volver a primer plano** se encola además un trabajo único que drena `notificaciones_movil` por JDBC (además del `pollNotificacionesMovil` en JS). Para entrega inmediata con la app totalmente cerrada haría falta **Firebase Cloud Messaging** y un backend que envíe FCM.

## WorkManager (pedidos nuevos)

WorkManager ejecuta cada ~15 minutos una consulta JDBC a la tabla `pedidos` (usa la misma `neon.connectionString` que la WebView en `assets/config.json`). Si el `MAX(id)` supera la marca guardada en `SharedPreferences`, se muestra una notificación local (canal `pmg_pedidos_workmanager`). La primera ejecución solo fija la marca sin notificar. Requiere red y el permiso de notificaciones en Android 13+.

## WorkManager (cola `notificaciones_movil`)

Otro trabajo periódico (~15 min, red) ejecuta `NotificacionesMovilPollWorker`: lee filas no leídas para el `usuario_id` de la sesión guardada en `SharedPreferences` (mismo origen que el bridge `AndroidSessionBridge`), muestra notificación en el canal `pmg_pedidos_avisos` (el mismo que el puente JS) y marca `leida = TRUE`. Así los avisos por asignación, mensaje manual del admin o **cierre remoto** pueden llegar aunque la WebView no esté ejecutando el timer de 45 s.
