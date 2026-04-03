# Nexxo (Android)

**Proyecto Android Studio (técnicos / cuadrillas), carpeta local:** `C:\Users\leave\AndroidStudioProjects\Nexxo`.

App Android + WebView: la interfaz se carga desde **GitHub Pages** ([Pedidos-MG](https://github.com/LEAVERA77/Pedidos-MG)), así los cambios en el repo web llegan al técnico sin nuevo APK. Los secretos siguen en `assets/config.json` (solo en el dispositivo, no en Git).

El archivo `app/src/main/assets/index.html` sigue siendo la fuente para copiar al repo web; la APK ya no lo usa como pantalla principal.

## Configuración

1. Copiá la plantilla: `app/src/main/assets/config.example.json` → `app/src/main/assets/config.json`
2. Completá la cadena **Neon** y opcionalmente **EmailJS**.

El archivo `config.json` está en `.gitignore` y no debe subirse al remoto.

## Derechos de autor

Ver [COPYRIGHT.md](./COPYRIGHT.md).

## Repo web (Pages)

[Pedidos-MG](https://github.com/LEAVERA77/Pedidos-MG) — despliegue con GitHub Actions y secretos (sin `config.json` en el árbol público).

## Política de privacidad (Play Console / Meta WhatsApp)

El documento legal público vive en el repo **Pedidos-MG** (`privacy/index.html`). Tras cada deploy de Pages:

- **Recomendado:** `https://leavera77.github.io/Pedidos-MG/privacy/`
- **Alternativa** (solo si creás el repo proyecto `privacy` en GitHub): `https://leavera77.github.io/privacy/` — ver README de Pedidos-MG.

**Ícono 1024×1024** y **categoría “Empresas y páginas”** en Meta: son requisitos del panel de la app comercial; el ícono debés subirlo vos como imagen PNG en Meta / Play.

## API Node (Render) y WhatsApp Meta

El backend vive en `api/`. Los secretos de Meta (**access token**, **app secret**, **verify token**, **phone number id**) se cargan como **variables de entorno** en el servicio (p. ej. Render), no en el repositorio.

1. Copiá la plantilla: `api/.env.example` → `api/.env` (local; `api/.env` está en `.gitignore`).
2. En Render, definí las mismas claves que en `api/.env.example` (`META_*`, `WHATSAPP_BOT_*`, etc.).
3. En Meta Developers, webhook **Callback URL**: `https://<tu-api>/api/webhooks/whatsapp/meta` y el mismo **Verify token** que `META_WEBHOOK_VERIFY_TOKEN`.

Si algún token o secret se expuso en un chat o commit, **revocalo y generá uno nuevo** en Meta.

## WebView → nativo

No existe una conversión automática completa de esta app a UI nativa; la lógica vive en un `index.html` muy grande. Para el alcance, fases y criterios de paridad, ver [docs/MIGRACION_WEBVIEW_A_NATIVO.md](./docs/MIGRACION_WEBVIEW_A_NATIVO.md).
