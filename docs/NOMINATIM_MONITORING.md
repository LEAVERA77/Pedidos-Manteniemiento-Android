# Monitoreo Nominatim (producción)

## Endpoints de salud

| URL | Uso |
|-----|-----|
| `GET /api/geocode/health` | Ping desde panel y `status.html` (público) |
| `GET /api/admin/sistema-salud` | Admin: latencia y HTTP status |

## HTTPS en VM Oracle (recomendado)

1. Instalar **Caddy** delante de Nominatim (`:8080`).
2. Certificado Let's Encrypt para subdominio dedicado (p. ej. `nominatim.tu-dominio.com`).
3. En Render: `NOMINATIM_BASE_URL=https://nominatim.tu-dominio.com`.

## Alertas sugeridas

- Render cron cada 15 min → `GET /api/geocode/health`; alerta si `nominatim_reachable === false` > 3 veces.
- Disco VM > 85 % (índices Nominatim crecen).

made by leavera77
