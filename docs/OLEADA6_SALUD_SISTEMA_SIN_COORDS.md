# Oleada 6 — Salud del sistema y pedidos sin coordenadas

## API

| Ruta | Descripción |
|------|-------------|
| `GET /api/admin/sistema-salud` | Estado API, BD, Nominatim y commit de deploy |
| `GET /api/admin/pedidos-sin-coords?limit=30` | Pedidos abiertos sin lat/lng válidos |
| `GET /api/geocode/health` | Ping Nominatim (público; reutiliza `nominatimHealthPing.js`) |

Servicios: `adminSistemaSalud.js`, `pedidosSinCoordsAdmin.js`, `nominatimHealthPing.js`.

## Front

| Módulo | Función |
|--------|---------|
| `gn-admin-sistema-salud-ui.js` | Tarjeta en Admin → Empresa |
| `gn-pedidos-sin-coords-modal.js` | Listado desde Estadísticas → geo-calidad |
| `gn-oleada6-bootstrap.js` | Arranque oleada 6 |

`status.html` incluye fila **Geocodificación (Nominatim)** vía `/api/geocode/health`.

SW **v238** / **1.8.67**.

made by leavera77
