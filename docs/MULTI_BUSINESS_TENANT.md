# Multi–línea de negocio por tenant (sin borrar datos)

## Idea

- Cada fila relevante en **`pedidos`** y **`socios_catalogo`** tiene **`business_type`**: `electricidad` | `agua` | `municipio`.
- En **`clientes`** el campo **`active_business_type`** define qué línea ve el panel (filtro de lectura/escritura).
- **No** se borran socios ni usuarios al cambiar de vista: se dejó de exigir `purge_datos_cambio_rubro` en `PUT /api/clientes/mi-configuracion`.

## Migración

Ejecutar en Neon (una vez):

`api/db/migrations/business_type_multi_negocio.sql`

## API

- `POST /api/tenant/switch-business` — body `{ "business_type": "electricidad"|"agua"|"municipio" }` (admin). Actualiza `clientes.active_business_type`.
- `GET /api/clientes/tipos-reclamo` — usa la línea activa (`active_business_type`) para el catálogo de tipos.
- Los listados de pedidos y estadísticas añaden `AND business_type = …` cuando las columnas existen y el contexto está cargado (`businessContextMiddleware` tras el JWT).

## Front (PWA / WebView)

- Tras login admin, `fetchMiConfiguracionYAplicarEnEmpresaCfg` guarda `active_business_type` en `window.EMPRESA_CFG`.
- El modal de tipo de negocio llama a `switch-business` y luego `PUT mi-configuracion` con `tipo` + `active_business_type` (sin purge).

made by leavera77
