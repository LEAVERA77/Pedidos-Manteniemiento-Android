# Coordenadas manuales del pedido → `socios_catalogo`

Cuando un administrador guarda posición con **PUT** `/api/pedidos/:id/coords-manual`, además de actualizar `pedidos.lat` / `pedidos.lng`, el servidor intenta alinear la ubicación del **mismo socio** en el catálogo Neon (`socios_catalogo`), si existe una fila **única** en el tenant.

## Reglas

- **Sin NIS / medidor** en el pedido: no se toca el catálogo (solo se actualiza el pedido).
- **Match** (primera coincidencia que aplique):
  1. `pedidos.nis_medidor` ↔ `socios_catalogo.nis_medidor` (comparación TRIM + UPPER).
  2. `pedidos.nis` + `pedidos.medidor` ↔ columnas `nis` y `medidor` del catálogo.
  3. Si el pedido tiene `nis`+`medidor` pero no `nis_medidor`, se prueba la clave compuesta `nis-medidor` contra `nis_medidor` del catálogo.
- **Varias filas** candidatas: **no** se actualiza ninguna (se registra advertencia en logs).
- **Columnas de coordenadas**: se usan `latitud`/`longitud` o, si no existen, `lat`/`lng`.

## Checklist manual

1. Pedido con `nis_medidor` igual a una fila del catálogo → tras mover pin, verificar en panel socios que lat/lon coinciden con el mapa.
2. Pedido sin NIS → pedido actualizado; catálogo sin cambios.
3. Dos socios con el mismo identificador (ambigüedad) → pedido OK; catálogo sin cambio; log `ambiguo`.

Implementación: `api/utils/sociosCatalogoCoordsFromPedido.js`.
