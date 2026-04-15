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

## Alternativa: Evolution API (sin Cloud API de Meta)

[Evolution API](https://github.com/EvolutionAPI/evolution-api) conecta un número vía **WhatsApp Web** (Baileys). Evita el sandbox **131030** de Meta, pero **no está autorizado por los términos de WhatsApp**: riesgo de bloqueo del número; usá un número de prueba y/o VPS propio.

### Requisitos

- **Docker Desktop** (o motor Docker) en la máquina donde corre Evolution.
- Node como arriba.

### 1. Clave en Docker y en la API

En `docker-compose.evolution.yml`, `AUTHENTICATION_API_KEY` debe ser **el mismo** valor que `EVOLUTION_API_KEY` en `api/.env`.

### 2. Levantar Evolution

Desde la carpeta `api/` (el compose está en la raíz del repo):

```bash
npm run evolution:up
npm run evolution:logs
```

### 3. Crear instancia y QR (primera vez)

La instancia `EVOLUTION_INSTANCE` (p. ej. `gestornova`) debe existir en Evolution (creación vía [documentación](https://doc.evolution-api.com/) o panel). Luego:

```bash
npm run evolution:qr
```

Escaneá el código con WhatsApp (Dispositivos vinculados) o usá el pairing si la API lo muestra.

### 4. Activar en la API

En `api/.env` (solo local / VPS; **no** en Render si seguís con Meta allí):

```env
WHATSAPP_PROVIDER=evolution
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=gestornova-evolution-2026
EVOLUTION_INSTANCE=gestornova
```

Reiniciá `npm start`.

Los envíos de **texto** del bot (`sendBotWhatsAppText`) y avisos al cliente (`sendTenantWhatsAppText`) usan Evolution. Las **listas interactivas** del menú de tipos siguen llamando a Graph (Meta) hasta integrar `sendList` de Evolution o forzar menú solo texto.

### 5. Webhook entrante (fase 2)

Configurar en Evolution el webhook hacia tu API (`/api/webhooks/...`) según la doc del proyecto; este repo puede añadir ruta dedicada en un siguiente paso.

**Advertencia:** no subas `WHATSAPP_PROVIDER=evolution` a Render si el contenedor Evolution no es alcanzable desde internet con la misma URL.
