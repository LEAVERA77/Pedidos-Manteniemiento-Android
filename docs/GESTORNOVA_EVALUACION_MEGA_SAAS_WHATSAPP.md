# Evaluación del Mega-Prompt: SaaS multitenant + WhatsApp (GestorNova)

Este documento cruza tu **Mega-Prompt** con el estado real del repo (Neon directo desde `index.html`, API Node en `api/`, Android WebView) y define **qué falta**, **qué ya existe** y **cómo ejecutarlo por fases**.

---

## 1. Lo que ya tenés en el código / docs

| Pieza | Estado |
|--------|--------|
| API Node (`api/server.js`) | Express con rutas `pedidos`, `usuarios`, `clientes`, `clientes-finales`, `whatsapp`, etc. |
| WhatsApp (API actual) | `POST /api/whatsapp/enviar-link` **no envía** por Evolution: registra en `whatsapp_notificaciones` y devuelve `wa.me` para abrir el chat (enlace manual). |
| Esquema paralelo multitenant | `docs/NEON_esquema_multitenant.sql` (`clientes`, `usuarios_tenant`, `pedidos_tenant`) **sin** unificar aún con el front que usa `usuarios` + `pedidos` + SQL desde el navegador. |
| Esquema API + columnas pedidos | `docs/NEON_api_multitenant_setup.sql`: tabla `clientes`, `clientes_finales`, `whatsapp_notificaciones`, **ALTER** a `pedidos`/`usuarios` (teléfono, datos cliente, NIS, etc.). |
| Config empresa en la web | `empresa_config` (clave/valor) → `window.EMPRESA_CFG` en `index.html`. Ideal para **tipo de entidad**, **setup wizard**, **logo URL** sin migración pesada al inicio. |
| Android | `keystore.properties` ya contemplado en `app/build.gradle.kts` para release firmado. |

Conclusión: el mega-prompt es coherente, pero **no** está todo implementado end-to-end; hay que **elegir una estrategia de tenant** (ver §4).

---

## 2. Evolution API vs Z-API (recomendación)

| Criterio | Evolution API (self-host) | Z-API (SaaS pago) |
|----------|---------------------------|-------------------|
| Costo | Gratis si lo hospedás vos (VPS/Render dedicado) | Suscripción |
| Operación | Vos mantenés instancia, anti-ban, backups | Menos ops |
| Webhooks | Sí (entrada/salida) | Sí |
| Encaje con Render free | Riesgoso: WA + cold start + sesión | Más simple |

**Recomendación práctica:** **Evolution API** en un **VPS pequeño** o servicio dedicado; la API de GestorNova en Render solo recibe webhooks y encola salientes (evitás mezclar el proceso de WhatsApp con el cold start de Render).

---

## 3. Base de datos Neon: qué agregar o cambiar

### 3.1 Sin romper el mono-tenant actual (rápido)

- Seguir usando **`empresa_config`** para:
  - `tipo_entidad`: `cooperativa_electrica` | `cooperativa_agua` | `municipio`
  - `setup_completado`: `true`/`false`
  - `labels_json`: JSON con textos (“Socio” / “Vecino”, etc.)
  - `logo_url`, `lat_base`, `lng_base`
  - `whatsapp_provider`: `evolution` | `zapi` | `none`
  - `whatsapp_api_base_url`, `whatsapp_api_key`, `whatsapp_instance_name` (nombres según proveedor)
- Así el **Setup Wizard** solo escribe claves; no exige `ALTER` masivo el día uno.

### 3.2 Tablas nuevas (recomendadas para el bot)

Ejecutá **`docs/NEON_gestornova_saas_parcial.sql`** (en este repo). Incluye:

- **`import_excel_profiles`**: perfiles de importación (mapeo columnas Excel → campos internos) definibles desde la web.
- **`whatsapp_outbox`**: cola de mensajes a enviar cuando cambia estado / creación de pedido (worker o cron llama a Evolution).
- **`whatsapp_bot_sessions`**: estado del menú conversacional por número (FSM simple).

### 3.3 Multitenant “de verdad” (`tenant_id` en todo)

Tu prompt pide filtrar `usuarios`, `pedidos`, `socios` por `tenant_id`.

- **Riesgo:** hoy el front ejecuta SQL directo a Neon; cada query habría que cambiarla y **nunca** confiar solo en el cliente para el filtro (hay que validar en API o RLS).
- **Camino sano:**
  1. Añadir `tenant_id` con `DEFAULT 1` y backfill.
  2. Mover **creación de pedidos desde WhatsApp** y **webhooks** solo a **API Node** (servidor conoce `tenant_id`).
  3. Mediano plazo: **Row Level Security (RLS)** en Neon o obligar operaciones sensibles vía API.

