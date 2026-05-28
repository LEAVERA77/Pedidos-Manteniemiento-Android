# EmailJS — informes con solo Public Key en Render

## Render (API)

| Variable | ¿Necesaria? |
|----------|-------------|
| `EMAILJS_PUBLIC_KEY` | Sí (ya la tenés) |
| `EMAILJS_SERVICE_ID` | Solo para informes **automáticos** por API (copiá el mismo secret de GitHub) |
| `EMAILJS_TEMPLATE_ID` | Igual que arriba |

**«Enviar ahora»** en la web admin funciona con solo `EMAILJS_PUBLIC_KEY` en Render: Service ID y Template ID salen de `config.json` (GitHub Pages).

## Plantilla en EmailJS (una vez)

Creá una plantilla **nueva** solo para informes (no reutilices la de «código de acceso»):

| Campo EmailJS | Variable |
|---------------|----------|
| Subject | `{{email_subject}}` |
| Content | `{{email_body}}` |
| To email | `{{to_email}}` |

En GitHub Secrets / `config.json` usá su ID en **`templateIdInforme`** (secret `EMAILJS_TEMPLATE_ID_INFORME`).  
La plantilla de reset queda en **`templateIdReset`** / `EMAILJS_TEMPLATE_ID`.

`made by leavera77`
