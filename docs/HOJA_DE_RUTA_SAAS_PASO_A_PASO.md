# Hoja de ruta SaaS + WhatsApp — paso a paso (Neon, Render, Evolution, Agent)

> **Importante:** En este proyecto la tabla “tenant” del diseño API se llama **`clientes`**, no `tenants`. La verificación del Paso 1 debe comprobar **`clientes`** y las columnas nuevas en **`pedidos`**.

---

## PASO 1 — Base de datos (Neon) — lo hacés vos

### 1.1 Entrar
1. [Neon Console](https://console.neon.tech/) → tu proyecto → **SQL Editor**.

### 1.2 Primer script (API multitenant + columnas en `pedidos` / `usuarios`)
1. En tu PC abrí el archivo del repo:  
   `docs/NEON_api_multitenant_setup.sql`
2. Copiá **todo** el contenido y pegalo en el SQL Editor de Neon.
3. Ejecutá (**Run**).

**Qué crea o altera (resumen):**
- Tablas: `clientes`, `categorias_trabajo`, `clientes_finales`, `notificaciones`, `sincronizacion_pendiente`, `whatsapp_notificaciones`
- `usuarios`: `telefono`, `whatsapp_notificaciones`
- `pedidos`: varias columnas (`telefono_contacto`, `cliente_nombre`, `nis`, `medidor`, `tecnico_asignado_id`, etc.)

> Si tu base ya tenía `tecnico_asignado_id` u otras columnas desde scripts viejos, `IF NOT EXISTS` evita error.

### 1.3 Segundo script (WhatsApp cola, Excel, `tenant_id`)
1. Abrí: `docs/NEON_gestornova_saas_parcial.sql`
2. Copiá todo → pegá en Neon → **Run**.

**Qué agrega:**
- `import_excel_profiles`, `whatsapp_outbox`, `whatsapp_bot_sessions`
- `pedidos.tenant_id`, `pedidos.origen_reclamo`
- `usuarios.tenant_id`

### 1.4 Verificación (ejecutá estos `SELECT` en Neon)

```sql
-- ¿Existe la tabla de “tenants” del diseño API? Se llama clientes:
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'clientes', 'categorias_trabajo', 'clientes_finales',
    'whatsapp_notificaciones', 'import_excel_profiles',
    'whatsapp_outbox', 'whatsapp_bot_sessions'
  )
ORDER BY table_name;
```

```sql
-- Columnas nuevas en pedidos (tenant_id, origen_reclamo, etc.)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'pedidos'
  AND column_name IN (
    'tenant_id', 'origen_reclamo', 'telefono_contacto',
    'cliente_nombre', 'nis', 'medidor', 'tecnico_asignado_id'
  )
ORDER BY column_name;
```

```sql
-- Columnas tenant en usuarios
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'usuarios'
  AND column_name IN ('tenant_id', 'telefono', 'whatsapp_notificaciones');
```

**Resultado esperado:** todas las tablas listadas aparecen; `pedidos` tiene al menos `tenant_id` y `origen_reclamo`.

### 1.5 (Opcional) Primer registro en `clientes` y alinear `tenant_id`

Hoy `tenant_id` en `pedidos`/`usuarios` queda en **1** por defecto. Cuando insertes tu primer cliente, conviene que el **id** de ese cliente sea **1** o que actualices `tenant_id` para que coincida.

**Opción A — Si `clientes` está vacío y querés que el primer id sea 1:**

```sql
INSERT INTO clientes (id, nombre, tipo, plan, activo)
VALUES (1, 'Mi organización', 'cooperativa_electrica', 'basico', true);

SELECT setval(
  pg_get_serial_sequence('clientes', 'id'),
  (SELECT COALESCE(MAX(id), 1) FROM clientes)
);
```

**Opción B — Si ya insertaste un cliente y su id no es 1:**

```sql
-- Reemplazá <ID_CLIENTE> por el id real (ej. 2)
UPDATE pedidos SET tenant_id = <ID_CLIENTE> WHERE tenant_id = 1;
UPDATE usuarios SET tenant_id = <ID_CLIENTE> WHERE tenant_id = 1;
```

---

## PASO 2 — Evolution API — lo hacés vos

1. Creá instancia (ej. `GestorNova_Bot`).
2. Vinculá WhatsApp (QR) con el número que recibirá reclamos.
3. **Webhook** (ajustá el host a tu API real):
   - **URL:** `https://TU-SERVICIO.onrender.com/api/webhooks/whatsapp/evolution`
   - **Eventos:** los que tu versión de Evolution llame para mensajes entrantes (a menudo `MESSAGES_UPSERT` o equivalente).
   - **Token / query:** si configurás `WHATSAPP_WEBHOOK_TOKEN` en Render, en Evolution podés usar el mismo valor (query `?token=...` o header `Authorization: Bearer ...` según implementación del `webhooksWhatsapp.js`).

---

## PASO 3 — Variables de entorno (Render) — lo hacés vos

En el servicio de la API (Render → **Environment**), agregá (nombres orientativos; el Agent puede unificar con el código):

| Variable | Uso |
|----------|-----|
| `WHATSAPP_WEBHOOK_TOKEN` | Ya soportado por el stub: `api/routes/webhooksWhatsapp.js` |
| `WHATSAPP_API_URL` | URL base de Evolution (cuando el Agent implemente envío) |
| `WHATSAPP_API_KEY` | API key global Evolution |
| `WHATSAPP_INSTANCE_NAME` | Nombre de instancia (ej. `GestorNova_Bot`) |

Guardá → **Manual Deploy** si hace falta.

**Base de datos:** la API ya usa `DB_CONNECTION` o similar (revisá `api/.env.example` en el repo).

---

## PASO 4 — Cursor (Agent) — después de los pasos 1–3

Cuando Neon y Render estén listos, en **Agent mode** podés pedir por partes:

**Fase 1 (sugerencia):** Wizard + Empresa: tipo entidad, logo, WhatsApp, coordenadas.  
**Nota para el Agent:** hoy `index.html` usa `empresa_config` (clave/valor); la hoja de ruta pide `tenants` — en Neon la tabla equivalente preparada por el Paso 1 es **`clientes`** (y/o ampliar `configuracion` JSONB). El Agent debe decidir si escribe en `clientes` + `empresa_config` o solo en uno para no duplicar.

**Fase 2:** Webhook completo + menú bot + outbox + avisos al cambiar estado.

---

## PASO 5 — Excel y perfiles — después de Fase 1 del Agent

1. UI de mapeo columnas → guardar en **`import_excel_profiles`** (`columnas` JSONB).
2. Importadores de socios/usuarios/distribuidores leen ese perfil.

---

## PASO 6 — Android

1. APK firmado con `keystore.properties` (ya en el proyecto).
2. Logo dinámico: fetch de URL guardada en config (cuando Fase 1 exista en web/API).
3. Subir APK a Drive + `INSERT` en `app_version` en Neon (como ya hacés).

---

## Checklist rápido

- [ ] Paso 1.2 ejecutado sin error  
- [ ] Paso 1.3 ejecutado sin error  
- [ ] Paso 1.4 verificaciones OK  
- [ ] (Opcional) Paso 1.5 cliente id alineado con `tenant_id`  
- [ ] Paso 2 Evolution + webhook  
- [ ] Paso 3 variables Render  
- [ ] Paso 4 prompts al Agent  
- [ ] Paso 5 cuando exista UI  
- [ ] Paso 6 release APK  
