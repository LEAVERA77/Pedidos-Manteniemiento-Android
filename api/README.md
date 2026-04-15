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

### 2. Base de datos PostgreSQL (Docker)

El archivo `docker-compose.evolution.yml` incluye **`postgres:15-alpine`** (BD) y **`redis:7-alpine`** (caché; Evolution suele asumir Redis y sin él el **QR puede no generarse**).

Credenciales por defecto (cambialas en producción; podés usar `.env.evolution`):

| | |
|--|--|
| Usuario | `evolution` |
| Contraseña | `evolution123` |
| Base de datos | `evolution` |

Variables de sustitución en el compose: `EVOLUTION_DB_USER`, `EVOLUTION_DB_PASSWORD`, `EVOLUTION_DB_NAME`, `EVOLUTION_API_KEY`. Copiá **`.env.evolution.example`** → **`.env.evolution`** en la raíz del repo y ajustá; luego:

```bash
# desde la raíz del repo
docker compose --env-file .env.evolution -f docker-compose.evolution.yml up -d
```

Si no usás archivo de entorno, los valores por defecto del `docker-compose` aplican igual.

**Reinicio limpio** (borra volúmenes, BD en blanco): `npm run evolution:reset` (desde `api/`).

### 3. Levantar Evolution

Desde la carpeta `api/` (el compose está en la raíz del repo):

```bash
npm run evolution:up
npm run evolution:logs
```

Si tenés **`.env.evolution`** en la raíz (p. ej. `EVOLUTION_IMAGE=evoapicloud/evolution-api:v2.3.7`), usá explícitamente:

```powershell
docker compose --env-file ..\.env.evolution -f ..\docker-compose.evolution.yml up -d
```

Tras un `down -v`, si **`docker compose up`** falla con *container name already in use*, podés forzar: `docker rm -f evolution-api evolution-postgres evolution-redis` y volver a `up -d`.

Verificá con `docker ps` que **evolution-api**, **evolution-postgres** y **evolution-redis** estén `Up`. Si cambiás usuario/contraseña de Postgres, actualizá también el `healthcheck` del servicio `postgres` en el compose (o mantené el usuario `evolution` para desarrollo).

### 4. Crear instancia y QR (primera vez)

