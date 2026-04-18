## Restauración visual desde el backup (2026-04-16)

### Qué se recuperó en esta carpeta Nexxo

Se copió **solo la hoja de estilos del WebView** desde el backup:

- **Origen:** `C:\Users\leave\AndroidStudioProjects\Backup-Repos-GitHub_2026-04-16_034523\Nexxo\app\src\main\assets\styles.css`
- **Destino:** `Nexxo\app\src\main\assets\styles.css`

Eso devuelve el aspecto de **paneles, mapa, barra, modales y demás** tal como estaban en esa copia de seguridad (colores, tamaños, reglas responsive, etc.).

### Qué no se tocó (a propósito)

- **`app.js`**, **`map-view.js`**, **`map.js`**, **`offline.js`**, **`sw.js`**, API, Neon, multirrubro, zoom al pedido, filtros, etc. **Siguen como en tu repo actual** para no perder lógica ni correcciones.
- **`index.html`**: la zona del mapa y paneles (`#mapa-overlay-ui`, `#bp2`, …) **coincide** entre el backup y el proyecto actual; las diferencias están sobre todo en banners/admin y estadísticas. Reemplazar todo el `index.html` del backup **habría quitado** bloques que el `app.js` actual ya usa. Por eso no se sustituyó.

Si más adelante querés también el HTML “antiguo” completo, habría que hacer una **fusión manual** sección por sección (riesgo de romper funciones nuevas).

---

## Cómo probar en Android Studio

1. Abrí el proyecto **`Nexxo`** (`AndroidStudioProjects\Nexxo`).
2. **Build → Clean Project**.
3. **Run → app** (emulador o dispositivo).
4. Si no ves el nuevo aspecto: cerrá la app en el equipo, **Build → Rebuild Project** y volvé a ejecutar.

Los assets del WebView viven en **`app/src/main/assets/`**; no hace falta “Sync Gradle” solo por cambiar `styles.css`, pero si Gradle estaba roto, usá **Sync Project with Gradle Files** y luego Run.

---

## Repo de GitHub de la app Android

- **Repositorio:** [Pedidos-Manteniemiento-Android](https://github.com/LEAVERA77/Pedidos-Manteniemiento-Android)  
- **Remoto habitual:** `origin` → ese repo, rama **`main`**.

### Flujo típico

```powershell
cd C:\Users\leave\AndroidStudioProjects\Nexxo
git status
git pull origin main
# ... trabajás en assets / Kotlin ...
git add app/src/main/assets/styles.css
git commit -m "style: restaurar estilos WebView desde backup 2026-04-16

made by leavera77"
git push origin main
```

### Si usás GitHub Desktop o la pestaña Git de Android Studio

Mismo flujo: **Pull** antes de commitear, luego **Commit** y **Push** a `main`.

---

## Nota sobre el hook `post-commit` de este repo

En Nexxo puede existir un hook que **sincroniza assets** hacia otro clon (p. ej. Pedidos-MG). Si tu intención es **solo subir la app Android**, revisá que el push sea al remoto **`Pedidos-Manteniemiento-Android`** y no mezcles carpetas si no corresponde.
