# EmailJS — plantilla para informes periódicos

Los informes usan las mismas credenciales que la recuperación de contraseña (`config.json` / secretos GitHub). Conviene **duplicar la plantilla** en EmailJS para no mezclar textos de “código de acceso” con el informe operativo.

## Variables que envía GestorNova

| Variable | Uso |
|----------|-----|
| `to_email` | Destinatario |
| `to_name` | Nombre (ej. Administrador) |
| `informe_asunto` | Asunto completo del informe |
| `informe_cuerpo` | Cuerpo en texto plano (resumen + análisis IA) |
| `informe_periodo` | Ej. «diario (últimas 24 horas)» |
| `informe_tipo` | `diario`, `semanal`, `mensual` o `prueba` |
| `message` | Igual que `informe_cuerpo` (compatibilidad) |
| `subject` | Igual que `informe_asunto` |
| `app_name` | Nombre de la empresa / tenant |
| `token` | `—` (no usar en informes) |

Opcional en Render: `EMAILJS_TEMPLATE_ID_INFORME` apuntando a esta plantilla.

## Ejemplo de plantilla (Email Templates)

**Subject:** `{{informe_asunto}}`

**Content (texto):**

```
{{informe_cuerpo}}
```

**To email:** `{{to_email}}`

Si mantenés la plantilla de recuperación de clave, el correo seguirá mostrando “Solicitud de acceso” hasta que cambies el texto o uses una plantilla dedicada.

## Frecuencias

| Valor | Período analizado |
|-------|-------------------|
| `diario` | Últimas 24 horas |
| `semanal` | Últimos 7 días |
| `mensual` | Último mes |

El análisis breve usa Groq si `GROQ_API_KEY` está en Render; si no, un texto automático según los números.

`made by leavera77`
