# Variables de entorno — Render (API GestorNova / Nexxo)

**Servicio típico:** `nexxo-api-418k.onrender.com` (ajustar si el nombre del servicio cambió).

## WhatsApp — Baileys, Whapi o Meta

| Variable | Uso |
|----------|-----|
| **`WHATSAPP_PROVIDER`** | Nombre **exacto** (sin typos). Valores: `baileys`, `whapi`, `meta`, `waha`, `evolution`. Si no está definida en Render, el código usa **`meta`** por defecto. |
| **Baileys** | `WHATSAPP_PROVIDER=baileys`; configurar **`WHATSAPP_LINK_TOKEN`**, secreto aleatorio de al menos 32 caracteres, distinto de `WHATSAPP_WEBHOOK_TOKEN`. Sin él, `/baileys/qr`, `/status`, `/select-tenant` y `/reset-session` rechazan el acceso. El formulario exige confirmar dos veces el ID de tenant; resetear la sesión ya no cambia el tenant. |
| **Whapi** | `WHATSAPP_PROVIDER=whapi` + `WHAPI_API_URL`, `WHAPI_API_KEY`, `WHATSAPP_WEBHOOK_TOKEN` (y opcional `WHAPI_CHANNEL_ID`). Webhook: `POST /api/webhooks/whatsapp/whapi`. |
| **Meta** | `WHATSAPP_PROVIDER=meta` + `META_*` (token, phone id, app secret, verify token). Webhook: `POST /api/webhooks/whatsapp/meta`. |

### Configuración de vinculación Baileys

1. En Render → Environment de la API, definir `WHATSAPP_LINK_TOKEN` con un secreto aleatorio único (por ejemplo, generar localmente con `openssl rand -hex 32`). No enviarlo por chat ni incluirlo en Git. Debe ser distinto de `WHATSAPP_WEBHOOK_TOKEN`.
2. Desplegar la API y abrir mediante HTTPS `/api/webhooks/whatsapp/baileys/qr?token=<secreto>`, confirmar el mismo ID de tenant en ambos campos y verificar el negocio antes de escanear. El enlace contiene un secreto: no compartirlo, limitar el acceso a operadores confiables y evitar registros del proxy que incluyan query strings.
3. El tenant existente y la sesión ya conectada no se reinician por este cambio. Para cambiar de tenant usar el formulario; `GET ?apply=1` ya no cambia datos. La página es `no-store`, `no-referrer` y limita intentos fallidos.

El 2FA existente es por correo y opcional (`ADMIN_2FA_ENABLED`); no es un autenticador TOTP. No activarlo obligatoriamente hasta completar el enrolamiento, recuperación y cierre de vías de autenticación alternativa.

**Health Check en Render:** configurar **Health Check Path** en `/health` (liviano, sin golpear Neon cada 5 s). `/health/db` cuenta además con caché de 60 s (`HEALTH_DB_CACHE_MS`) para proteger Neon si sigue configurado como health check.

Plantilla local: `api/.env.example` (actualmente **`WHATSAPP_PROVIDER=whapi`**). Guía: `api/docs/CAMBIAR_PROVEEDOR_WHATSAPP.md`.

## Migración Nominatim (Vultr → Oracle)

### Cambio obligatorio

| Variable            | Valor anterior (referencia)     | Valor nuevo                          |
|--------------------|----------------------------------|--------------------------------------|
| `NOMINATIM_BASE_URL` | `http://45.76.3.146:8080` (Vultr) | `http://167.234.235.76:8080` (Oracle) |

**Sin barra final** en la URL base (la API concatena `/search`, `/reverse`, etc.).

### Variables que suelen mantenerse (revisar en el dashboard)

- `NOMINATIM_WHATSAPP_SEARCH_MODE` — p. ej. `free-form` para el pipeline WhatsApp.
- `NOMINATIM_FETCH_TIMEOUT_MS` — timeout de fetch hacia Nominatim.
- `NOMINATIM_FROM_EMAIL` / `NOMINATIM_FROM` — **recomendado** en producción (contacto OSM). Si no están definidos, la API **no** envía `From` (un `From` con dominio `.local` u opcional mal validado delante del proxy puede causar **HTTP 406**).
- `NOMINATIM_ACCEPT` — opcional; por defecto `*/*`.
- `NOMINATIM_DISABLE_406_RETRY` — si `1`, no reintenta tras 406 con cabeceras mínimas (solo diagnóstico).
- `DEBUG_NOMINATIM` — solo desarrollo; en producción suele ir vacío o `0`.
- Resto de secretos Neon, Meta, JWT, etc. **no tocar** salvo checklist de migración.

