# Aislamiento multi-tenant por línea de negocio (`business_type`)

## Objetivo

Sin borrar datos en Neon, cada vista operativa (**electricidad**, **agua**, **municipio**) debe mostrar solo pedidos, socios del catálogo y estadísticas correspondientes al **negocio activo** del tenant. Al cambiar de línea en el panel admin, los datos del otro negocio **quedan en base** pero **no se listan**.

## Reglas de datos

| Área | Comportamiento |
|------|----------------|
| `pedidos.business_type` | Se setea en altas **API** (`POST /api/pedidos`) y **bot WhatsApp** (`crearPedidoDesdeWhatsappBot`) según el negocio activo del cliente (`loadTenantBusinessContext`). |
| `socios_catalogo.business_type` | El import Excel desde la web rellena la columna cuando existe (bulk insert en `app.js`). |
| Consultas SQL en front (Neon directo) | `pedidosFiltroTenantSql()` añade filtro por tenant + línea activa (`lineaNegocioOperativaCodigo()`). |
| Consultas API | Middleware `tenantBusinessFilter` + `pushPedidoBusinessFilter` en rutas de pedidos/estadísticas. |

## Errores corregidos (referencia)

- **SQL `business_type is ambiguous`**: en `cargarEstadisticas`, el sufijo de filtro copiado a la subconsulta con alias `p` debe calificar la columna como `p.business_type` (junto a `p.tenant_id`).
- **ReferenceError en `onchange` del modal Nuevo pedido**: con `app.js` como módulo ES, las funciones usadas en atributos HTML deben exponerse en `window` (p. ej. `syncPrioridadConTipoReclamo`, `syncSuministroElectricoUI`).
- **Reclamos vía bot sin `business_type`**: inserción dinámica en `api/services/pedidoWhatsappBot.js` ahora agrega `business_type` si la columna existe.

## Bot WhatsApp — búsqueda por identificador (`buscarReclamosPendientesPorIdentificador`)

- Por defecto el servidor usa **filtro estricto**: solo pedidos con `business_type` igual al negocio actual del webhook.
- Si necesitás el comportamiento anterior (filas legacy con `business_type` NULL tratadas como visibles para el bot), definí en Render:  
  `WHATSAPP_BOT_LEGACY_NULL_BUSINESS=1`.

## No destructivo (switch-business)

- No se eliminan filas al cambiar de negocio con **`POST /api/tenant/switch-business`**.
- Filas “legacy” con `business_type` NULL en `pedidos` se tratan como eléctricas en el filtro relajado del front; las **nuevas** altas siempre deberían traer valor explícito.

## Despliegue

- Cambios en `api/`: commit en **Nexxo** y copia a **Pedidos-MG** `api/`, luego push (Render suele desplegar desde Pedidos-MG).
- Cambios en `app/src/main/assets/`: `.\scripts\sync-assets-to-pedidos-mg.ps1` y commit en Pedidos-MG.

## Wizard: nueva instancia vs solo filtro

Si el admin **ya completó** el setup inicial y en el asistente cambia **nombre de empresa** y/o **tipo de negocio** (`business_type`) de forma que el par normalizado ya no coincide con el tenant actual, el backend crea **otro** `clientes` y reasigna al admin (ver `docs/MULTI_TENANT_BUSINESS_ISOLATION.md`). La web llama a `POST /api/setup/wizard` antes de `PUT /api/clientes/mi-configuracion`, aplica el JWT devuelto y fuerza recarga dura (`location.replace` con query `_gnreload`). No confundir con el listado filtrado por `switch-business`.

---
*Documento operativo del proyecto GestorNova / Pedidos-MG.*
