# Oleada 3 — Búsqueda global, 2FA admin, zona de servicio, informes

## Front (módulos)

| Módulo | Función |
|--------|---------|
| `gn-oleada3-bootstrap.js` | Arranque (import desde `gn-oleada2-bootstrap.js`) |
| `gn-global-search-ui.js` | Buscar pedido · **Ctrl+K** · botón lupa en header |
| `gn-admin-2fa-login.js` | Modal código email si `requires_otp` |
| `gn-zona-servicio-ui.js` | Resumen bbox en Empresa / geocerca |
| `gn-reportes-email-indicator.js` | Badge en header si informe programado activo |

## API

| Ruta | Descripción |
|------|-------------|
| `GET /api/pedidos/buscar-global?q=` | Nº, NIS, medidor, teléfono, nombre, dirección |
| `GET /api/tenant-operativa/zona-servicio` | Bbox unión desde `tenant_localidades` |
| `POST /api/tenant-operativa/zona-servicio/verificar` | Body `{ lat, lng }` |
| `POST /api/auth/login` | Si `ADMIN_2FA_ENABLED=1` + EmailJS → `requires_otp` |
| `POST /api/auth/verify-login-otp` | Body `{ challenge_id, code }` → JWT |

Migraciones: `api/db/migrations/add_admin_login_otp.sql`

## 2FA (opcional)

En Render / `api/.env`:

```env
ADMIN_2FA_ENABLED=1
ADMIN_2FA_TTL_MIN=10
EMAILJS_PUBLIC_KEY=...
EMAILJS_SERVICE_ID=...
EMAILJS_TEMPLATE_ID_INFORME=...
EMAILJS_PRIVATE_KEY=...
```

Sin EmailJS o con flag apagado, el login admin sigue igual que antes.

## Pruebas

1. Logueado → **Ctrl+K** → buscar NIS o dirección → abrir detalle.
2. Admin → Empresa: ver nota de zona de servicio.
3. Con 2FA activo: login admin → email con código → modal.
4. Informe programado configurado → badge en barra superior.

SW shell **v234** / **1.8.63**.

made by leavera77
