# Avisos masivos por WhatsApp

## Endpoints

- `POST /api/whatsapp/broadcast/community` (admin)  
  Body JSON: `confirm` (**true** obligatorio), `titulo`, `mensaje`, `business_type` (opcional; default línea activa), placeholders opcionales `ciudad_ctx`, `direccion_ctx`, `telefono_ctx`.  
  Reemplazos en texto: `{ciudad}`, `{fecha}`, `{horario}`, `{direccion}`, `{telefono}`.

- `POST /api/whatsapp/broadcast/corte-programado` (admin)  
  Igual `confirm: true`; `zona_afectada`, `motivo`, `fecha_inicio`, `fecha_fin`, `mensaje`; no aplica a `municipio`.

## Destinatarios

Por ahora se toman **teléfonos distintos** de `pedidos.telefono_contacto` del tenant (y `business_type` si existe la columna).

## Límite de ritmo

~**9 envíos/segundo** (pausa 110 ms entre mensajes) para no saturar Meta/Whapi.

## Auditoría

Tras la migración, los envíos comunitarios se registran en **`comunicaciones_envios`**; cortes programados en **`cortes_programados`** (inserción best-effort si la tabla existe).

## UI

Botón flotante 📢 (solo admin) inyectado desde `app.js` — modal con aviso general o corte programado.

made by leavera77
