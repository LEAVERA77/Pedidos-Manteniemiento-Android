# Checklist: tenant Whapi por `channel_id` (Argentina, sin i18n)

**Objetivo:** dejar de depender de `WHATSAPP_BOT_TENANT_ID` fijo en Render para **todo** el tráfico Whapi. El tenant correcto sale del **webhook** (`channel_id`) → búsqueda en Neon → `clientes.id`. La variable de entorno queda **solo como fallback temporal** hasta migrar todos los canales.

**Mercado:** solo Argentina (sin cambios de internacionalización).

---

## Estado actual del código (referencia)

| Archivo | Qué hace hoy |
|---------|----------------|
| `api/services/metaTenantWhatsapp.js` | `resolveTenantIdByMetaPhoneNumberId`: busca `meta_phone_id` / `meta_phone_number_id` en `clientes.configuracion`; si `WHATSAPP_PROVIDER=whapi` y `pid === WHAPI_CHANNEL_ID` (env) → devuelve **`WHATSAPP_BOT_TENANT_ID`**. |
| `api/services/whapiWebhookAdapter.js` | Ya lee `whapiBody.channel_id` y lo usa como `phone_number_id` en el payload adaptado a Meta si no hay `WHAPI_META_PHONE_NUMBER_ID`. |
| `api/routes/webhooksWhatsapp.js` | `checkWhapiWebhookToken`: además de Bearer/query, acepta `body.channel_id === WHAPI_CHANNEL_ID` (env) — **con varios canales esto deja de escalar**. |
| `api/services/whatsappBotMeta.js` | `botTenantId()` = `WHATSAPP_BOT_TENANT_ID` en varios caminos; el inbound usa `resolveTenantIdByMetaPhoneNumberId(phoneNumberId)` en varios sitios. |
| `api/services/whatsappService.js` | Usa `WHATSAPP_BOT_TENANT_ID` en credenciales/envío. |
| `api/services/globalBotState.js` | Respaldo con `WHATSAPP_BOT_TENANT_ID`. |
| `api/services/whatsappReclamanteLookup.js` | Fallback numérico con `WHATSAPP_BOT_TENANT_ID`. |

---

## Fase A — Neon (datos)

- [ ] **A1.** Crear migración SQL (o ejecutar en Neon) para columna dedicada, por ejemplo:
  - `ALTER TABLE clientes ADD COLUMN IF NOT EXISTS whapi_channel_id VARCHAR(100);`
  - Índice único parcial si un canal solo puede mapear a un tenant activo: `CREATE UNIQUE INDEX ... ON clientes (whapi_channel_id) WHERE whapi_channel_id IS NOT NULL AND activo = TRUE;` (ajustar reglas de negocio si un tenant puede tener varios canales).
- [ ] **A2.** Backfill manual o script: para el tenant que hoy usás con `WHATSAPP_BOT_TENANT_ID=1`, setear `whapi_channel_id` = el Channel ID real del panel Whapi (mismo valor que hoy podría estar en `WHAPI_CHANNEL_ID` en Render).
- [ ] **A3.** Documentar en runbook: “cada nuevo cliente SaaS = nuevo canal Whapi + actualizar `clientes.whapi_channel_id`”.

---

## Fase B — Backend (resolución de tenant)

- [ ] **B1.** En `api/services/metaTenantWhatsapp.js` (o función dedicada `resolveTenantIdByWhapiChannelId`):
  - Si `WHATSAPP_PROVIDER === 'whapi'` y llega un `phone_number_id` que en la práctica es el **channel_id** del adaptador:
  - `SELECT id FROM clientes WHERE activo = TRUE AND whapi_channel_id = $1 LIMIT 1`.
  - Si hay fila → devolver ese `id`.
  - Si **no** hay fila → `Number(process.env.WHATSAPP_BOT_TENANT_ID || 1)` **solo como fallback** y loguear `warn` con `channel_id` (sin PII masiva).
