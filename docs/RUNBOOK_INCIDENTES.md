# Runbook — incidentes GestorNova

## API caída (Render)

1. Dashboard Render → servicio `pedidosmg-api` → Logs.
2. Probar `GET https://<host>/health` y `/health/db`.
3. Si Neon: revisar límites/conexiones en panel Neon.

## Login / CORS

1. `config.json` en Pages: `api.baseUrl` debe coincidir con host Render.
2. Variable `CORS_ORIGIN` en Render debe incluir `https://leavera77.github.io`.

## Nominatim / geocodificación

1. `GET /api/geocode/health`.
2. Ver `docs/NOMINATIM_MONITORING.md`.
3. Rate limit OSM: revisar `NOMINATIM_BASE_URL` propio.

## WhatsApp

1. Meta: token y webhook en Render.
2. Cola `notificaciones_movil` no sustituye al bot.

## App Android no actualiza UI

1. Service worker: recarga fuerte o banner SW.
2. `GET /api/app-version` vs APK instalada.

made by leavera77
