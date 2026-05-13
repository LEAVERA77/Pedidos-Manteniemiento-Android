# Whapi: STOP, warm-up y métricas (avisos masivos)

## Webhook entrante (STOP / ALTA)

La API acepta el mismo JSON de Whapi en:

- `POST https://<tu-api>/api/webhooks/whatsapp/whapi` (recomendado, ya documentado)
- `POST https://<tu-api>/api/webhooks/whapi/message` (alias equivalente)

Autenticación (cualquiera válida basta):

- Query `?token=<WHATSAPP_WEBHOOK_TOKEN>`
- Header `Authorization: Bearer <WHATSAPP_WEBHOOK_TOKEN>` o Bearer `WHAPI_API_KEY`
- Header `X-Api-Key` con el mismo valor
- Opcional: `WHAPI_WEBHOOK_SECRET` y header `X-Whapi-Webhook-Secret: <mismo>` o Bearer con ese secreto

**Evento en Whapi:** `message.received` (u evento que envíe el cuerpo con `messages` + `channel_id`).

### Qué hace el servidor

1. Si `WHATSAPP_PROVIDER=whapi` y existe la columna `socios_catalogo.acepta_avisos` (migración aplicada):
   - Textos tipo **STOP** / baja → `acepta_avisos = false` en socios que matchean el móvil + tenant (desde `channel_id`).
   - **ALTA** / sí → `acepta_avisos = true`.
   - Responde confirmación por WhatsApp al vecino.
2. Métricas en `broadcast_metrics` (respuestas con texto ≥ 6 caracteres normalizados; STOP incrementa `respuestas_stop`).
3. Si hay texto para el bot, sigue el flujo conversacional habitual (`handleInboundMetaWhatsAppPayload`).

**Importante:** el opt-out aplica a filas del **catálogo de socios** con teléfono coincidente. Quien solo figura en `pedidos` sin match en socios no cambia de estado (documentado a propósito).

## Migración SQL

Ejecutar en Neon el archivo:

`api/db/migrations/whapi_broadcast_compliance.sql`

## Warm-up del número

Variables:

- `WHAPI_WARMUP_MODE` — `off` (default), `strict` o `limited`
- `WHAPI_WARMUP_DAYS_REQUIRED` — default `10`

Con `strict` y días &lt; requeridos: se **bloquea** el envío masivo. Con `limited`: máximo **5** destinatarios por envío y **1** envío masivo por hora mientras dure el período.

Registrar la fecha de alta del número:

```bash
node api/scripts/init-whapi-number.js <clientes.id>
node api/scripts/init-whapi-number.js 3 2026-01-01T00:00:00Z
```

## Métricas

- `GET /api/whatsapp/broadcast/metrics` (JWT admin, mismo host tenant) — últimos 7 días, promedio de ratio, alerta si ratio &lt; 20 % varios días seguidos.
- Tras cada envío masivo se suma `mensajes_enviados` con los envíos **exitosos** (`enviados_ok`).

## Guía anti-baneo (operador)

https://support.whapi.cloud/help-desk/blocking/how-to-do-mailings-without-the-risk-of-being-blocked
