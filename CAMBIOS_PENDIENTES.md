# Cambios Pendientes - GestorNova
## made by leavera77

### Estado Actual del Código

#### ✅ YA IMPLEMENTADO:
1. **Persistencia en socios_catalogo al reubicar pin:**
   - Endpoint: `PUT /api/pedidos/:id/coords-manual` (api/routes/pedidos.js:1125-1186)
   - Función: `actualizarSociosCatalogoCoordsSiMatchPedido` (api/utils/sociosCatalogoCoordsFromPedido.js)
   - ✅ YA marca `ubicacion_manual = TRUE`
   - ✅ YA actualiza latitud/longitud en socios_catalogo

2. **Bot WhatsApp consulta catálogo primero:**
   - Líneas 261-286 de `api/services/pedidoWhatsappBot.js`
   - ✅ YA usa `buscarCoordenadasPorNisMedidor` con prioridad ABSOLUTA
   - ✅ YA prioriza coordenadas manuales (`esManual`)

3. **Normalización de calles:**
   - ✅ YA existe `api/utils/normalizarCalles.js` con algoritmo Levenshtein
   - ✅ YA existe tabla `calles_normalizadas` con diccionario
   - ✅ Bot ya normaliza antes de geocodificar (líneas 222-242)

4. **Geocodificación estructurada con Nominatim:**
   - ✅ YA existe `api/services/nominatimClient.js` con queries estructuradas
   - ✅ YA usa parámetros `street`, `city`, `country`, `accept-language=es`
   - ✅ YA tiene rate limiting (1.1 segundos entre requests)
   - ✅ YA maneja paridad de números (impares/pares)

---

### 🔴 PROBLEMAS REPORTADOS POR EL USUARIO:

#### 1. Coordenadas corregidas NO persisten en tiempo real
**Problema:** Admin reubica pin → se guarda en pedido → nuevo pedido WhatsApp del mismo cliente vuelve al centro de la ciudad.

**Posibles causas:**
- La columna `ubicacion_manual` podría no existir en socios_catalogo
- El `setImmediate` en el endpoint podría no ejecutarse
- Errores silenciosos no se están logueando

**Solución:**
- ✅ Código ya correcto, verificar logs del servidor
- Agregar más logging verbose
- Verificar que exista columna `ubicacion_manual` en BD

#### 2. Materiales intermitentes en pedidos cerrados desde Dashboard
**Problema:** Al abrir pedido cerrado desde Dashboard → materiales parpadean → ventana se reabre sola al cerrar.

**Ubicación:** `app/src/main/assets/app.js:7498` (función `refrescarMaterialesEnDetalle`)

**Causa probable:**
- Múltiples llamadas a `refrescarMaterialesEnDetalle` sin guard adecuado
- El `stableMatPid` se está borrando en algún momento
- Evento de cierre modal no está limpiando estados correctamente

**Solución necesaria:**
- Mejorar el guard de early return para pedidos cerrados
- Asegurar que `dataset.stableMatPid` NO se borre accidentalmente
- Limpiar todos los timers/observers al cerrar modal

#### 3. Banner de calificación < 3 estrellas NO aparece en tiempo real
**Problema:** Cliente califica con 2 estrellas → banner NO aparece → al recargar sí aparece.

**Solución necesaria:**
- Implementar polling o webhook para detectar nuevas calificaciones
- Mostrar banner inmediatamente cuando se detecte rating < 3
- Eliminar botón WhatsApp Web externo, dejar solo "Chat" con icono

#### 4. Protección de coordenadas manuales contra imports Excel
**Problema:** Al importar Excel o "Vaciar" catálogo, se borran coordenadas corregidas manualmente.

**Solución necesaria:**
- Modificar lógica de importación para respetar `ubicacion_manual = TRUE`
- Si fila tiene `ubicacion_manual = TRUE` → NO sobrescribir lat/lng
- Aplicar en backend (API) y Android local

---

### 📋 TAREAS PENDIENTES (en orden):

#### TODO 1: Verificar y mejorar logging de persistencia coords
**Archivo:** `api/routes/pedidos.js` y `api/utils/sociosCatalogoCoordsFromPedido.js`
**Cambios:**
- Agregar logs más verbosos en el endpoint `/coords-manual`
- Verificar que el `setImmediate` se ejecute correctamente
- Retornar en la respuesta si el catálogo fue actualizado o no

#### TODO 2: Corregir bug materiales intermitentes
**Archivo:** `app/src/main/assets/app.js`
**Cambios:**
- Mejorar guard en `refrescarMaterialesEnDetalle` (línea 7503-7509)
- Evitar llamadas duplicadas desde Dashboard
- Asegurar limpieza correcta de estado al cerrar modal

#### TODO 3: Implementar banner calificación en tiempo real
**Archivo:** `app/src/main/assets/app.js`
**Cambios:**
- Crear función de polling que consulte calificaciones cada X segundos
- Detectar ratings < 3 y mostrar banner automáticamente
- Eliminar botón WhatsApp Web, dejar solo "Chat" con icono WhatsApp

#### TODO 4: Proteger coords manuales contra imports
**Archivos:**
- `api/routes/admin.js` (endpoint de importación socios)
- `app/src/main/assets/app.js` (función `importarExcelSocios`)
**Cambios:**
- Al importar, verificar si fila existente tiene `ubicacion_manual = TRUE`
- Si es TRUE, mantener lat/lng originales, solo actualizar otros campos
- Aplicar misma lógica en "Vaciar catálogo"

#### TODO 5: Sync y commit en ambos repos
**Cambios:**
- Ejecutar `.\scripts\sync-assets-to-pedidos-mg.ps1`
- Commit y push en **Pedidos-Manteniemiento-Android** (Nexxo)
- Commit y push en **Pedidos-MG**

---

### 🔍 VERIFICACIONES NECESARIAS:

1. **Base de datos:**
   ```sql
   -- Verificar que exista columna ubicacion_manual
   SELECT column_name, data_type 
   FROM information_schema.columns 
   WHERE table_name = 'socios_catalogo' 
   AND column_name = 'ubicacion_manual';
   
   -- Si no existe, agregarla:
   ALTER TABLE socios_catalogo 
   ADD COLUMN IF NOT EXISTS ubicacion_manual BOOLEAN DEFAULT FALSE;
   ```

2. **Logs del servidor:**
   - Revisar logs después de reubicar un pin
   - Buscar mensajes `[coords-manual→socios_catalogo]`
   - Verificar si hay errores silenciosos

3. **Comportamiento del frontend:**
   - Abrir pedido cerrado desde Dashboard
   - Verificar en DevTools si `body.dataset.stableMatPid` se mantiene
   - Verificar si hay múltiples llamadas a `refrescarMaterialesEnDetalle`

---

### 📝 NOTAS TÉCNICAS:

- **Nominatim ya está optimizado:** rate limiting, búsqueda estructurada, paridad
- **Bot ya es inteligente:** catálogo → normalización → Nominatim → interpolación → fallback
- **Persistencia ya implementada:** el código backend es correcto, probablemente issue de BD o ejecución
- **Focus en UI:** los bugs más críticos están en el frontend (materiales, banner)

---

## Próximos pasos inmediatos:

1. Leer función `detalle()` completa para entender flujo de apertura modal
2. Buscar dónde se limpia `body.dataset.stableMatPid`
3. Implementar fix para materiales estables
4. Implementar polling de calificaciones
5. Proteger imports contra sobrescritura de coords manuales
6. Sync y commit final
