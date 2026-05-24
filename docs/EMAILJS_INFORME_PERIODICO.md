# EmailJS — plantilla unificada (informes + recuperación de clave)

Una sola plantilla en EmailJS evita el texto fijo de «Solicitud de acceso» en los informes.

## Pasos en EmailJS (una vez)

1. [EmailJS.com](https://www.emailjs.com/) → **Email Templates** → abrí tu plantilla (o **Create new**).
2. **To email:** `{{to_email}}`
3. **Subject:** pegá exactamente:

```
{{email_subject}}
```

4. **Content (cuerpo):** pegá exactamente:

```
{{{email_body}}}
```

(Las tres llaves conservan saltos de línea del informe.)

5. **Save**. Anotá el **Template ID** en GitHub Secrets / `config.json`.

## Variables que envía GestorNova

| Variable | Informe periódico | Recuperación de clave |
|----------|-------------------|------------------------|
| `email_subject` | Asunto del informe | «GestorNova — código…» |
| `email_body` | Texto completo del informe | Texto con el código |
| `to_email` / `to_name` | Destinatario | Admin |

También se envían `informe_cuerpo`, `message`, etc. por compatibilidad.

## `config.json` (opcional: dos plantillas)

```json
"emailjs": {
  "publicKey": "...",
  "serviceId": "service_...",
  "templateId": "template_reset",
  "templateIdInforme": "template_informe",
  "templateIdReset": "template_reset"
}
```

- Si solo tenés `templateId`, usala con la plantilla unificada de arriba (sirve para ambos).
- `templateIdInforme` / `templateIdReset` permiten plantillas separadas.

Secretos GitHub Pages: `EMAILJS_TEMPLATE_ID` y opcional `EMAILJS_TEMPLATE_ID_INFORME`.

Render (informes automáticos): `EMAILJS_TEMPLATE_ID_INFORME` o la misma plantilla unificada en `EMAILJS_TEMPLATE_ID`.

## Referencia en el repo

Texto listo para copiar: `app/src/main/assets/modules/emailjs-plantilla-unificada.js` (`PLANTILLA_EMAILJS_SUBJECT`, `PLANTILLA_EMAILJS_BODY`).

`made by leavera77`
