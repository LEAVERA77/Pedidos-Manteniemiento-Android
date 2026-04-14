# Brief de contexto — GestorNova / Nexxo (para otra IA)

Documento generado para **cargar contexto** en otra sesión de IA o herramienta. No sustituye el transcript íntegro del chat en Cursor.

---

## 1. Repositorios y roles

| Rol | Repo GitHub | Uso |
|-----|-------------|-----|
| App Android (WebView + Kotlin) | [Pedidos-Manteniemiento-Android](https://github.com/LEAVERA77/Pedidos-Manteniemiento-Android) | Clon local habitual: `C:\Users\leave\AndroidStudioProjects\Nexxo` |
| Admin web + Pages + API en repo | [Pedidos-MG](https://github.com/LEAVERA77/Pedidos-MG) | Clon típico: `C:\Users\leave\AndroidStudioProjects\Pedidos-MG` |
| Sitio publicado (Pages) | — | `https://leavera77.github.io/Pedidos-MG/` |

**Paridad de front:** cambios en `app/src/main/assets/` (HTML, CSS, JS) suelen sincronizarse a la raíz de Pedidos-MG con `.\scripts\sync-assets-to-pedidos-mg.ps1` desde la raíz de Nexxo.

**Preferencia del usuario:** trabajo canónico del Android en carpeta **Nexxo** y remoto **Pedidos-Manteniemiento-Android** (ver reglas en `.cursor/rules/`).

---

## 2. Stack relevante del front embebido

- Panel web en `app/src/main/assets/`: `index.html`, `app.js`, `map.js`, `map-view.js`, `styles.css`, `offline.js`, `sw.js`, etc.
- Mapa: **Leaflet** (CDN en `index.html`).
- Módulos ES: `index.html` carga `app.js` como `type="module"`.
- Service Worker (`sw.js`) cachea shell/tiles; al cambiar assets importantes conviene **subir versión** de `CACHE_SHELL` / `SW_VERSION` para forzar actualización en navegadores.

---

## 3. Hitos de esta conversación (orden aproximado)

1. **Reglas Cursor:** preferencia explícita de trabajar siempre en Nexxo + repo Android canónico (commits en `.cursor/rules/` en su momento).
2. **Problemas post-cambios de coordenadas:** login web “Verificando red…”, mapa/GPS/FAB en Android; se aplicaron fixes (regex, pane GPS, zoom, `ensureMapReady`, etc.) y sync a Pedidos-MG.
3. **Rollback duro del usuario:** se hizo `git reset --hard` + `push --force-with-lease` a un estado **anterior** al bloque grande de “coordenadas unificadas”:
   - Nexxo quedó en `95b8c0f` (mensaje tipo fix bot / estado pre-feature coords).
   - Pedidos-MG quedó en `12c3005` (sync docs).
4. **Restauración a commit del control de cursor (prompt L.DomEvent):**
   - Nexxo → `5921066` (`fix(map): control coordenadas cursor con L.DomEvent y arrastre fijo`).
   - Pedidos-MG → `8238d53` (`sync(map): control coordenadas cursor desde Nexxo (L.DomEvent, bottomleft)`).
5. **Fixes posteriores (mapa tap, GPS, web):** varios commits hasta estabilizar; luego **separación UX Android vs web** (último bloque acordado en conversación):
   - Android: sin banner/control de coordenadas en mapa; botón ubicación prioriza **GPS del dispositivo** (no oficina primero).
   - Web: control de coordenadas con **Ir** a lat/lng (centrar, marcar, abrir alta de pedido); **conversor** decimal ↔ GMS en barra superior.
   - Ambas: **paneles del mapa arrancan cerrados** al login / restore de sesión.
   - SW bump (ej. shell v36) para caché en Pages.

**Commits de referencia del último bloque acordado (verificar con `git log -1` en cada repo):**

- Nexxo: `f9a1a5f` — `feat(mapa): separar UX Android/web de coords y GPS`
- Pedidos-MG: `70e574b` — sync del mismo mensaje

---

## 4. Backup local de repos (usuario)

Carpeta creada en:

`C:\Users\leave\AndroidStudioProjects\Backup-GestorNova_2026-04-14_044603`

Contenido típico:

- `Nexxo_2026-04-14_044603.zip`
- `Pedidos-MG_2026-04-14_044603.zip`

(Restaurar: descomprimir y reemplazar carpetas del clon, o clonar de nuevo y copiar encima con cuidado.)

---

## 5. Comandos útiles (PowerShell)

```powershell
# Estado y último commit
cd C:\Users\leave\AndroidStudioProjects\Nexxo
git status
git log -3 --oneline

cd C:\Users\leave\AndroidStudioProjects\Pedidos-MG
git status
git log -3 --oneline

# Sincronizar assets Nexxo → Pedidos-MG
cd C:\Users\leave\AndroidStudioProjects\Nexxo
.\scripts\sync-assets-to-pedidos-mg.ps1
```

**Workflow habitual:** commit + push en Nexxo; si tocó `app/src/main/assets/` o `api/`, sync y commit + push en Pedidos-MG (según reglas del proyecto).

---

## 6. Android Studio (después de cambios)

- Solo assets/JS/CSS: **Run** ▶; si no se ven cambios en WebView: **Build → Clean Project** → **Run**.
- Si tocás Gradle: **Sync Project with Gradle Files** → **Run**.

---

## 7. Archivos tocados con frecuencia en estos temas

| Área | Rutas típicas |
|------|----------------|
| Mapa / cursor / init | `app/src/main/assets/map-view.js` |
| Lógica app, login, GPS, paneles | `app/src/main/assets/app.js` |
| Shell HTML | `app/src/main/assets/index.html` |
| Estilos | `app/src/main/assets/styles.css` |
| PWA / caché | `app/src/main/assets/sw.js` |

---

## 8. Qué pedir a la siguiente IA

- Respetar **dos repos** (Nexxo + Pedidos-MG) cuando el cambio afecte el front compartido o Pages.
- No mezclar comportamiento **Android vs web** sin `esAndroidWebViewMapa()` o equivalente.
- Tras cambios en assets web: **bump** razonable en `sw.js` y recordar **Ctrl+F5** en Pages para probar.
- Commits con convención del proyecto y línea `made by leavera77` donde aplique la regla del repo.

---

*Generado como contexto exportable. Fecha de referencia del sistema: abril 2026.*

made by leavera77
