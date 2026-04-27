# Prompt de IA — Multi-tenant y aislamiento (GestorNova / Nexxo / Pedidos-MG)

Copiá el bloque entre las líneas `---` y pegalo en el agente. Está adaptado a **este monorepo**: app Android **Nexxo** (`Pedidos-Manteniemiento-Android`), web empaquetada en `app/src/main/assets/`, API Node en `api/`, Neon PostgreSQL, y repo hermano **Pedidos-MG** (GitHub Pages + misma API en Render según despliegue).

---

Actuá como arquitecto de software senior y agente de implementación sobre el **codebase existente GestorNova / Nexxo**.

## Contexto del proyecto (no inventar otro stack)

- **Base de datos:** PostgreSQL en **Neon**. Conexión vía `api/db/neon.js` (`pg` Pool). Variables `DATABASE_URL` / `DB_CONNECTION` en Render; **no** commitear cadenas ni `config.json` con secretos.
- **Backend:** Node.js + Express en **`api/`** (rutas bajo `/api/...`). Autenticación JWT (`api/middleware/auth.js`): payload con `userId` / `sub` y opcionalmente `tenant_id` numérico validado contra `usuarios` / tenant en BD (`getUserTenantId`).
- **Tenant en el esquema actual:** la fila **`clientes`** es el tenant operativo; **`clientes.id` (SERIAL / entero)** es el `tenant_id` usado en `pedidos.tenant_id`, middlewares y JWT. **No** asumir UUID salvo que migraciones explícitas lo introduzcan; si el diseño evoluciona, documentar migración desde entero.
- **Líneas de negocio:** valores operativos tipo **`electricidad` | `agua` | `municipio`** en columnas `business_type` y tablas `tenant_businesses`, `tenant_active_business`; `clientes.tipo` histórico puede ser `cooperativa_electrica` / `cooperativa_agua` / `municipio` — respetar `normalizeBusinessTypeInput` en `api/services/businessType.js`.
- **Wizard actual:** `POST /api/setup/wizard` en `api/routes/setupWizard.js` (router montado como setup). Hoy exige coherencia de nombre con el tenant autenticado y **no** crea un `clientes` nuevo al cambiar nombre. **Cambio de producto pedido abajo:** puede requerir nuevos endpoints o ampliar el wizard para **nueva instancia** (nuevo `clientes.id`).
- **Cambio de negocio sin borrar datos:** `POST /api/tenant/switch-business`, `GET /api/tenant/businesses`, documentado en `docs/MULTI_TENANT_BUSINESS_ISOLATION.md` y `docs/FIX_MULTI_TENANT_ISOLATION.md`. Ese modelo es **no destructivo** (solo filtro activo). **Este prompt añade** un modo explícito de **“nueva instancia / nueva hoja”** que **sí** implica nuevo tenant y reset de numeración; al implementar, **actualizar o cruzar** esa documentación para que no queden reglas contradictorias.
- **Frontend / WebView:** la web vive en **`app/src/main/assets/`** (p. ej. `app.js`, `index.html`) y se publica también en el repo **Pedidos-MG**; mantener paridad con `scripts/sync-assets-to-pedidos-mg.ps1` y copiando `api/` al clon Pedidos-MG cuando corresponda (`docs/RUNBOOK_OPERACION.md`).
- **Numeración de pedidos visible:** formato **`#AÑO-NNNN`** (ej. `#2026-0000`), generada en **`api/routes/pedidos.js`** y en **`api/services/pedidoWhatsappBot.js`** usando la tabla **`pedido_contador`**. **Estado actual:** el contador se incrementa por **`anio` únicamente** (`ON CONFLICT (anio)`), es decir **global a toda la base**, no por tenant. Para el aislamiento pedido, hay que llevar el diseño a **contador por `(tenant_id, anio)`** (y migración de datos / deduplicación cuidadosa para no romper pedidos existentes).

## Objetivo

Refactorizar hacia **aislamiento lógico estricto** cuando el usuario, vía **Wizard** (o flujo equivalente admin), define una **nueva combinación** de identidad de empresa + línea de negocio. Analogía:

- **Rama:** `business_type` (electricidad / agua / municipio).
- **Hoja:** instancia de operador = fila **`clientes`** con `tenant_id = clientes.id`.

## Regla de negocio central (sin ambigüedad)

Definí el par **P = (`business_type` normalizado, `company_name` normalizado)** donde `company_name` es el nombre operativo de la entidad (p. ej. `clientes.nombre` o el campo que use el Wizard en UI).

- **Si al confirmar el Wizard P_nuevo es idéntico a P_actual del tenant en sesión** → mismo `clientes.id`; sin nuevo tenant; sin reset de contadores; **no** forzar logout (salvo UX explícita de “reaplicar”).
- **Si difiere `business_type`, o el nombre de empresa, o ambos** respecto de la sesión actual → tratamiento de **nueva instancia**:
  1. Crear **nueva** fila en **`clientes`** (nuevo `tenant_id` entero) con el tipo/nombre elegidos, más datos mínimos de configuración coherentes con el resto del sistema.
  2. Asociar usuarios operativos al nuevo tenant según política clara (invitación, copia de admin, etc.); **no** dejar usuarios sin `tenant_id` válido.
  3. **Obligatorio:** el usuario **debe hacer logout** inmediatamente después de confirmar.
  4. **Obligatorio:** **recarga fuerte** del documento en el navegador / **WebView** (equivalente a recarga completa ignorando caché agresiva; no alcanza con navegación SPA sola). En Android, si `WebView` cachea, contemplar limpieza de caché del origen o recreación del WebView según cómo esté implementado `TecnicoMvpActivity` / carga de assets.
  5. Tras volver a iniciar sesión, **solo** datos del **nuevo** `tenant_id`.

