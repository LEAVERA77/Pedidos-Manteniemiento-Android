# Notificaciones a técnicos (Pedidos MG)

1. **Base de datos**: en Neon, ejecutá el script `docs/NEON_notificaciones_movil.sql`.
2. **Web / GitHub Pages**: el `index.html` permite al administrador, desde el mapa principal, el mapa del panel «Ubicaciones» o el detalle del pedido, elegir un usuario y **encolar** un aviso.
3. **Android**: la WebView registra el puente `AndroidLocalNotify`. Cada ~45 s (y al volver a la app) se leen filas no leídas de `notificaciones_movil` y se muestran como notificaciones del sistema. Solo entonces se marcan `leida = TRUE` (si el técnico entra solo por navegador web en PC, los avisos no se consumen hasta abrir la app Android).

**Permisos**: en Android 13+, la app solicita el permiso de notificaciones la primera vez.

**Nota**: si la app está totalmente cerrada y el sistema la suspende, el intervalo de 45 s no corre hasta que el usuario abra la app de nuevo. Para avisos con la app cerrada haría falta Firebase Cloud Messaging y un backend que envíe FCM (fuera del alcance de este flujo basado solo en Neon).

## WorkManager (pedidos nuevos)

WorkManager ejecuta cada ~15 minutos una consulta JDBC a la tabla `pedidos` (usa la misma `neon.connectionString` que la WebView en `assets/config.json`). Si el `MAX(id)` supera la marca guardada en `SharedPreferences`, se muestra una notificación local (canal `pmg_pedidos_workmanager`). La primera ejecución solo fija la marca sin notificar. Requiere red y el permiso de notificaciones en Android 13+.
