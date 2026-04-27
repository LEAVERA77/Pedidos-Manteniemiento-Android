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

---

## WhatsApp: chat humano (tipo «Otros»)

Cuando el vecino elige el tipo de reclamo **Otros** en el bot (lista o número), **no** se abre el flujo de pedido (descripción / NIS / ubicación). Pasa a **chat con representante**: los mensajes se guardan en Neon y el **administrador** los ve en la web (avisos + modal *Chat WhatsApp*) y responde por la API hacia Meta.

### Tablas (creadas automáticamente al primer uso)

- `whatsapp_human_chat_session` — una fila abierta por `(tenant_id, phone_canonical)` en estados `queued` o `active`.
- `whatsapp_human_chat_message` — mensajes `in` (cliente) / `out` (admin).

### API (JWT, solo admin)

Base: `/api/whatsapp/human-chat`

| Método | Ruta | Uso |
|--------|------|-----|
| GET | `/sessions` | Listar sesiones abiertas del tenant. |
| GET | `/sessions/:id/messages` | Historial + datos de sesión. |
| POST | `/sessions/:id/activate` | Marcar sesión como *active* (solo una *active* por tenant; el resto vuelve a *queued*). |
| POST | `/sessions/:id/send` | Cuerpo `{ "text": "..." }` — envía WhatsApp al cliente y guarda mensaje *out*. |
| POST | `/sessions/:id/close` | Cierra la sesión. |

### Cola y bloqueo de reclamos

- Si hay otro cliente **active**, los nuevos quedan en **lista de espera** (mensaje automático del bot con posición aproximada).
- Con **`whatsapp_bloqueo_reclamos`** activo, el bot **sigue permitiendo** elegir **Otros** → chat humano (no cuenta como alta de pedido). El resto de tipos siguen bloqueados como antes.
- En **chat humano**, la palabra *Hola* se trata como mensaje del cliente (se guarda en el hilo), **no** como reinicio del menú automático (eso solo aplica fuera de ese modo).
- **POST …/activate** desde el admin: si la sesión estaba **cerrada**, pasa a **queued** y luego a **active** para poder seguir el hilo y enviar respuestas.

### Línea tercero / Whapi (sin menú «Otros»)

- Variable **`WHATSAPP_HUMAN_CHAT_DIRECT_PHONES`**: teléfonos (solo dígitos; varios separados por coma o `;`, misma normalización que *activar* / *desactivar*). Esos remitentes abren el chat humano con el **primer mensaje** de texto (no hace falta *menú* → *Otros*). *Menú* / *0* / *inicio* / *ayuda* siguen yendo al resumen de bienvenida. Vacío, `0`, `false` u `off` desactiva la lista. Si no definís la variable, por defecto se usa `5493436986848`; en otra instancia, definí la lista o dejá el env vacío y agregá solo los que correspondan.
