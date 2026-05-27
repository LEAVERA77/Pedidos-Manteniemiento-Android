# Oleada 2 — Offline visible, SW, auditoría, seguridad

## Front (módulos, sin inflar `app.js`)

| Archivo | Función |
|---------|---------|
| `modules/gn-oleada2-bootstrap.js` | Arranque oleada 2 (import desde `gn-trust-ui-bootstrap.js`) |
| `modules/gn-offline-banner-enhanced.js` | Texto de cola en `#offline-banner` |
| `modules/gn-sw-update-prompt.js` | Banner “Recargar” ante nueva versión SW |
| `modules/gn-admin-operacion-audit-ui.js` | Resumen SLA + tabla auditoría en Estadísticas |
| `seguridad.html` | Página pública de prácticas de seguridad |
| `offline.js` | Evento `pmg-offline-queue-changed` |

## API

| Ruta | Rol |
|------|-----|
| `GET /api/admin/operacion-audit?limit=N` | Admin — últimos registros |
| `PUT /api/pedidos/:id` | Registra auditoría en cambio de estado/avance |
| `GET /api/estadisticas/sla-alertas` | Incluye `resumen` (abiertos, cerrados 7d, alertas) |

Migración SQL: `api/db/migrations/add_operacion_audit_log.sql` (la API también crea la tabla al primer uso).

## Deploy Pages

Incluir `seguridad.html` en el workflow (raíz `dist/`). SW shell **v232** / **1.8.61**.

## Pruebas manuales

1. Admin → Estadísticas: ver resumen SLA, alertas y auditoría (tras cambiar estado de un pedido).
2. Modo avión / offline: barra roja con contador de cola; al volver online, aviso naranja si queda cola.
3. Tras deploy: banner azul de actualización SW → Recargar.
4. Footer → Seguridad / Estado abren páginas estáticas.

made by leavera77
