# Informes por email — plantilla GestorNova (automática)

El sistema incluye la plantilla **`GestorNova_Informe_Operativo`** (asunto `{{email_subject}}`, cuerpo `{{email_body}}`). **No hace falta** pegar Template ID en el panel admin.

## Cómo se resuelve la plantilla

1. **Render:** `EMAILJS_TEMPLATE_ID_INFORME` (si ya creaste la plantilla en EmailJS), o  
2. **`EMAILJS_PRIVATE_KEY`** en Render → la API intenta crear la plantilla en EmailJS al primer envío, o  
3. **GitHub Secret** `EMAILJS_TEMPLATE_ID_INFORME` → va a `config.json` → `emailjs.templateIdInforme`.

Recuperación de clave sigue usando `EMAILJS_TEMPLATE_ID` / `templateIdReset`.

## Si falla el primer envío

En [EmailJS](https://www.emailjs.com/) → **Email Templates** → **Create** → nombre `GestorNova_Informe_Operativo`:

- **To:** `{{to_email}}`
- **Subject:** `{{email_subject}}`
- **Content:** `{{email_body}}`

Guardá y poné el Template ID en Render como `EMAILJS_TEMPLATE_ID_INFORME`.

**Private Key:** EmailJS → Account → Security → API para aplicaciones no navegador + copiar Private Key a `EMAILJS_PRIVATE_KEY` en Render.

`made by leavera77`
