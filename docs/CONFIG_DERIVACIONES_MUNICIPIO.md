# Configuración: derivaciones a terceros y módulos de red eléctrica

## Claves en `clientes.configuracion` (JSONB)

### `derivaciones`

Objeto con dos ranuras fijas: `energia` y `agua`. Cada una:

| Campo      | Tipo    | Reglas |
|-----------|---------|--------|
| `activo`  | boolean | Si es `true`, debe haber `whatsapp` válido al guardar (API 400 si no). |
| `nombre`  | string  | Máx. 120 caracteres (recorte en servidor). |
| `whatsapp`| string  | Solo dígitos al persistir (10–15 dígitos, típico AR con código país 54). Se normaliza: se quitan espacios, `+` y caracteres no numéricos. |

Ejemplo:

```json
{
  "derivaciones": {
    "energia": {
      "activo": true,
      "nombre": "Empresa Provincial de Energía",
      "whatsapp": "5493415551234"
    },
    "agua": {
      "activo": true,
      "nombre": "Cooperativa de Agua del Norte",
      "whatsapp": "5493419998888"
    }
  }
}
```

**Política de validación:** si `activo` es verdadero y el WhatsApp queda vacío o inválido, el `PUT /api/clientes/mi-configuracion` responde **400** con `{ "error", "detalles" }` y **no** se actualiza `derivaciones` en base (el merge JSONB no aplica ese fragmento inválido).

### `ocultar_modulos_redes`

Booleano opcional. Si es `true`, en el panel admin se ocultan **ambas** pestañas: catálogo de zona (**Distribuidores** / Barrios / Ramales) y **Clientes afectados** (transformadores / kVA).

## Comportamiento por rubro (`clientes.tipo`)

- **`municipio`** y **`cooperativa_agua`**: por defecto se oculta solo la pestaña **Clientes afectados** (infra eléctrica: transformadores, kVA, cierre por trafo). La pestaña de **Barrios** o **Ramales** (mismo listado que en eléctrica se llama Distribuidores) **sigue visible** para gestionar la zona del reclamo. Las rutas API y tablas `infra_*` no se eliminan.
- **`cooperativa_electrica`**: se muestran todas las pestañas salvo `ocultar_modulos_redes`.

## API

- `GET /api/clientes/mi-configuracion` — devuelve `cliente.configuracion` completo; el front puede leer `derivaciones` y `ocultar_modulos_redes`.
- `PUT /api/clientes/mi-configuracion` — merge JSONB con el objeto enviado en `configuracion`. Si viene la clave `derivaciones`, el servidor **fusiona** con lo ya guardado por ranura (`energia` / `agua`), valida y normaliza antes de escribir.

## WhatsApp en el panel

Los números configurados aquí son **contactos externos** para derivar al vecino u operador (empresa de energía, cooperativa de agua). **No** son el número Meta del bot del municipio.

Los botones «Abrir WhatsApp» usan `https://wa.me/<dígitos>` en una nueva pestaña.

En el **detalle del pedido** (municipio / cooperativa de agua), admin y supervisor ven los mismos contactos para derivar al vecino: ver `docs/DERIVACION_PEDIDO_OPERADORES.md`.

## Seguridad / logs

No registrar números completos en logs de aplicación; si hiciera falta trazas, usar máscara (últimos 4 dígitos).