La tabla `tenants` del prompt puede **alias** con tu tabla existente **`clientes`** (`docs/NEON_api_multitenant_setup.sql`) ampliando columnas: `whatsapp_*`, `logo_url`, `coordenadas_base` (o `configuracion` JSONB).

### 3.4 Excel por tipo de entidad

- **Usuarios:** ya tenés importación en admin; el mega-prompt pide **un Excel por cada tipo** (eléctrica / agua / municipio). Lo razonable es **un perfil de columnas por `tipo_entidad`** guardado en `import_excel_profiles` o en `empresa_config` como JSON.
- **Formato definido por el usuario en la web:** guardar JSON tipo:
  ```json
  {
    "hoja": "Socios",
    "filaEncabezado": 1,
    "map": { "NIS": "nis_medidor", "Nombre": "nombre", "Tel": "telefono" }
  }
  ```
- El importador lee el Excel, aplica `map` y valida tipos; columnas no mapeadas se ignoran o se guardan en `metadata` JSONB.

---

## 4. OSM / Overpass (números de puerta)

- **Factible:** proxy en API `GET /api/geo/overpass?lat=&lng=&radius=` que llame a Overpass con **límite de tasa** y **caché** (no pegarle desde cada cliente sin control).
- **Legal/uso:** respetar [política de uso](https://operations.osmfoundation.org/policies/overpass/) (no abusar; ideal servidor propio Overpass solo si escala).

---

## 5. Branding dinámico (logo en la app)

- **Hoy:** logo/nombre en gran parte estático en assets.
- **Objetivo:** al login, `fetch` de `logo_url` desde `empresa_config` o endpoint `/api/empresa/branding` y actualizar cabecera + posible caché local.
- **Manual:** subir logo a almacenamiento con URL HTTPS pública (Drive no es ideal para hotlink; mejor **Cloudinary**, **S3**, o **GitHub raw** con CDN).

---

## 6. Fases de implementación sugeridas

| Fase | Contenido | Entrega |
|------|-----------|---------|
| **Fase 0** | SQL parcial + documentación | `NEON_gestornova_saas_parcial.sql` + este doc |
| **Fase 1** | Setup wizard + `empresa_config` + labels | Solo web, bloqueo primer inicio |
| **Fase 2** | Webhook Evolution + sesiones + crear pedido desde bot | API + secretos + menú FSM |
| **Fase 3** | Outbox + envío al cambiar estado | Trigger DB o hook en API al `UPDATE pedidos` |
| **Fase 4** | UI mapeo Excel + import con perfil | Admin panel |
| **Fase 5** | `tenant_id` + RLS o API-only | Migración fuerte |

---

## 7. Qué tenés que hacer vos (manual)

1. **Decidir hosting del bot:** Evolution API en VPS o Z-API cuenta activa.
2. **Neon:** ejecutar `docs/NEON_gestornova_saas_parcial.sql` (y revisar si ya corriste `NEON_api_multitenant_setup.sql`).
3. **Variables de entorno en Render (API):**  
   `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`, `WEBHOOK_HMAC_SECRET` (o token fijo que configure en Evolution).
4. **Configurar webhook en Evolution** apuntando a:  
   `https://TU-API.onrender.com/api/webhooks/whatsapp/evolution`  
   (ruta exacta según implementación en `api/routes/webhooksWhatsapp.js`).
5. **Probar flujo:** mensaje entrante → sesión → `INSERT` pedido (vía API) → respuesta al usuario.
6. **Logo:** subir imagen y pegar URL en configuración cuando exista el campo en UI.
7. **Keystore Android:** no commitear `keystore.properties`; solo en tu máquina / CI secreto.

---

## 8. Ajustes sugeridos al Mega-Prompt

- Explicitar **no exponer** `whatsapp_api_token` al navegador: solo servidor.
- Añadir **cola + reintentos** para envíos WA (outbox), no `fetch` directo desde el trigger SQL.
- **Consentimiento y opt-out** (Ley de protección de datos personales Argentina): guardar si el ciudadano aceptó mensajes por WA.
- **Límite de mensajes** y plantillas para no ser marcado como spam por Meta.

---

## Referencias en el repo

- API WhatsApp actual: `api/routes/whatsapp.js`
- SQL multitenant API: `docs/NEON_api_multitenant_setup.sql`
- SQL multitenant paralelo: `docs/NEON_esquema_multitenant.sql`
- SQL nuevo (fase parcial): `docs/NEON_gestornova_saas_parcial.sql`
- Webhook stub: `api/routes/webhooksWhatsapp.js`
