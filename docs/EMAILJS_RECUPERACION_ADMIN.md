# EmailJS — recuperación de contraseña (solo administrador)

## 1. Dashboard EmailJS

1. [EmailJS.com](https://www.emailjs.com/) → **Email Services** → vinculá **Gmail** (u otro). Anotá el **Service ID** (ej. `service_5cpzveh`).
2. **Email Templates** → **Create new template**.

## 2. Campos del template (variables)

El front envía estos `template_params` (nombres exactos):

| Variable      | Uso |
|---------------|-----|
| `to_email`    | Destino del correo (email de empresa, el que el admin elija, o el del usuario admin). |
| `to_name`     | Nombre del administrador. |
| `token`       | Código de 6 dígitos (válido ~30 min). |
| `app_name`    | Nombre de la empresa (desde `EMPRESA_CFG` / branding). |

En el template:

- **To email**: `{{to_email}}` (campo *To* dinámico según tu plan; en plantillas gratuitas suele configurarse en *Settings* del template como “Send to email” = `{{to_email}}`).
- **Subject**: ej. `{{app_name}} — código para restablecer contraseña`
- **Content**: texto con el código `{{token}}` y aviso de caducidad.

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
