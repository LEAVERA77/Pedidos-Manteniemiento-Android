# Paridad SQL directo (Neon) vs API REST

El front (`app.js`) usa **dos canales** hacia el backend. Esta tabla documenta **qué hace cada uno** para evitar duplicar efectos o olvidar side-effects (WhatsApp, notificaciones).

## Regla general

- **Lecturas y updates masivos** suelen ir por **SQL** vía proxy Neon en el cliente (`sqlSimple`, `ejecutarSQLConReintentos`), cuando hay conexión y no es modo offline.
- **API JWT** se usa cuando hace falta lógica en servidor, permisos centralizados, o **efectos** (envío WhatsApp, Cloudinary) que no deben reimplementarse en SQL desde el navegador.

Si cambiás un campo en la BD, revisá si existe un **POST** asociado en la API para el mismo flujo.

## Endpoints usados desde el front (resumen)

| Ruta | Método | Cuándo | Efecto típico |
|------|--------|--------|----------------|
| `/api/auth/login` | POST | Login con API configurada | JWT en `localStorage` |
| `/api/clientes/mi-configuracion` | GET/PUT | Setup wizard, tipo de negocio (web admin) | Actualiza `clientes` |
| `/api/pedidos/:id` | PUT | `pedidoPutApi` (p. ej. iniciar ejecución si API responde) | Update pedido vía Express |
| `/api/pedidos/:id/notify-cierre-whatsapp` | POST | Tras cierre hecho por SQL | WA cierre + registro opinión pendiente en Neon |
| `/api/pedidos/:id/whatsapp-aviso-cliente` | POST | Eventos `inicio`, `avance`, etc. | WA al vecino según política |
| `/api/whatsapp/meta/enviar-texto` | POST | Envíos puntuales desde UI | Depende del cuerpo |

Búsqueda en código: `apiUrl(`, `pedidoPutApi`, `notificarCierreWhatsappApi`, `notificarWhatsappClienteEventoApi`.

## Updates de pedidos por SQL (`updPedido`)

`updPedido` construye `UPDATE pedidos SET ...` y ejecuta en Neon. Campos permitidos listados en el `Set` **CN** en `app.js` (cerca de la definición de `app`).

**Importante:** después de cerrar un pedido por SQL, el front puede llamar **`notificarCierreWhatsappApi`** para que la API envíe el mensaje de cierre y deje la ventana de **opinión** en tabla `cliente_opinion_pending` (Neon), no solo en memoria.

## Flujos críticos

1. **Inicio en sitio:** `pedidoPutApi` con `En ejecución` si hay API; si no, `updPedido` + opcional `notificarWhatsappClienteEventoApi('inicio')`.
2. **Cierre:** update SQL (foto, trabajo, estado Cerrado) + `notificarCierreWhatsappApi` para WA y opinión pendiente persistida.
3. **Asignación:** principalmente SQL; revisar si en el futuro se centraliza en API para auditoría.

## Mantenimiento de este documento

Al añadir un `fetch(apiUrl(...))` nuevo o un campo nuevo en `updPedido`, actualizá esta tabla en el mismo PR.