## Cómo aplicar

1. **Render Dashboard** → Service → **Environment** → editar `NOMINATIM_BASE_URL`.
2. **Save** → se dispara **redeploy** automático (o usar **Manual Deploy**).

Alternativa CLI (si tenés `render` CLI y token):

```bash
# Ejemplo conceptual — ajustar service id y sintaxis oficial de Render CLI
# render services env set <service-id> NOMINATIM_BASE_URL=http://167.234.235.76:8080
```

## Tras HTTPS en Oracle (opcional)

Cuando tengas dominio + Caddy + Let's Encrypt (ver `ORACLE_HTTPS_SETUP.md`), actualizar a:

`NOMINATIM_BASE_URL=https://nominatim.tu-dominio.com`

y volver a **Save** + redeploy.

## Rollback (contingencia)

Volver temporalmente a:

`NOMINATIM_BASE_URL=http://45.76.3.146:8080`

solo si el VPS Vultr sigue activo y accesible; luego redeploy. Ver `MIGRATION_VULTR_TO_ORACLE.md` § Plan de contingencia.

## Informes por email (API — Render)

| Variable | Obligatoria | Uso |
|----------|-------------|-----|
| `EMAILJS_PUBLIC_KEY` | Sí | Public Key (ya la tenés) |
| `EMAILJS_SERVICE_ID` | Para cron/API | Mismo valor que secret GitHub `EMAILJS_SERVICE_ID` |
| `EMAILJS_TEMPLATE_ID` | Para cron/API | Mismo valor que secret GitHub `EMAILJS_TEMPLATE_ID` |

Con **solo** `EMAILJS_PUBLIC_KEY` en Render, **«Enviar ahora»** en la web admin funciona igual (usa `config.json` de Pages con las tres claves).

Plantilla EmailJS (Subject `{{email_subject}}`, Content `{{email_body}}`, To `{{to_email}}`) para informes y reset unificado.

En [EmailJS](https://www.emailjs.com/) → **Security** → permitir API desde servidor si usás envío solo por API.

## Rendimiento y reducción de `network transfer` en Neon (Caché Híbrida L1 + Redis L2)

El backend incorpora de serie una capa de caché híbrida (`api/services/neonQueryCache.js`) con **LRU en memoria (L1)** + **Singleflight** (coalescing de ráfagas concurrentes) + **invalidación automática por tabla** en `INSERT`/`UPDATE`/`DELETE`/DDL y transacciones, además de compresión **gzip** HTTP.

Para compartir caché entre reinicios o múltiples instancias en Render, podés conectar opcionalmente **Render Key Value (Redis)** o **Upstash Redis**:

| Variable | Por defecto | Uso |
|----------|-------------|-----|
| `REDIS_URL` *(o `UPSTASH_REDIS_URL` / `KV_URL`)* | *(vacío → usa L1 en memoria)* | Cadena `redis://` o `rediss://` para activar la capa L2 distribuida |
| `NEON_QUERY_CACHE_ENABLED` | `true` | `false` desactiva la caché SQL en servidor |
| `NEON_CACHE_MAX_ENTRIES` | `600` | Máximo de consultas almacenadas en L1 |
| `NEON_CACHE_MAX_MB` | `32` | Tope de memoria RAM para L1 |
| `NEON_CACHE_TTL_SCHEMA_SEC` | `1800` | TTL (s) para `information_schema` / `pg_catalog` |
| `NEON_CACHE_TTL_GEO_SEC` | `900` | TTL (s) para localidades y calles normalizadas |
| `NEON_CACHE_TTL_CATALOG_SEC` | `300` | TTL (s) para catálogos (`socios_catalogo`, `distribuidores`, `subestaciones_catalogo`, `clientes`, `configuracion`) |
| `NEON_CACHE_TTL_OPERATIONAL_SEC` | `10` | TTL (s) para tablas operativas (`pedidos`, `incidencias`, `notificaciones_movil`) con invalidación inmediata al escribir |

Métricas en vivo para administradores: `GET /api/admin/cache/stats` y limpieza manual `POST /api/admin/cache/flush`.

---

`made by leavera77`
