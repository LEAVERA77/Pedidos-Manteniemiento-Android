# EmailJS — plantilla SOLO para informes (obligatorio)

**No uses** la plantilla de «código de acceso» / «Solicitud de acceso» para informes. Duplicá la plantilla y usá un **Template ID distinto**.

## Pasos en EmailJS (una vez)

1. [EmailJS.com](https://www.emailjs.com/) → **Email Templates** → **Duplicate** la plantilla de reset (o **Create new**).
2. **To email:** `{{to_email}}`
3. **Subject:** `{{email_subject}}`
4. **Content:** borrá todo el texto de recuperación de clave y dejá solo:

```
{{email_body}}
```

5. **Save** → copiá el **Template ID** nuevo.
6. En el panel **Admin → Empresa → Informes**, pegalo en **Template ID informes** y guardá.
7. Opcional Render: `EMAILJS_TEMPLATE_ID_INFORME` = ese mismo ID (informes automáticos).
8. GitHub Secret opcional: `EMAILJS_TEMPLATE_ID_INFORME` para `config.json` en Pages.

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
