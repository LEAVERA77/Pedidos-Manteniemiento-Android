# Plan Top 3 — Cooperativas (agua / electricidad)

Documento para **Leandro Vera / GestorNova**. Stack: Neon, API Node (Render), front SPA, Android WebView, Cloudinary, Meta WhatsApp.

## Selección de las 3 features (orden de valor)

| Orden | Feature | Por qué primero |
|------|---------|-------------------|
| **1** | **D — Geocercas** | Acredita que el técnico está en el lugar del reclamo; reduce disputas y refuerza auditoría operativa (redes de agua/electricidad). |
| **2** | **C — Chat interno por pedido** | Coordina dudas en tiempo casi real sin salir del expediente; historial en Neon para trazabilidad; encaja con notificaciones móviles ya existentes. |
| **3** | **B — Galería múltiple (antes/después)** | Evidencia fotográfica ordenada (hasta N por categoría); Cloudinary sigue siendo el almacén; **no exige** nuevas columnas en `pedidos` (tabla `pedido_foto_clasificada`). |

### Sobre **E — Satisfacción por WhatsApp**

Ya está cubierto en API: `notifyPedidoCierreWhatsAppSafe` envía el texto 1–5 + comentario opcional y `registerPendingClienteOpinion` deja la ventana en Neon; el webhook Meta + `whatsappClienteOpinion.js` persiste en `pedidos` (`opinion_cliente_estrellas`, etc.).  
**No duplicamos E** en este paquete; el dashboard por técnico/barrio puede armarse con consultas SQL / pestaña Estadísticas existente.

### Features no incluidas aquí

- **A — Reportes por email**: requiere cron confiable (Render cron, GitHub Actions o worker) y plantillas; conviene como fase 4.
- **F — Ranking técnicos**: es principalmente agregación SQL + export; se puede montar sobre los mismos datos cuando geocerca + satisfacción estén maduros.

## Orden de implementación recomendado

1. Ejecutar **`docs/NEON_top3_operativa_cooperativa.sql`** en Neon.  
2. Desplegar **API** (Nexxo `api/` y copia en **Pedidos-MG** `api/` para Render).  
3. **Front**: llamar endpoints con JWT (funciones `gnOperativa*` en `app.js`); enganchar UI en detalle de pedido y panel admin (config geocerca).  
4. **Android**: puente `AndroidDevice.getCurrentLocationForGeocerca(cb)` y, antes de pasar a “En ejecución”, llamar verificación API.

## Flujos de usuario

### D — Geocerca

1. Admin define **radio** (ej. 100 m) y si está **habilitada** (`PUT /api/tenant-operativa/geocerca-settings`).  
2. Técnico abre el pedido y pulsa **Iniciar en sitio** (o equivalente).  
3. La app obtiene **GPS** (puente Android o `navigator.geolocation` en web).  
4. Front llama `POST /api/pedidos/:id/geocerca/verificar` con `{ lat, lng }`.  
5. API calcula distancia Haversine al `lat`/`lng` del pedido, **registra** fila en `pedido_geocerca_evento`, responde `{ permitido, distancia_metros, max_metros }`.  
6. Si `permitido === false`, la UI **no** debe cambiar estado a “En ejecución” (o lo revierte).  
7. Admin revisa intentos: `GET /api/pedidos/:id/geocerca/eventos` (solo admin).

### C — Chat interno

1. Técnico o admin abre **Chat del reclamo** en el detalle.  
2. `GET /api/pedidos/:id/chat-interno/mensajes` carga historial.  
3. `POST /api/pedidos/:id/chat-interno/mensajes` con `{ cuerpo }` guarda en `pedido_chat_mensaje`.  
4. API encola **notificación** en `notificaciones_movil` para el técnico asignado (si escribe admin) o para **admins del tenant** (si escribe el técnico).  
5. La app Android ya hace **poll** de `notificaciones_movil` → notificación local.

### B — Fotos clasificadas

1. Técnico elige **antes** o **después** y sube una o más fotos (base64 o ya subidas a Cloudinary en cliente).  
2. `POST /api/pedidos/:id/fotos-clasificadas` con `{ tipo, fotos_base64[] }` sube a Cloudinary e inserta filas en `pedido_foto_clasificada`.  
3. `GET /api/pedidos/:id/fotos-clasificadas` devuelve lista ordenada para carrusel/grid.  
4. Opcional: seguir usando `pedidos.foto_urls` con `||` para compatibilidad; esta tabla da **tipo + orden** explícitos.

## Archivos tocados en el repo

| Área | Archivo |
|------|---------|
| SQL | `docs/NEON_top3_operativa_cooperativa.sql` |
| API | `api/services/geocercaHaversine.js`, `api/routes/pedidoOperativa.js`, `api/routes/tenantOperativaSettings.js` |
| API | `api/services/notificacionesMovilEnqueue.js`, `api/routes/pedidos.js`, `api/httpApp.js` |
| Front | `app/src/main/assets/app.js` (helpers `gnOperativa*`) |
| Android | `MainActivity.java` (`getCurrentLocationForGeocerca`) |

## Endpoints (resumen)

| Método | Ruta | Rol |
|--------|------|-----|
| PUT | `/api/tenant-operativa/geocerca-settings` | admin |
| GET | `/api/tenant-operativa/geocerca-settings` | admin |
| POST | `/api/pedidos/:id/geocerca/verificar` | técnico asignado o admin |
| GET | `/api/pedidos/:id/geocerca/eventos` | admin (historial de intentos) |
| GET | `/api/pedidos/:id/chat-interno/mensajes` | técnico asignado o admin |
| POST | `/api/pedidos/:id/chat-interno/mensajes` | técnico asignado o admin |
| GET | `/api/pedidos/:id/fotos-clasificadas` | técnico asignado o admin |
| POST | `/api/pedidos/:id/fotos-clasificadas` | técnico asignado o admin |

Autenticación: header `Authorization: Bearer <JWT>` (igual que el resto de la API).

## Notas de seguridad

- El front **no debe** ser la única barrera: idealmente el cambio de estado “En ejecución” también pase por **API** o validación server-side; mientras la app use Neon directo, la geocerca actúa como **control registrado** y UX fuerte.  
- Ajustar políticas CORS en Render si agregás un origen nuevo.
