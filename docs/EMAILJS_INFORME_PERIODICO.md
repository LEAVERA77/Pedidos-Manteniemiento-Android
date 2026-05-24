# EmailJS — informes con solo Public Key en Render

## Render (API)

| Variable | ¿Necesaria? |
|----------|-------------|
| `EMAILJS_PUBLIC_KEY` | Sí (ya la tenés) |
| `EMAILJS_SERVICE_ID` | Solo para informes **automáticos** por API (copiá el mismo secret de GitHub) |
| `EMAILJS_TEMPLATE_ID` | Igual que arriba |

**«Enviar ahora»** en la web admin funciona con solo `EMAILJS_PUBLIC_KEY` en Render: Service ID y Template ID salen de `config.json` (GitHub Pages).

## Plantilla en EmailJS (una vez)

Subject: `{{email_subject}}`  
Content: `{{email_body}}`  
To: `{{to_email}}`

Así el informe no muestra texto de «código de acceso».

`made by leavera77`
