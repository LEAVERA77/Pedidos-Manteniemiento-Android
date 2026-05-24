# EmailJS — recuperación de contraseña (solo administrador)

## 1. Dashboard EmailJS

1. [EmailJS.com](https://www.emailjs.com/) → **Email Services** → vinculá **Gmail** (u otro). Anotá el **Service ID** (ej. `service_5cpzveh`).
2. **Email Templates** → **Create new template**.

## 2. Plantilla unificada (recomendado)

Usá la misma plantilla para informes y recuperación de clave. Ver **`docs/EMAILJS_INFORME_PERIODICO.md`**:

- **Subject:** `{{email_subject}}`
- **Content:** `{{{email_body}}}`
- **To email:** `{{to_email}}`

El front envía `email_subject` y `email_body` (y `to_email`, `to_name`, `token` por compatibilidad).

## 3. API Keys (Integration)

- **Public Key**: va en `app/src/main/assets/config.json` → `emailjs.publicKey` (y en Pages, el mismo `config.json` publicado sin secretos de Neon).
- **Private Key**: no hace falta para el flujo actual (envío desde el navegador con `@emailjs/browser`).

## 4. `config.json` (ejemplo)

```json
"emailjs": {
  "publicKey": "TU_PUBLIC_KEY",
  "serviceId": "service_5cpzveh",
  "templateId": "template_xxxxxxx"
}
```

No commitear `config.json` con datos reales en repos públicos; usá `config.example.json` como referencia.

## 5. Comportamiento en la app

- Solo cuentas con rol **administrador** pueden usar «Olvidaste tu contraseña» con email.
- El correo se envía a: **email opcional** del modal → si está vacío, **email de contacto de empresa** (`empresa_config` clave `email_contacto`) → si no hay, al **email del usuario** admin.
- En **Android WebView** EmailJS suele fallar (403): se muestra el código en pantalla como respaldo.
- **Técnicos**: no reciben recuperación por email; el **admin** genera **clave provisional** desde el panel; en Android el técnico debe **cambiar la clave** al ingresar.
