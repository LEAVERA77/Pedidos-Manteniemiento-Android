# Semana 1 — Bloque crítico (producción GestorNova / Pedidos-MG)

Checklist ejecutable alineado con el código en `api/` (Nexxo / Pedidos-MG). Completar y marcar fechas y responsable.

---

## 1. Congelar alcance v1

**Objetivo:** evitar scope creep en los últimos días antes del go-live.

### Entra en v1 (sugerido — ajustar con el equipo)

| Área | Incluido |
|------|----------|
| **Web admin** | PWA GitHub Pages, login JWT, pedidos CRUD, mapa, socios/catálogo, empresa, usuarios, estadísticas básicas, wizard inicial SaaS |
| **API** | Auth, pedidos, clientes/tenant, direcciones/geocod, webhooks WhatsApp (Meta / Whapi / WAHA según proveedor activo), notificaciones, human chat WA |
| **Android** | WebView + bridge (GPS, cámara, notificaciones según implementación actual) |
| **Datos** | Multitenant Neon, migraciones ya aplicadas en prod |

### Fuera de v1 (dejar explícito para v1.1+)

| Ítem | Nota |
|------|------|
| Nuevos rubros / tipos de reclamo masivos | Tras congelar, solo fixes |
| Rediseños UI grandes | Solo correcciones de bugs |
| Nuevo proveedor WA distinto al de prod | Salvo emergencia |
| Features no probadas en staging | No mergear a `main` |

**Entregable:** una página o issue «GestorNova v1 scope — congelado el (fecha)» con IN/OUT firmado.

---

## 2. Auditoría de secretos

**Regla:** nada de credenciales en Git (`config.json`, `.env`, capturas de Render).

### Inventario (completar en hoja aparte, no en repo)

| Secreto | Dónde vive | Rotación si hubo exposición |
|---------|------------|------------------------------|
| `DB_CONNECTION` / `DATABASE_URL` | Render, GitHub Actions (Pages) | Si / N/A |
| `JWT_SECRET` | Render | Si / N/A |
| `META_ACCESS_TOKEN`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` | Render (+ opcional por tenant en Neon) | Si / N/A |
| `WHAPI_API_KEY`, `WHATSAPP_WEBHOOK_TOKEN` | Render, panel Whapi | Si / N/A |
| `CLOUDINARY_*`, `PLATFORM_TENANT_SIGNUP_SECRET`, EmailJS | Según corresponda | Si / N/A |
| Cualquier token pegado en chat, issue o PDF | — | Rotar y borrar rastro |

**Acción:** si algún token estuvo en repo público o captura: **rotar** en el proveedor y actualizar solo en **Render / Neon / Whapi / Meta**, nunca en commit.

---

## 3. Hardening backend (verificación)

Referencias en código:

| Tema | Qué verificar en Render | Código / notas |
|------|-------------------------|----------------|
| **`JWT_SECRET`** | Longitud 32+ caracteres aleatorios; **no** `dev_secret` | `api/middleware/auth.js` usa `JWT_SECRET` con fallback `dev_secret` — en prod debe estar **siempre** definido |
| **`NODE_ENV`** | `production` | Oculta `detail` de errores 500 en `api/httpApp.js` |
| **CORS** | `CORS_ALLOWED_ORIGINS` = lista **solo** de orígenes reales (Pages, dominios propios; localhost solo si aplica debug) | `api/httpApp.js`: si no coincide `Origin` con el set, CORS no refleja el origen |
| **Rate limits** | Opcional: `RATE_LIMIT_*` para afinar | `api/middleware/rateLimits.js`; `/api/webhooks` **excluidos** del limiter general (`skip`) |
| **Proxy** | `TRUST_PROXY_COUNT` coherente con Render (típico `1`) | `api/httpApp.js` `trust proxy` |

**Checklist rápido:**

- [ ] `JWT_SECRET` fuerte y único por entorno prod
- [ ] `NODE_ENV=production`
- [ ] CORS sin orígenes de prueba olvidados (o justificados)
- [ ] Variables Whapi/Meta solo en el servicio que corresponde

---

## 4. Backups Neon + prueba de restauración

Neon ofrece **Point-in-Time Recovery (PITR)** y **branches** según plan.

| Paso | Acción |
|------|--------|
| 1 | En consola Neon: confirmar **plan** y retención de backups / PITR |
| 2 | Documentar **cómo** crear un branch o restore desde un punto en el tiempo (enlace a doc Neon del plan actual) |
| 3 | **Restore test (trimestral mínimo):** crear branch desde backup, conectar con cadena **solo de lectura**, verificar `SELECT count(*) FROM pedidos` (o tabla crítica), luego borrar branch |
| 4 | Guardar captura o nota «último restore test: fecha» |

No alcanza con «Neon hace backup»: hay que **probar** que se sabe recuperar datos una vez.

---

## 5. Health y alertas básicas

Endpoints ya expuestos:

| URL | Uso |
|-----|-----|
| `GET /health` | Liveness (no toca DB) — `api/httpApp.js` |
| `GET /health/db` | DB Neon — falla si la query falla |
| `GET /api/health/deploy` | Commit / versión Node (útil post-deploy) |

**Alertas mínimas sugeridas:**

1. **Uptime externo** (UptimeRobot, Better Stack, etc.): ping cada 5 min a `https://(tu-api)/health` y otro a `/health/db`.
2. **Render:** revisar alertas nativas / logs de **5xx** y reinicios.
3. **WhatsApp:** si el webhook devuelve muchos **401/500**, revisar logs `[webhook-whapi]` / Meta.

**Webhook:** respuesta `200` con `{ ok: true, skipped: true }` puede ser normal (evento sin texto); distinguir de **500** reales en logs.

---

## 6. Prueba de desastre (DR) — guión corto

Documentar **quién hace qué** y **en qué orden**.

### A) API caída (Render)

1. Confirmar caída: `/health` desde fuera + dashboard Render.
2. **Rollback** deploy anterior en Render si el último deploy rompió.
3. Revisar variables de entorno no borradas tras redeploy.
4. Comunicar a usuarios si aplica.

### B) Base de datos (Neon)

1. Errores 500 en `/health/db` y en logs `neon`.
2. Estado en dashboard Neon (incidentes, límites, suspensión).
3. **Restore:** PITR o branch según procedimiento Neon; **no** pisar prod sin snapshot previo si hay duda.

### C) WhatsApp (Whapi o Meta)

1. Mensajes no entran: panel proveedor + logs `[webhook-whapi] POST` / firma Meta.
2. Verificar URL del webhook, token, y que el servicio API sea el público correcto.
3. **No** rotar tokens en horario pico sin ventana comunicada.

### D) GitHub Pages

1. Sitio admin no carga: Actions, último deploy Pages; `API_BASE_URL` en build.
2. CORS: nuevo origen debe estar en `CORS_ALLOWED_ORIGINS`.

**Entregable:** copiar esta sección a un doc interno «DR GestorNova — contactos y enlaces» con URLs reales y teléfonos on-call.

---

## Referencias en repo

- Runbook general: `docs/RUNBOOK_OPERACION.md`
- Ejemplo variables: `api/.env.example`
- Rate limits: `api/middleware/rateLimits.js`
- App HTTP: `api/httpApp.js`

---

made by leavera77
