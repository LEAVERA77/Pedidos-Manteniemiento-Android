# Oleada 5 — Calidad geográfica, atajos y guard de zona

## API

| Ruta | Descripción |
|------|-------------|
| `GET /api/admin/geo-calidad` | % pedidos con coords, abiertos sin pin |
| `POST /api/tenant-operativa/zona-servicio/verificar` | Comprueba lat/lng vs bbox del tenant (ya existía) |

Servicio: `api/services/geoCalidadMetricas.js`.

## Front

| Módulo | Función |
|--------|---------|
| `gn-geo-calidad-admin-ui.js` | Tarjeta en Estadísticas (admin) |
| `gn-keyboard-shortcuts-help.js` | Botón teclado en header + modal `?` |
| `gn-zona-servicio-pedido-guard.js` | `gnConfirmarSiFueraDeZonaServicio` antes de alta / coords manual |
| `gn-oleada5-bootstrap.js` | Arranque oleada 5 (desde oleada 4) |

Integración: `gn-features-bootstrap.js` monta el bloque geo y lo refresca con ranking/SLA.

Hooks en `app.js` (mínimos): submit `#pf` y `persistirCoordsManualPedidoPanel`.

SW **v237** / **1.8.66**.

made by leavera77
