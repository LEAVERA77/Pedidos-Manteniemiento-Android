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
