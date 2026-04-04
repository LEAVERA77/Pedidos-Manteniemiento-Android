# API — runbook operativo

## WhatsApp (Meta): corte masivo de reclamos

Cuando hay incidente, mantenimiento o saturación, se puede **bloquear el alta de nuevos reclamos por el bot** sin apagar el webhook.

### Por tenant (`clientes.configuracion` JSON en Neon)

Actualizar el JSON `configuracion` del registro en `clientes` del tenant:

| Clave | Tipo | Descripción |
|--------|------|-------------|
| `whatsapp_bloqueo_reclamos` | boolean o `"true"`/`"1"` | Si es verdadero, no se abre flujo de reclamo (lista, número de tipo, fila de lista). |
| `whatsapp_bloqueo_mensaje` | string | Texto que recibe el usuario (Markdown simple de WhatsApp: `*negrita*`). Si falta, se usa el default del servidor. |

Ejemplo (merge sobre el JSON existente):

```json
{
  "whatsapp_bloqueo_reclamos": true,
  "whatsapp_bloqueo_mensaje": "Por una emergencia en la red no tomamos reclamos por WhatsApp hasta nuevo aviso. Línea de guardia: …"
}
```

### Global (variables de entorno en Render u host)

| Variable | Efecto |
|----------|--------|
| `WHATSAPP_BLOQUEO_RECLAMOS` | `1` o `true`: bloquea **todos** los tenants (además de los que tengan flag en JSON). |
| `WHATSAPP_BLOQUEO_MENSAJE` | Mensaje por defecto si el tenant no define `whatsapp_bloqueo_mensaje`. |

### Comportamiento

- Con bloqueo activo: intención de **Cargar reclamo**, elección por **número de tipo** o **respuesta a lista interactiva** solo devuelve el mensaje de corte; **no** se crea sesión ni pedido.
- Sesiones ya iniciadas (`awaiting_desc`, `awaiting_opcional_id`, `awaiting_location`) **siguen** hasta cerrar el pedido.
- **Opinión post-cierre** (`cliente_opinion_pending`) y otros mensajes fuera del flujo de alta no se ven alterados por este flag.

### Desactivar

- Quitar o poner `whatsapp_bloqueo_reclamos: false` en el JSON del tenant.
- Quitar o desactivar `WHATSAPP_BLOQUEO_RECLAMOS` en el entorno (global).
