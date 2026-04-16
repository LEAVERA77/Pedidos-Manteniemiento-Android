# Variables de entorno — Render (API GestorNova / Nexxo)

**Servicio típico:** `nexxo-api-418k.onrender.com` (ajustar si el nombre del servicio cambió).

## WhatsApp — Whapi vs Meta

| Variable | Uso |
|----------|-----|
| **`WHATSAPP_PROVIDER`** | Nombre **exacto** (sin typos). Valores: `whapi`, `meta`, `waha`, `evolution`. Si no está definida en Render, el código usa **`meta`** por defecto. |
| **Whapi** | `WHATSAPP_PROVIDER=whapi` + `WHAPI_API_URL`, `WHAPI_API_KEY`, `WHATSAPP_WEBHOOK_TOKEN` (y opcional `WHAPI_CHANNEL_ID`). Webhook: `POST /api/webhooks/whatsapp/whapi`. |
| **Meta** | `WHATSAPP_PROVIDER=meta` + `META_*` (token, phone id, app secret, verify token). Webhook: `POST /api/webhooks/whatsapp/meta`. |

Plantilla local: `api/.env.example` (actualmente **`WHATSAPP_PROVIDER=whapi`**). Guía: `api/docs/CAMBIAR_PROVEEDOR_WHATSAPP.md`.

## Meta Cloud API — qué variable usa Render y cómo se elige el `phone_number_id`

Si no definís `WHATSAPP_PROVIDER`, el código usa **`meta`** por defecto (`api/services/whatsappService.js` → `whatsappProvider()`).

### Variables en Render (globales)

| Variable | Uso |
|----------|-----|
| **`META_ACCESS_TOKEN`** | Token de acceso a Graph para enviar mensajes (`/{phone-number-id}/messages`). |
| **`META_PHONE_NUMBER_ID`** | Identificador del número de WhatsApp Business en Meta; **debe ser el mismo** que envía Meta en el webhook como `metadata.phone_number_id` (en logs suele verse como `phone_number_id: '1030098870192233'`). |
| **`META_APP_SECRET`** | Valida la firma `X-Hub-Signature-256` del webhook (`api/routes/webhooksMeta.js`). |
| **`META_WEBHOOK_VERIFY_TOKEN`** | Token de verificación del GET de suscripción del webhook. |
| **`WHATSAPP_BOT_TENANT_ID`** | Tenant por defecto (**default `1`**) cuando el `phone_number_id` del webhook **coincide** con `META_PHONE_NUMBER_ID` del entorno pero **no** hay fila en Neon que mapee ese ID (`api/services/metaTenantWhatsapp.js`). |
| **`META_GRAPH_API_VERSION`** | Opcional (p. ej. `v21.0`). Ver `api/services/metaWhatsapp.js`. |
| **`META_WHATSAPP_ARGENTINA_STRIP_MOBILE_9`** / **`META_WHATSAPP_ARGENTINA_INSERT_MOBILE_9`** | Normalización 549 ↔ 54… al hablar con Graph (Argentina). Ver `api/services/metaWhatsapp.js` y `api/.env.example`. |

### Overrides por tenant en Neon (`clientes.configuracion`, JSON)

El mismo archivo puede definir credenciales **por cliente** (multitenant). Claves que usa el código (`getWhatsAppCredentialsForTenant` / `getWhatsAppCredentialsByMetaPhoneNumberId` en `api/services/whatsappService.js`):

- **Token:** `meta_access_token` o `META_ACCESS_TOKEN`
- **Phone number ID:** `meta_phone_id` o `meta_phone_number_id` o `META_PHONE_NUMBER_ID`

Si el tenant tiene **token y phone en configuración**, esas credenciales **ganan** sobre `META_ACCESS_TOKEN` / `META_PHONE_NUMBER_ID` de Render para envíos “de tenant” (p. ej. notificaciones de pedido).

### Bot (respuesta al webhook de Meta): orden real

`sendBotWhatsAppText` arma el envío así:

1. **`graphPhoneId`**: primero el `phone_number_id` que vino en el **webhook** (`webhookPhoneNumberId`). Es el path correcto en Graph: `POST /{phone-number-id}/messages`.
2. **Token** (`getWhatsAppCredentialsByMetaPhoneNumberId(pid)`):
   - Si existe un **`clientes`** activo cuyo `configuracion->>'meta_phone_id'` o `'meta_phone_number_id'` **iguala** ese `pid` → token desde **`configuracion.meta_access_token`** (o clave `META_ACCESS_TOKEN` dentro del JSON). Log: `tokenSource: 'cliente_config'` (si hay token) o `'cliente_config_no_token'`.
   - Si **no** hay fila en Neon pero **`META_PHONE_NUMBER_ID` (env) === `pid`** → token desde **`META_ACCESS_TOKEN`** y tenant desde **`WHATSAPP_BOT_TENANT_ID`**. Log: **`tokenSource: 'env_phone_match'`** (como en tus logs de Render).
3. Si aún no hay token, cae a **`getWhatsAppCredentialsForTenant(tenantId)`** (Neon + env mezclados como arriba).

### Diagnóstico rápido (error 131030 “allowed list”)

- Si en logs ves **`tokenSource: 'cliente_config'`**: Render puede tener un `META_ACCESS_TOKEN` que **no se usa** para el bot; el token activo es el de **Neon**. La lista de destinatarios de prueba en Meta debe coincidir con **ese** token / WABA.
- Si ves **`env_phone_match`**: el token es **`META_ACCESS_TOKEN`** de Render; el `phone_number_id` es el del webhook y coincide con **`META_PHONE_NUMBER_ID`** del entorno.

Referencia de código: `api/services/whatsappService.js` (`getWhatsAppCredentialsByMetaPhoneNumberId`, `sendBotWhatsAppText`, `getWhatsAppCredentialsForTenant`) y `api/services/metaTenantWhatsapp.js` (`resolveTenantIdByMetaPhoneNumberId`).

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

---

`made by leavera77`
