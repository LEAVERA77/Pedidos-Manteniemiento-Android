# Publicar APK y avisar de nuevas versiones en la app

La app compara su `versionCode` (definido en `app/build.gradle.kts`) con un JSON publicado en Internet. Si el remoto es mayor, al abrir la app se ofrece descargar la APK.

## 1. Versión en el proyecto

En `app/build.gradle.kts`, en cada release:

- Subí **`versionCode`** (entero que solo aumenta: 1, 2, 3…).
- Actualizá **`versionName`** (texto visible, p. ej. `1.0.1`, `1.1.0`).

Android usa **`versionCode`** para decidir si hay actualización; el nombre es informativo.

## 2. Compilar la APK

En Android Studio: **Build → Generate Signed Bundle / APK** (o `assembleRelease` con tu keystore). Guardá el APK con un nombre claro, p. ej. `PedidosMG-release.apk`.

## 3. Subir la APK al repositorio (recomendado: GitHub Releases)

1. En GitHub: **Releases → Create a new release**.
2. Etiqueta coherente con la versión, p. ej. `v1.0.1`.
3. Adjuntá el archivo `.apk`.
4. Publicá el release.

Copiá la **URL directa del adjunto** (clic derecho en el nombre del archivo → copiar enlace). Esa URL va en el campo `apkUrl` del JSON del paso 4.

> Alternativa: subir la APK a otra rama o almacenamiento propio; lo importante es una **URL HTTPS pública** estable.

## 4. JSON de “última versión” en el repo

1. En tu repositorio (puede ser el mismo de la web o uno solo para distribución), creá un archivo JSON con la forma de `docs/app_update_latest.example.json`.
2. Rellená `versionCode` y `versionName` **iguales** a los de `build.gradle.kts` de esa release.
3. Poné en `apkUrl` el enlace directo al APK (GitHub Releases u otro).
4. Hacé commit y push.

Obtené la URL **raw** del archivo en GitHub, por ejemplo:

`https://raw.githubusercontent.com/USUARIO/REPO/rama/docs/app_update_latest.json`

## 5. Configurar la app Android

Editá `app/src/main/assets/app_update_config.json` y poné esa URL en `manifestUrl`:

```json
{
  "manifestUrl": "https://raw.githubusercontent.com/USUARIO/REPO/main/docs/app_update_latest.json"
}
```

Volvé a compilar e instalá la nueva APK en los dispositivos (o distribuí solo la actualización siguiente; las instalaciones antiguas sin este asset no comprobarán hasta que actualicen una vez con `manifestUrl` configurado).

## 6. Flujo en el dispositivo

Al iniciar `MainActivity`, la app descarga el JSON remoto. Si `versionCode` remoto es **mayor** que el de la APK instalada, muestra un diálogo para abrir el navegador/descargas con `apkUrl`. El usuario instala la APK manualmente (orígenes desconocidos / “instalar aplicaciones desconocidas” según el fabricante).

## Notas

- No sustituye a **Google Play** (actualizaciones automáticas); es adecuado para distribución interna o por enlace.
- El JSON debe servirse por **HTTPS**.
- Cada release nueva: subís APK, actualizá el JSON en el repo con el nuevo `versionCode` y la nueva `apkUrl`.
