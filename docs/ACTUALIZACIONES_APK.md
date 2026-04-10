# Publicar APK y avisar de nuevas versiones en la app

La app compara su `versionCode` (definido en `app/build.gradle.kts`) con un JSON publicado en Internet. Si el remoto es mayor, al abrir la app se ofrece descargar la APK (también al volver a primer plano y al conectar Neon).

**Versión actual del proyecto (Gradle):** ver `app/build.gradle.kts` (`versionCode` / `versionName`).

**Publicar una versión nueva (ej. 1.0.21):** compilá la APK con el `versionCode` nuevo, subila a Drive, ejecutá en Neon el SQL de `docs/NEON_app_version_1_0_21.sql` (o copiá el patrón cambiando números y URL). El `apk_url` debe ser el APK que **ya lleva** ese `versionCode` dentro del manifest; si Neon dice 21 y el APK es 20, Android puede rechazar la instalación.

---

## Flujo recomendado: API + Neon + Google Drive

La versión se consulta desde la base Neon a través de la API Node.js. El APK se aloja en Google Drive.

### 1. Configurar Neon

Ejecutá el SQL en `docs/NEON_app_version.sql` en el editor SQL de Neon. Eso crea la tabla `app_version` e inserta la fila para la versión 1.0.2.

### 2. Obtener el ID del APK en Google Drive

1. Subí `Nexxo-X.X.X.apk` a la carpeta [Actualizaciones Android](https://drive.google.com/drive/folders/1ByPSsBQA_saBcIg1rCSwwyTKxO42EjTX).
2. Clic derecho en el APK → Compartir → “Cualquier persona con el enlace” → Copiar enlace.
3. El ID está en la URL: `https://drive.google.com/file/d/XXXXXXXXXX/view` → `XXXXXXXXXX` es el ID.
4. En Neon SQL Editor:
   ```sql
   UPDATE app_version SET apk_url = 'https://drive.google.com/uc?export=download&id=TU_ID_AQUI' WHERE version_code = 3;
   ```

### 3. Desplegar la API Node.js

1. En la carpeta `api/`:
   ```bash
   cd api
   npm install
   ```
2. Creá `api/.env` (copiá de `.env.example`) con:
   ```
   DATABASE_URL=postgresql://neondb_owner:...@ep-gentle-silence-adns9whd-pooler.../neondb?sslmode=require
   ```
3. Desplegá en Render, Railway, Fly.io u otro servicio Node. Ejecutá `npm start` como comando.
4. Anotá la URL pública, p. ej. `https://Nexxo-api.onrender.com`.

### 4. Configurar la app Android

Editá `app/src/main/assets/app_update_config.json`:

```json
{
  "manifestUrl": "https://TU_API_URL/api/app-version"
}
```

Reemplazá `TU_API_URL` por la URL real de tu API desplegada.

### 5. Compilar y publicar cada nueva versión

1. **En `app/build.gradle.kts`:** subí `versionCode` (p. ej. 4) y `versionName` (p. ej. `"1.0.3"`).
2. **En Android Studio:** Build → Generate Signed Bundle / APK. Generá la APK firmada.
3. La salida estándar queda en `app/build/outputs/apk/release/`. La tarea Gradle **`renameReleaseApk`** copia una copia renombrada a **`release-export/`** en la raíz del repo (disco local). Para copiar además a Google Drive, definí la variable de entorno **`GESTORNOVA_RELEASE_COPY_DIR`** con la ruta absoluta de la carpeta destino antes de ejecutar Gradle. **No** enlaces la carpeta `app/build` a “Mi unidad”: Gradle 9 falla al empaquetar (`packageRelease`) con `AccessDeniedException`.
4. **Subí la APK** a la carpeta de Drive (desde `release-export/` o la copia en Drive).
5. **En Neon:** ejecutá:
   ```sql
   INSERT INTO app_version (version_code, version_name, apk_url, release_notes, force_update)
   VALUES (4, '1.0.3', 'https://drive.google.com/uc?export=download&id=ID_NUEVO_APK', 'Descripción de cambios', false);
   ```
6. Las apps instaladas, al iniciar sesión, consultan la API. Si detectan `versionCode` mayor, muestran el diálogo para actualizar.

---

## Flujo alternativo: JSON estático (GitHub o Drive)

Si preferís no usar la API, podés usar un JSON estático:

1. Subí el APK a Drive (o GitHub Releases).
2. Creá un archivo JSON como `docs/app_update_latest.example.json` con `versionCode`, `versionName`, `apkUrl`, etc.
3. Publicalo en GitHub (raw) o Drive.
4. En `app_update_config.json`, poné la URL directa de ese JSON en `manifestUrl`.

---

## Versión en pantalla de login

La pantalla de inicio muestra “Versión X.X.X” debajo del botón “¿Olvidaste tu contraseña?” cuando la app corre en Android (WebView).

---

## Comportamiento en el dispositivo

Al iniciar `MainActivity`, la app descarga el JSON desde `manifestUrl`. Si `versionCode` remoto es **mayor** que el instalado, muestra un diálogo para abrir el navegador con `apkUrl`. El usuario instala la APK manualmente (orígenes desconocidos habilitados).

Si `forceUpdate` es `true`, el diálogo no permite “Más tarde” y exige actualizar para continuar.
