# Nexxo (Android)

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

## WebView → nativo

No existe una conversión automática completa de esta app a UI nativa; la lógica vive en un `index.html` muy grande. Para el alcance, fases y criterios de paridad, ver [docs/MIGRACION_WEBVIEW_A_NATIVO.md](./docs/MIGRACION_WEBVIEW_A_NATIVO.md).