- [ ] **B2.** Opcional pero limpio: si `configuracion` ya guardaba algo equivalente (`whapi_channel_id` en JSON), migrar a columna y unificar una sola fuente de verdad.
- [ ] **B3.** Revisar **todos** los usos de `resolveTenantIdByMetaPhoneNumberId` y `botTenantId()` en `whatsappBotMeta.js` para asegurar que el inbound Whapi siempre pase el id que corresponde al **channel** del webhook, no un id fijo equivocado.
- [ ] **B4.** `api/services/whatsappService.js` / credenciales por tenant: confirmar que el envío saliente usa el tenant resuelto por conversación o por `clientes`, no un `tenantId` fijo del env (línea que hoy usa `WHATSAPP_BOT_TENANT_ID` como default).
- [ ] **B5.** `globalBotState.js` y `whatsappReclamanteLookup.js`: mismo criterio — fallback env solo si no hay match por canal.

---

## Fase C — Webhook y seguridad (Whapi)

- [ ] **C1.** `checkWhapiWebhookToken` en `api/routes/webhooksWhatsapp.js`: dejar de depender de **un solo** `WHAPI_CHANNEL_ID` en el cuerpo para autorizar; priorizar `WHATSAPP_WEBHOOK_TOKEN` / `WHAPI_API_KEY` según lo que Whapi envíe en producción.
- [ ] **C2.** Confirmar en documentación Whapi qué header/query manda cada cuenta al **mismo** URL de webhook (si es un solo endpoint para todos los canales, la auth no puede ser “channel_id === env”).
- [ ] **C3.** Tras desplegar B+C, probar con dos `channel_id` distintos y verificar que los pedidos caen en `clientes` distintos.

---

## Fase D — Render / variables

- [ ] **D1.** Mantener `WHATSAPP_BOT_TENANT_ID` en Render como **fallback** hasta que todos los `clientes` activos tengan `whapi_channel_id`.
- [ ] **D2.** Cuando esté estable: quitar `WHAPI_CHANNEL_ID` del env si ya no se usa para auth ni para resolver tenant (o dejarlo documentado solo para herramientas legacy).
- [ ] **D3.** Objetivo final (eventual): eliminar `WHATSAPP_BOT_TENANT_ID` del Render **o** dejarla vacía y que el código falle explícitamente con log claro si llega un `channel_id` desconocido (más seguro que mandar todo al tenant 1).

---

## Fase E — Producto / operación (Whapi + GestorNova)

- [ ] **E1.** En Whapi: un **canal** (número) por tenant que deba recibir reclamos (como describiste).
- [ ] **E2.** En GestorNova: UI admin o procedimiento SQL para editar `whapi_channel_id` por empresa (sin tocar login/tenant del front si solo es API + Neon).
- [ ] **E3.** Actualizar `api/.env.example` y `api/docs/CAMBIAR_PROVEEDOR_WHATSAPP.md` + `api/README.md` con el flujo “channel_id → Neon → tenant”.

---

## Fase F — Pruebas

- [ ] **F1.** Test unitario: dado un `whapiBody` con `channel_id` X, el adaptador + resolver devuelven el `clientes.id` correcto (extender `api/tests/whapiWebhookAdapter.test.js` o test nuevo para `metaTenantWhatsapp`).
- [ ] **F2.** Staging: webhook de prueba desde Whapi hacia la API; verificar fila en `pedidos` / sesión bot con `tenant_id` esperado.
- [ ] **F3.** `npm test` en `api/` sin regresiones.

---

## Resumen ejecutivo

| Componente | Acción |
|------------|--------|
| **Render** | Mantener `WHATSAPP_BOT_TENANT_ID` como fallback al principio; planificar retiro. |
| **Neon** | Columna `clientes.whapi_channel_id` + datos por tenant. |
| **Whapi** | Un canal por número/empresa; mismo webhook URL si la auth lo permite. |
| **Código** | Resolver tenant por `channel_id` en BD antes del fallback env; ajustar auth del POST `/whapi` para multi-canal. |

---

## No incluido (por tu indicación)

- Internacionalización / mercados fuera de Argentina.

---

made by leavera77
