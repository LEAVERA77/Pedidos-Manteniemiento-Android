# Runbook de operación — GestorNova / Pedidos-MG / Nexxo

Guía única para desplegar, sincronizar repos y diagnosticar lo más frecuente. Los secretos **no** van al Git público.

## Repos y roles

| Repo | Uso |
|------|-----|
| [Pedidos-Manteniemiento-Android](https://github.com/LEAVERA77/Pedidos-Manteniemiento-Android) (Nexxo local) | App Android, `app/src/main/assets/` como fuente del front empaquetado, carpeta `api/` |
| [Pedidos-MG](https://github.com/LEAVERA77/Pedidos-MG) | PWA/GitHub Pages, mismo front en raíz, carpeta `api/` + workflow Pages |

**Paridad:** tras cambios en front, ejecutar desde Nexxo:

`.\scripts\sync-assets-to-pedidos-mg.ps1`

Luego en el clon de Pedidos-MG: `git add`, `commit`, `push` (no subir `config.json`).

Tras cambios en **API**, copiar `Nexxo/api/` → `Pedidos-MG/api/` (o viceversa según dónde editaste) y subir **un** commit coherente en el repo que despliega Render.

## GitHub Pages (Pedidos-MG)

1. **Settings → Secrets → Actions:** `NEON_CONNECTION_STRING`, `API_BASE_URL`, opcionales EmailJS.
2. **Pages → Source:** GitHub Actions.
3. Push a `main` → esperar workflow **Deploy GitHub Pages** en **Actions**.

Sitio típico: `https://leavera77.github.io/Pedidos-MG/`

## API Node (Render u otro)

1. **Root directory** o servicio apuntando a `api/`.
2. Variables como en `api/.env.example`: `DATABASE_URL` / `DB_CONNECTION`, `META_*`, JWT secret, CORS/orígenes si aplica.
3. Tras push: **Manual Deploy** o auto-deploy según configuración.
4. Webhook Meta: `https://<tu-api>/api/webhooks/whatsapp/meta` con el mismo verify token que `META_WEBHOOK_VERIFY_TOKEN`.

## Neon (PostgreSQL)

- Cadena en secretos Actions (Pages) y en `.env` de Render; **no** en commits.
- Migraciones SQL opcionales en `docs/migrations/` (ej. `NEON_cliente_opinion_pending.sql`). Si la API arranca sin la tabla, el servicio intenta `CREATE TABLE IF NOT EXISTS` al primer uso; en entornos sin permiso DDL, ejecutar el SQL a mano en Neon.

## Android Studio

- `app/src/main/assets/config.example.json` → `config.json` local (gitignored).
- `WEB_APP_URL` en Gradle: Pages o `file:///android_asset/index.html`.
- Si el logcat muestra `unknown package` / `Could not find apks`: instalar con **Run** en un emulador/dispositivo online; **Build → Clean** si hace falta.

## CORS y orígenes

Cualquier origen desde el que cargue el front (dominio Pages, `file://` en debug) debe estar permitido en la API si el navegador llama a `API_BASE_URL`. Revisar middleware CORS en `api/server.js` al cambiar dominios.

## WhatsApp / Meta

- Tokens y phone number ID por tenant en `clientes.configuracion` o env; rotar si se filtran.
- **Opiniones post-cierre:** persistidas en `cliente_opinion_pending` (Neon); ver `docs/API_SQL_PARIDAD.md` y migración en `docs/migrations/`.

## Rotación de incidentes

| Síntoma | Qué revisar |
|---------|-------------|
| PWA sin datos / login | `API_BASE_URL`, CORS, salud de Render, Neon |
| WA no envía | Logs Render, `META_*`, límites Meta, teléfono normalizado |
| Opinión no se guarda | Tabla `cliente_opinion_pending`, logs `[whatsappClienteOpinion]` |
| APK vieja | `versionCode`, origen de la URL del WebView |

## Seguridad

- No commitear `config.json`, `.env`, keystores.
- Si hubo filtración: rotar Neon, Meta y JWT; ver `SECURITY.md` en repos.
