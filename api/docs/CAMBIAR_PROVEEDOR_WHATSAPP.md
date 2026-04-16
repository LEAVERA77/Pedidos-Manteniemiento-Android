# WhatsApp: Whapi, Meta (Cloud API) u otro proveedor

El envío y el bot usan **`WHATSAPP_PROVIDER`** (`whapi` | `meta` | `waha` | `evolution`).

- **Nombre exacto de la variable:** `WHATSAPP_PROVIDER` (coincide con `process.env` en `api/services/whatsappService.js`). No uses variantes mal escritas o no tendrá efecto.
- **Si no definís la variable en el servidor:** si hay **`WHAPI_API_KEY`**, se usa **`whapi`**; si no, **`meta`**. Para forzar uno u otro con ambas integraciones configuradas, definí siempre **`WHATSAPP_PROVIDER`**. En **`api/.env.example`** se documenta **`whapi`** para campo.

## Usar Whapi (Whapi.cloud) — plantilla actual

1. En Render (o tu `.env` local):  
   `WHATSAPP_PROVIDER=whapi`
2. Definí **`WHAPI_API_URL`** (típico `https://gate.whapi.cloud`), **`WHAPI_API_KEY`**, y el webhook compartido **`WHATSAPP_WEBHOOK_TOKEN`** (misma cadena en la URL `?token=` del panel Whapi).
3. Opcional: **`WHAPI_CHANNEL_ID`** (Channel ID del panel) para resolver tenant; **`WHAPI_META_PHONE_NUMBER_ID`** si tu adaptador lo necesita.
4. Webhook entrante (HTTPS público):  
   `POST https://<tu-api>/api/webhooks/whatsapp/whapi?token=<WHATSAPP_WEBHOOK_TOKEN>`
5. Si el admin (GitHub Pages) llama al host de la API sin subdominio de tenant: **`TENANT_HOST_FALLBACK_ALLOW_HOSTS=<host de la API>`**.

**Código:** envío `api/services/whapiWhatsapp.js`; webhook `api/routes/webhooksWhatsapp.js` (ruta `/whapi`).

## Volver a Meta (Cloud API)

1. `WHATSAPP_PROVIDER=meta`
2. Configurá **`META_ACCESS_TOKEN`**, **`META_PHONE_NUMBER_ID`**, **`META_APP_SECRET`**, **`META_WEBHOOK_VERIFY_TOKEN`**.
3. Webhook: `https://<tu-api>/api/webhooks/whatsapp/meta` con verify token = `META_WEBHOOK_VERIFY_TOKEN`.
4. Las variables **Whapi** (`WHAPI_*`) pueden quedar vacías; no se usan si el proveedor no es `whapi`.

**Código:** `api/routes/webhooksMeta.js`, `api/services/metaWhatsapp.js`, `api/services/metaTenantWhatsapp.js`.

## WAHA / Evolution

Ver **`api/README.md`** (secciones WAHA y Evolution).

---

`made by leavera77`