La instancia `EVOLUTION_INSTANCE` (p. ej. `gestornova`) debe existir en Evolution (creación vía [documentación](https://doc.evolution-api.com/) o panel). Luego:

```bash
npm run evolution:qr
```

Escaneá el código con WhatsApp (Dispositivos vinculados) o usá el pairing si la API lo muestra.

#### Solución de problemas: QR no se genera (modal vacío / PowerShell sin código)

1. **Redis** — La API suele tener **`CACHE_REDIS_ENABLED=true`** por defecto; sin un Redis accesible el QR puede quedar en blanco. El `docker-compose.evolution.yml` del repo incluye el servicio **`redis`** y `CACHE_REDIS_URI=redis://redis:6379/6`. Tras actualizar: `npm run evolution:down` → `npm run evolution:up` (o `evolution:reset` si querés volúmenes limpios).

2. **`SERVER_URL`** — Debe coincidir con cómo abrís el manager (p. ej. `http://localhost:8080`). Está como `EVOLUTION_SERVER_URL` en el compose.

3. **`NODE_OPTIONS`** — En algunos equipos/VPS ayuda evitar timeouts de red al generar el QR:
   `NODE_OPTIONS=--network-family-autoselection-attempt-timeout=5000` (ya en el compose).

4. **`CONFIG_SESSION_PHONE_VERSION`** — Debe ser cercana a la versión de **WhatsApp Web** (en el teléfono: *Ajustes → Ayuda*). Probar valores que reporta la comunidad si el default no funciona, vía `.env.evolution`.

5. **Imagen Docker** — Si seguís con QR vacío tras lo anterior, probá la imagen mantenida **`evoapicloud/evolution-api`** (p. ej. `v2.3.7`), que incorpora correcciones de Baileys al conectar:
   ```env
   EVOLUTION_IMAGE=evoapicloud/evolution-api:v2.3.7
   ```
   (en `.env.evolution` junto al `docker compose --env-file ...`).

6. **Logs** — `docker logs evolution-api --tail 200` y buscá `error`, `redis`, `qrcode`, `Baileys`.

El aviso de accesibilidad del modal en el navegador (Radix “DialogTitle”) **no** explica un QR vacío; el fallo suele ser backend (cache, red o versión del cliente).

### 5. Activar en la API

En `api/.env` (solo local / VPS; **no** en Render si seguís con Meta allí):

```env
WHATSAPP_PROVIDER=evolution
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=gestornova-evolution-2026
EVOLUTION_INSTANCE=gestornova
```

Reiniciá `npm start`.

Los envíos de **texto** del bot (`sendBotWhatsAppText`) y avisos al cliente (`sendTenantWhatsAppText`) usan Evolution. Las **listas interactivas** del menú de tipos siguen llamando a Graph (Meta) hasta integrar `sendList` de Evolution o forzar menú solo texto.

### 6. Webhook entrante (fase 2)

Configurar en Evolution el webhook hacia tu API (`/api/webhooks/...`) según la doc del proyecto; este repo puede añadir ruta dedicada en un siguiente paso.

**Advertencia:** no subas `WHATSAPP_PROVIDER=evolution` a Render si el contenedor Evolution no es alcanzable desde internet con la misma URL.

---

## WhatsApp: qué proveedor usar

| Entorno | Recomendación |
|--------|----------------|
| **Producción (Render, clientes reales)** | **`WHATSAPP_PROVIDER=meta`** — [WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api). Configurá `META_*` y el webhook `/api/webhooks/whatsapp/meta`. Es el canal **oficial** y estable. |
| **Desarrollo local sin sandbox Meta** | **WAHA** (`WHATSAPP_PROVIDER=waha`) o emulador Graph (`META_GRAPH_URL`). WAHA **no** es producto oficial de Meta; usalo como puente de pruebas. |

---

## WAHA (WhatsApp HTTP API) — alternativa ligera (solo dev / pruebas)

[WAHA](https://waha.devlike.pro/) expone una API REST; `docker-compose.waha.yml` levanta **un** contenedor. Puerto host **3080** (la API Node suele usar `PORT=3000`).

El compose usa motor **`NOWEB`** (sin navegador embebido); suele comportarse mejor en Docker que **WEBJS**. Si cambiás de motor o ves sesiones rotas: `npm run waha:reset` y volvé a vincular.

1. Levantar WAHA (desde `api/`):

   ```bash
   npm run waha:up
   ```

2. **Vincular** (elegí uno):

   - **Por código de teléfono** (si el QR falla), con el **mismo número** que la cuenta WhatsApp:

     ```bash
     npm run waha:pair -- 549XXXXXXXXXX
     ```

     o `WAHA_PAIR_PHONE=549... npm run waha:pair`

   - **Por QR / raw:**

     ```bash
     npm run waha:qr
     ```

   También: UI `http://localhost:3080/dashboard`, Swagger, o `GET /api/default/auth/qr` con header `X-Api-Key`.

3. Activar en `api/.env`:

   ```env
   WHATSAPP_PROVIDER=waha
   WAHA_API_URL=http://localhost:3080
   WAHA_API_KEY=gestornova-waha-2026
   WAHA_SESSION=default
   ```

   La clave debe coincidir con `WAHA_API_KEY` del compose. Reiniciá la API (`npm start`).

   **Sesión:** la imagen **WAHA Core** (`devlikeapro/waha`) solo permite la sesión **`default`**. Si necesitás otro nombre (p. ej. `gestornova`), usá [WAHA Plus](https://waha.devlike.pro/) y definí `WAHA_SESSION` en `.env`.

4. **Webhook hacia el bot (obligatorio para recibir mensajes):** la API expone `POST /api/webhooks/whatsapp/waha`. Los scripts `npm run waha:*` usan **`compose.waha.env`** en la raíz del repo (junto a `docker-compose.waha.yml`) para armar `WHATSAPP_HOOK_URL` con `host.docker.internal` y el token. Editá **`WHATSAPP_WEBHOOK_TOKEN`** y **`WAHA_HOOK_API_PORT`** ahí para que coincidan con **`WHATSAPP_WEBHOOK_TOKEN`** y **`PORT`** de `api/.env`. Luego `npm run waha:down` → `waha:up`. Sin esto, el bot **no** recibe mensajes entrantes.

5. **`META_PHONE_NUMBER_ID`** en `api/.env` debe seguir definido (el mismo que usás con Meta): el adaptador WAHA lo reutiliza para resolver el tenant del bot.

6. Logs: `npm run waha:logs`. Reinicio con volúmenes limpios: `npm run waha:reset`.

7. Probar: con la API en marcha (`npm start`), enviá **Hola** desde **otro número** al **WhatsApp que tiene vinculado WAHA** (Móvil → Dispositivos vinculados). Si escribís a un número distinto al de la cuenta enlazada con WAHA, el mensaje no pasa por tu sesión `default` y el bot no responde.

8. Si el webhook da **200** pero no ves respuesta en el chat: mirá la consola de la API por `[whatsapp-bot-meta] hola detectado`, `[BOT_RESPUESTA]` y `[waha]`. Si aparece `[waha-adapter] mensaje sin texto`, NOWEB puede estar mandando solo media; probá solo texto **Hola**. Si `[waha] Error enviando mensaje`, revisá `WAHA_API_KEY` y que `WHATSAPP_PROVIDER=waha`.
