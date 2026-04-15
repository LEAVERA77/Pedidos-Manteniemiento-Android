# WhatsApp: volver a Meta (Cloud API) u otro proveedor

El envío y el bot usan **`WHATSAPP_PROVIDER`** (`meta` | `whapi` | `waha` | `evolution`). El valor por defecto en código y en `.env.example` es **`meta`**.

## Volver a Meta sin reescribir código

1. En Render (o tu `.env`):  
   `WHATSAPP_PROVIDER=meta`
2. Configurá **`META_ACCESS_TOKEN`**, **`META_PHONE_NUMBER_ID`**, **`META_APP_SECRET`**, **`META_WEBHOOK_VERIFY_TOKEN`** como antes.
3. En Meta Developers → tu app → WhatsApp → **Webhook**: URL  
   `https://<tu-api>/api/webhooks/whatsapp/meta`  
   y el verify token igual a `META_WEBHOOK_VERIFY_TOKEN`.
4. Las variables **Whapi** (`WHAPI_*`) pueden quedar vacías; no se usan si el proveedor no es `whapi`.

**Rutas que no se tocan al cambiar de proveedor**

- Webhook Meta: `api/routes/webhooksMeta.js` → `POST /api/webhooks/whatsapp/meta`
- Graph y normalización AR: `api/services/metaWhatsapp.js`
- Resolución de tenant por `phone_number_id`: `api/services/metaTenantWhatsapp.js`

**Envío multitenant (Meta)**

- `api/services/whatsappService.js`: si el proveedor no es whapi/waha/evolution, cae en la **rama Meta** (`sendWhatsAppTextWithCredentials`).

**Whapi** (opcional)

- Webhook: `POST /api/webhooks/whatsapp/whapi`  
- Envío: `api/services/whapiWhatsapp.js`  
- Solo activo con `WHATSAPP_PROVIDER=whapi`.

made by leavera77