### Matriz de combinaciones (máximo aislamiento)

Cualquier cambio en el par P respecto del tenant activo ⇒ **nuevo `clientes.id`** + reset de numeración (ver más abajo):

| Situación | Acción |
|-----------|--------|
| Mismo `business_type`, **distinto** nombre de empresa | Nuevo tenant + logout + hard reload + reset `#AÑO-NNNN` |
| **Distinto** `business_type`, mismo nombre | Nuevo tenant + … (misma “marca”, distinta rama = distinta hoja) |
| **Distinto** `business_type`, distinto nombre | Nuevo tenant + … |
| Mismo `business_type`, mismo nombre | **Mismo tenant**; continuidad de datos y contadores |

**Normalización:** documentar en código reglas para nombre (trim, espacios, Unicode NFC, política de mayúsculas) para evitar tenants duplicados por error.

## Numeración `#AÑO-NNNN`

- Debe ser **independiente por tenant y por año calendario**.
- Cualquier creación de **nuevo** `clientes.id` por la regla de P ⇒ el contador para ese tenant y ese año **arranca de cero** (primer valor acorde a la convención visual actual del proyecto).
- Implementación: extender **`pedido_contador`** con `tenant_id` (FK a `clientes.id`), clave única **`(tenant_id, anio)`**, y actualizar **todas** las rutas que insertan/actualizan contador (`api/routes/pedidos.js`, `api/services/pedidoWhatsappBot.js`, y si aplica inserciones directas Neon en **`app/src/main/assets/app.js`**) para que filtren por `tenant_id` de la sesión.

## Row Level Security (opcional pero deseable)

Si el producto apunta a endurecer Neon: políticas RLS por `tenant_id` en tablas de dominio, con contexto de sesión establecido por el backend por request/transacción (`SET LOCAL ...`). El cliente web que aún use SQL directo a Neon **rompe** con RLS a menos que se mueva todo a API o se use un rol/session variable coherente; el agente debe **inventariar** usos de Neon en `app.js` y alinearlos con la estrategia elegida.

**Admin global:** como hoy `usuarios` con `rol = 'admin'` y/o `business_type IS NULL` según rutas; solo el admin puede cruzar tenants en vistas explícitas. **Ningún** dato de un tenant anterior debe filtrarse a operadores de otro tenant por variables globales, storage o JWT viejo.

## JWT y middleware

- Tras crear nueva instancia: **nuevo token** (o invalidación de sesión) con `tenant_id` coherente con el nuevo `clientes.id`.
- Reutilizar y extender `authMiddleware`, `authWithTenantHost`, `businessContextMiddleware` / `tenantBusinessFilter` según archivos en `api/middleware/` y servicios existentes.
- **Neon no lee headers HTTP:** cualquier `X-Tenant-Id` debe ser consumido solo por **Express** y reflejarse en consultas SQL con `WHERE tenant_id = $n` (y eventualmente `SET LOCAL` si se activa RLS).

## Auditoría obligatoria (“sin vestigios”)

Recorrer **Nexxo** (`app/`, `app/src/main/assets/`, `api/`) y el mirror **Pedidos-MG** tras sync:

- `localStorage` / `sessionStorage` en `app.js` (claves de KPIs, filtros, tenant, wizard).
- Variables globales y caches en memoria.
- Service Worker / IndexedDB si existen.
- Kotlin: `SessionRepository`, `ApiClientFactory`, `GestorNovaApi`, preferencias que guarden contexto de cooperativa sin aislar por tenant.
- Query params `tenant_id` en rutas como `configUbicacion` y similares.
- Grep orientativo: `tenant_id`, `tenantId`, `lineaNegocio`, `active_business`, `pedido_contador`, `clientes`.

**Permitido atravesar instancias:** solo usuario **admin** en flujos explícitos de administración.

## UX post-Wizard (no negociable)

1. Mensaje claro si P implica nueva instancia (nuevo `clientes.id`).
2. **Logout** completo (revocar/olvidar token en cliente; coherencia con servidor si hay refresh).
3. **Hard reload** de la página / WebView.
4. Verificación manual/automática: no quedan KPIs ni listados del tenant anterior.

## Entregables esperados

- Migraciones SQL en `api/db/migrations/` o `docs/migrations/` según convención del repo.
- Cambios en `api/routes/*.js` y servicios afectados.
- Cambios en `app/src/main/assets/app.js` (y HTML/CSS si aplica).
- Cambios Android mínimos para logout + reload fuerte si el flujo pasa por la app.
- Actualización de **`docs/MULTI_TENANT_BUSINESS_ISOLATION.md`** / **`docs/FIX_MULTI_TENANT_ISOLATION.md`** o nota de deprecación donde el comportamiento “solo cambia filtro” difiera del “nueva instancia”.
- Tests en `api/` (`npm test`) sin romper smoke.

## Restricciones

- No crear **una tabla física por tenant**.
- No subir secretos al Git público.
- Migraciones **incrementales**: backfill de `tenant_id` en `pedido_contador` legacy, luego constraints, luego endurecimiento.
- Mantener despliegue: cambios en `api/` y assets deben poder seguir el runbook hacia **Pedidos-MG** y Render.

Implementá con diffs acotados; si falta contexto, listá supuestos antes de cambiar comportamiento crítico en producción.

---

## Nota para humanos

Este prompt **cambia** el comportamiento del Wizard respecto de `setupWizard.js` actual (que valida nombre contra el mismo tenant). Usalo cuando el negocio decida que “cambiar nombre o rubro” = **nueva cooperativa en BD**, no solo rename en la misma fila `clientes`.
