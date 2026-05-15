# Baseline y seguimiento — refactor `app.js`

## Objetivo

Medir y documentar el comportamiento **antes y después** de extraer código de [`app/src/main/assets/app.js`](../app/src/main/assets/app.js) y aplazar módulos admin con `import()`, para validar mejoras en Android WebView y en admin web.

## Cómo medir (manual)

1. **Chrome → Remote debugging** con el emulador o dispositivo: pestaña **Performance**, grabar desde recarga hasta mapa + lista de pedidos visibles (técnico) o hasta panel admin usable (admin).
2. Anotar: **LCP aproximado**, **long tasks** (>50 ms), número de **descargas** en Network (filtrar JS), tamaño de **`app.js`** y de chunks `modules/*.js` relevantes.
3. Repetir con **caché fría** (borrar datos del WebView o desinstalar app) y con **caché caliente** (segunda apertura).

## Escenarios mínimos de regresión

| Rol | Flujo |
|-----|--------|
| Técnico Android | Login → mapa → lista pedidos → abrir detalle → foto / imprimir |
| Admin web | Login → abrir admin → empresa → estadísticas → export Excel (si aplica) |

## Fluidez Android / WebView — fase 2 (lazy IA + clima tras mapa)

| | Antes (referencia) | Después (2026-05-13) |
|---|---------------------|----------------------|
| **Commit** | (baseline previo: `app-admin-panel-deferred`, refactor app.js) | Nexxo: clima vía `import()` desde `map-view.js`; pack IA en `gn-lazy-optional-ui-bootstrap.js` (idle + gesto #pm/admin/#dm); credenciales por defecto con `import()` en login; `sw.js` `CACHE_SHELL` v153 |
| **Parse inicial `app.js`** | Imports estáticos de ~10 módulos IA/clima/compartir | Una línea al bootstrap lazy + `login-biometric` + `map-pedidos-markers` |
| **Clima** | `panel-clima.js` al cargar `app.js` (autoInit + interval) | Solo tras `runInitMap` (mapa listo) |
| **Medición** | Ver sección «Cómo medir» arriba | Re-ejecutar Performance + Network (JS) en emulador técnico y anotar long tasks / tamaño descargas |

**Regresión extra (fase 2):** mapa + widget clima; «Sugerir con IA» en `#pm`; botones IA en admin/KPI/estadísticas/BP2; duplicados al guardar pedido nuevo; ✨ mensaje derivación en detalle; compartir/descargar foto ampliada; login con credenciales por defecto abre modal de cambio.

**Nativo (opcional en plan):** `MainActivity` usa `LOAD_CACHE_ELSE_NETWORK` solo si no hay red (`ConnectivityManager`); con red sigue `LOAD_DEFAULT`.

## Scroll modal detalle `#dm` (Android shell)

| | Antes | Después (re-medir en DevTools) |
|---|--------|----------------------------------|
| **Overlay** | `.mo` con `backdrop-filter: blur(2px)` (repintado del mapa al scroll) | `html.gn-android-shell` `#dm`/`#pm`: sin backdrop, fondo rgba más opaco |
| **Sombras** | Sombra fuerte en `.mc` y barra de acciones | Sombras más livianas solo en shell Android |
| **Scroll** | Solo `-webkit-overflow-scrolling` | `touch-action: pan-y` en `.gn-dm-detail-scroll` y `#pm > .mc` |
| **Imágenes** | `<img>` sin hints | `loading="lazy" decoding="async" fetchpriority="low"` vía [`modules/pedido-detalle-html-helpers.js`](../app/src/main/assets/modules/pedido-detalle-html-helpers.js) |
| **DOM inicial** | Auditoría y fotos siempre expandidos | `<details>` colapsado por defecto (línea de tiempo + auditoría; bloque fotos con contador en summary) |
| **Medición** | — | Performance: grabar scroll continuo en detalle con pedido largo + fotos; anotar long tasks / FPS; commit + `CACHE_SHELL` bump en `sw.js` |

**Regresión:** abrir detalle, expandir «Últimos cambios y auditoría» y «Fotos del trabajo»; tap en miniatura; cierre con foto/firma; derivación con textarea.

## Perfil gama media (p. ej. Samsung A16)

| Paso | Qué hacer |
|------|-----------|
| 1 | Activar **Depuración USB** y en Chrome del PC `chrome://inspect` → WebView de la app. |
| 2 | **Performance**: grabar ~5 s de scroll continuo dentro de `#dm` (pedido largo + fotos expandidas) y en la lista `#pl`. |
| 3 | Anotar: **long tasks** (>50 ms), proporción **Main** vs **Raster**, sensación de FPS. |
| 4 | Repetir tras cambios en [`gn-android-shell-perf.css`](../app/src/main/assets/gn-android-shell-perf.css), [`gn-map-throttle-when-modal.js`](../app/src/main/assets/modules/gn-map-throttle-when-modal.js) y commits asociados. |

**Cambios recientes (gama media):** con `html.gn-android-shell`, mientras `#dm` está activo se añade `gn-shell-map-suppressed-for-detalle` (mapa `#mc` oculto a pintura + interacciones Leaflet deshabilitadas); al cerrar se restaura e `invalidateSize`. En detalle y lista: `content-visibility` + `contain` en `.ds` / `details` y filas `.pi`. Observer de imagen en detalle: `disconnect` al cerrar y `install` antes de cada `innerHTML` de `#dmc`.

## Notas de arquitectura (`js/core.js` vs `modules/`)

- **`js/core.js`**: estado mínimo (`app`, `NEON_OK`, `esAndroidWebViewMapa`, etc.) pensado para módulos bajo `js/` (p. ej. `pedidos.js`). No duplicar allí lógica de UI que ya vive en `modules/ui-utils.js` (`toast` unificado del panel).
- **`modules/`**: dominios y UI compartida con Pedidos-MG; preferir **nuevos** archivos aquí y `import()` dinámico para código **solo admin** o pesado que el técnico no necesita en el primer pantallazo.
- Evitar **import circular** `app.js` ↔ módulo: pasar dependencias con un objeto `ctx` o `getDeps()` en tiempo de llamada.

## Estado del refactor (checklist interno)

- [x] Aplazar inits admin (export estadísticas, CSV tipo, derivaciones cfg, históricos) hasta primera apertura del panel admin.
- [x] Aplazar módulos KPI PDF + blob al generar informe KPI piloto.
- [x] Aplazar lista usuarios multitenant y modal WhatsApp usuario hasta uso.
- [x] Export socios Excel completo: carga perezosa del módulo SheetJS al pulsar el botón.

Próximas iteraciones: ver plan en `.cursor/plans/` (refactor por fases).
