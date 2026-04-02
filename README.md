# Nexxo (Android)

App Android + WebView con los mismos assets que la versión web en GitHub Pages.

## Configuración

1. Copiá la plantilla: `app/src/main/assets/config.example.json` → `app/src/main/assets/config.json`
2. Completá la cadena **Neon** y opcionalmente **EmailJS**.

El archivo `config.json` está en `.gitignore` y no debe subirse al remoto.

## Derechos de autor

Ver [COPYRIGHT.md](./COPYRIGHT.md).

## Repo web (Pages)

[Pedidos-MG](https://github.com/LEAVERA77/Pedidos-MG) — despliegue con GitHub Actions y secretos (sin `config.json` en el árbol público).

## WebView → nativo

No existe una conversión automática completa de esta app a UI nativa; la lógica vive en un `index.html` muy grande. Para el alcance, fases y criterios de paridad, ver [docs/MIGRACION_WEBVIEW_A_NATIVO.md](./docs/MIGRACION_WEBVIEW_A_NATIVO.md).
