# API Nexxo / Pedidos-MG (Node + Express)

Backend compartido entre el panel web y la app Android. Ver también la documentación del repo raíz.

## Requisitos

- Node.js 18+ (recomendado **22+** si usás el emulador de WhatsApp).
- Variables en `.env` (partir de `.env.example`).

## Instalación

```bash
cd api
npm install
```

## Ejecutar en local

```bash
npm start
# o
npm run dev
```

Por defecto escucha en `PORT` o **3000**.

## Emulador WhatsApp Cloud API (solo desarrollo local)

Permite probar el webhook y las respuestas del bot **sin** llamar a `graph.facebook.com` ni depender del sandbox de Meta.

### 1. Variables en tu `.env` local (no en Render)

| Variable | Descripción |
|----------|-------------|
| `META_GRAPH_URL` | `http://localhost:4004` (puerto del emulador; sin barra final). |
| `META_GRAPH_API_VERSION` | El paquete `@whatsapp-cloudapi/emulator` **solo acepta `v24.0`** en rutas Graph. Usá **`v24.0`** junto con el emulador. En producción/Render dejá `v21.0` (o la que uses) y **no** definas `META_GRAPH_URL`. |
| `META_WEBHOOK_VERIFY_TOKEN` | Mismo valor que usa la API para validar el webhook. |
| `META_APP_SECRET` | Opcional; si lo ponés, el emulador firma el body (`X-Hub-Signature-256`) como Meta. Debe coincidir con el de la API. Si no querés firmar en local: `META_ALLOW_INVALID_SIGNATURE=true` (solo dev). |
| `META_ACCESS_TOKEN` | Cualquier string no vacío sirve para el emulador (acepta el `Bearer`). |
| `META_PHONE_NUMBER_ID` | Debe coincidir con `businessPhoneNumberId` del script (por defecto el de tu app; ver `run-emulator.js`). |
| `EMULATOR_WEBHOOK_API_BASE` | Base de la API (default `http://localhost:3000`). Ajustá si tu `PORT` es otro. |
| `WHATSAPP_EMULATOR_PORT` | Puerto del emulador (default **4004**). |

**No** definas `META_GRAPH_URL` en Render: la API debe seguir usando `https://graph.facebook.com`.

### 2. Terminales

**Terminal A — API**

```bash
cd api
npm start
```

**Terminal B — emulador**

```bash
cd api
npm run emulator
```

### 3. Simular un mensaje entrante

El endpoint real del paquete es `POST /debug/messages/send-text` (no existe `/simulate/incoming/text`).

```bash
curl -X POST http://localhost:4004/debug/messages/send-text ^
  -H "Content-Type: application/json" ^
  -d "{\"from\": \"+5493434540250\", \"name\": \"Pedro\", \"message\": \"Hola\"}"
```

En bash (Linux/macOS) usá comillas simples en el JSON externo.

Deberías ver en la API logs tipo `[WEBHOOK]` / `[BOT_RESPUESTA]` y en el emulador la “burbuja” de respuesta saliente cuando el bot conteste.

### 4. Verificación GET del webhook (Meta)

El emulador expone validación en `GET` según el paquete; la URL de callback de tu app debe coincidir con `EMULATOR_WEBHOOK_API_BASE` + ruta del webhook.

---

Cambios hechos en código: `META_GRAPH_URL` se usa en `services/metaWhatsapp.js` como base alternativa a `https://graph.facebook.com`.
