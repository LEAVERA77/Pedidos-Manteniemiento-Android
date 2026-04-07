# Nominatim y geocodificación WhatsApp (operativa)

## Política de uso (OSM)

- Nominatim público exige **como máximo ~1 solicitud por segundo** por instancia. El cliente en `api/services/nominatimClient.js` encadena peticiones con un intervalo mínimo (~1100 ms) entre llamadas.
- Configurá un **`User-Agent`** que identifique tu servicio y un **correo de contacto** (`From` / `email` en query), según [la política de Nominatim](https://operations.osmfoundation.org/policies/nominatim/).

## Variables de entorno

| Variable | Uso |
|----------|-----|
| `NOMINATIM_USER_AGENT` | Identificador del cliente (recomendado en producción). |
| `NOMINATIM_FROM_EMAIL` o `NOMINATIM_FROM` | Email en parámetro `email` y cabecera `From`. |
| `NOMINATIM_HOUSE_PARITY_MAX_STEPS` | Cuántos saltos ±2, ±4, … probar si el número de puerta no existe en OSM (0–20, default 8). |
| `NOMINATIM_LOCALITY_VIEWBOX_MARGIN_DEG` | Ampliación en grados del bounding box de la localidad (default 0.07). |
| `NOMINATIM_TENANT_VIEWBOX_DELTA_DEG` | Tamaño de la caja si solo hay centro del tenant (default 0.11). |
| `WHATSAPP_GPS_NEAR_METERS` | Umbral para preferir GPS del usuario frente al punto geocodificado (default 120). |
| `NOMINATIM_THROTTLE_MS_FOR_TESTS` | Solo tests: `0` desactiva la espera entre requests. **No usar en producción.** |

## Desambiguación de localidad

1. **Tenant** (`clientes.configuracion`): campos como `provincia`, `state`, `provincia_nominatim` → `geocodeState` en el contexto del bot.
2. **Fila del catálogo**: si existe la columna **`provincia`** en `socios_catalogo` o `clientes_finales`, se expone como `catalogoProvincia` y tiene **prioridad** sobre la provincia del tenant para Nominatim (`state` / búsqueda acotada).
3. Si no hay columna `provincia` en BD, la fuente de verdad sigue siendo **localidad + validación estricta** en los resultados (`address.city` / `town` / etc.) y **viewbox** cuando está disponible.

Script opcional para agregar provincia al catálogo: `docs/NEON_catalogo_provincia_opcional.sql`.

## Probar manualmente (NIS / medidor)

1. Tené un NIS o medidor con **calle, localidad** (y opcionalmente `provincia`) en `socios_catalogo` o `clientes_finales`.
2. En el flujo de reclamo por **Meta WhatsApp**, completá hasta que el bot use el domicilio del padrón.
3. En logs del API buscá la línea **`[whatsapp-bot-meta] geocode audit`**: `source` (`structured_exact`, `structured_parity_fallback`, etc.), `usedHouseNumber`, `requestedHouseNumber`, `approximate`, `viewboxUsed`, `stateGeo`.

## Comportamiento si no hay coordenadas en mapa (catálogo estricto)

Si el domicilio viene del **padrón** (`origenCatalogo`) y no se puede verificar un punto en mapa, el pedido **sigue creándose** con la dirección en texto. El usuario recibe el mensaje de éxito del reclamo **más una nota** aclarando que no se ubicó el domicilio en el mapa y que la cooperativa usará la dirección registrada.

## Tests automatizados

- `api/tests/nominatimCatalog.test.js`: funciones puras (localidad, paridad, viewbox).
- `api/tests/nominatimGeocodeFetchMock.test.js`: `fetch` mockeado y throttle de test en 0.
