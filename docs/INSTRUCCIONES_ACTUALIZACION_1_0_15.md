# GestorNova 1.0.15 — APK, Drive y GitHub Pages

## 1. Generar el APK (Android Studio)

En la raíz del proyecto (`Nexxo`):

```powershell
cd C:\Users\leave\AndroidStudioProjects\Nexxo
.\gradlew renameReleaseApk
```

- La tarea Gradle `renameReleaseApk` copia la APK a **`release-export/`** en la raíz del repo (disco local). Si querés copiar a Google Drive, definí la variable de entorno **`GESTORNOVA_RELEASE_COPY_DIR`** con la ruta absoluta (ej. `G:\Mi unidad\Programas\Actualizaciones Android\release`). No configures la salida de `packageRelease` directamente en Drive: Gradle 9 falla con `AccessDeniedException` al inspeccionar esa ruta.
- Si no tenés `G:`, usá **Build → Build Bundle(s) / APK(s) → Build APK(s)** y tomá el APK desde `app\build\outputs\apk\release\` (o `release-renamed` si configuraste otra ruta).

El archivo esperado: `GestorNova-1.0.15(15)-release.apk`.

## 2. Subir a Google Drive (actualización masiva)

1. Subí el APK a tu carpeta compartida de releases.
2. Clic derecho en el archivo → **Compartir** → acceso **Cualquier persona con el enlace** (lector).
3. Copiá el enlace y extraé el **ID** del archivo (entre `/d/` y `/view`).
4. En **Neon** → SQL Editor, ejecutá el `INSERT` de `docs/NEON_app_version.sql` para `version_code = 15`, reemplazando `REEMPLAZAR_ID_APK_1_0_15_EN_DRIVE` por:

   `https://drive.google.com/uc?export=download&id=TU_ID_AQUI`

5. Si probaste con un `version_code` mayor (p. ej. 99), borrá esa fila o la app pedirá actualizar en bucle:

   ```sql
   DELETE FROM app_version WHERE version_code > 15;
   ```

## 3. Repositorio web (GitHub Pages — Pedidos-MG)

La fuente de verdad del front es:

`app/src/main/assets/index.html`

1. Copiá ese archivo al repo público [LEAVERA77/Pedidos-MG](https://github.com/LEAVERA77/Pedidos-MG) como `index.html` en la raíz (y `sw.js` si lo modificaste).
2. Commit y push a `main`; el workflow de Pages generará el sitio con `config.json` desde secretos.

## 4. Resumen de cambios en 1.0.15

- **Android / Neon:** si el chequeo de Internet por `fetch` falla en WebView, igual se intenta conectar a Neon.
- **Coordenadas en “Nuevo pedido”:** por defecto **WGS84**; las proyectadas siguen en el selector y en detalle / impresión / Excel.
- **Mapa:** filtros por color en panel **Colores** con pestaña lateral (ocultar/mostrar como Filtros y Dash).
- **Asignación:** desasignar, reasignar y notificaciones en `notificaciones_movil` para la app Android.
