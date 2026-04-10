# Guía de Pruebas: Sistema de Geocodificación Inteligente

Checklist completo para validar todas las funcionalidades implementadas del sistema de geocodificación.

**made by leavera77**

---

## 📋 Pre-requisitos

### 1. Ejecutar Migración SQL

**Conectar a Neon y ejecutar:**
```sql
-- Copiar y pegar desde: api/db/migrations/create_calles_normalizadas.sql
CREATE TABLE IF NOT EXISTS calles_normalizadas (
  id SERIAL PRIMARY KEY,
  ciudad TEXT NOT NULL,
  nombre_oficial TEXT NOT NULL,
  variantes TEXT[] NOT NULL DEFAULT '{}',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  ...
);
```

**Verificar que funcionó:**
```sql
SELECT COUNT(*) FROM calles_normalizadas WHERE ciudad = 'Cerrito';
-- Debe retornar: 13 (calles iniciales de Cerrito)
```

### 2. Verificar Deploy de Render

Esperar 1-2 minutos después del push para que Render despliegue la nueva versión del API.

**Verificar en:**
```
https://tu-api.onrender.com/health
```

Debe retornar: `{"ok": true, "service": "pedidosmg-api"}`

---

## 🧪 Test 1: Normalización de Calles

### **Objetivo:** Verificar que el sistema corrige errores ortográficos

### **Pasos:**

1. **Desde WhatsApp**, enviar al bot:
   ```
   livertad 123, cerrito
   ```

2. **Esperar respuesta del bot** con el número de pedido

3. **Abrir el panel admin:** `https://leavera77.github.io/Pedidos-MG/`

4. **Buscar el pedido recién creado** en la lista

5. **Abrir el detalle** del pedido

6. **Verificar en la descripción** que aparezca:
   ```
   [Sistema] Nombre de calle corregido: "livertad" → "Boulevard Libertad" (confianza: 85%)
   ```

### **Resultado esperado:**

✅ El sistema detectó el error y corrigió automáticamente  
✅ La nota de corrección es visible en el pedido  
✅ El pin está en Boulevard Libertad (no en el centro de la ciudad)

---

## 🧪 Test 2: Búsqueda en Catálogo (Persistencia)

### **Objetivo:** Verificar que coordenadas corregidas manualmente se reutilizan

### **Pasos:**

#### Fase A: Crear pedido inicial

1. **Desde WhatsApp**, enviar:
   ```
   700000001
   ```
   (Usar un NIS que exista en tu catálogo, ej: Ana García)

2. **Abrir el pedido** en el panel admin

3. **Verificar las coordenadas iniciales**

#### Fase B: Corregir manualmente

4. **Arrastrar el pin** en el mapa a una ubicación diferente (moverlo 50 metros)

5. **Verificar que aparezca:**
   ```
   [Ubicación] Posición del pedido corregida manualmente en el mapa por [tu nombre]
   ```

#### Fase C: Crear segundo pedido del mismo cliente

6. **Desde WhatsApp**, enviar de nuevo:
   ```
   700000001
   ```

7. **Abrir el nuevo pedido** en el panel

8. **Verificar en la descripción:**
   ```
   [Sistema] Ubicación corregida manualmente en pedidos anteriores del mismo cliente.
   ```

### **Resultado esperado:**

✅ El segundo pedido **NO volvió al centro de la ciudad**  
✅ Usó las coordenadas corregidas del primer pedido  
✅ No pasó por Nominatim ni interpolación (prioridad absoluta al catálogo)

---

## 🧪 Test 3: Interpolación Municipal

### **Objetivo:** Verificar el cálculo de posición con convenciones de 100 números/cuadra

### **Pasos:**

1. **Vaciar la tabla de socios** (para forzar interpolación):
   - Panel Admin → Socios / NIS
   - Click "Vaciar tabla" (botón rojo)
   - Confirmar dos veces

2. **Desde WhatsApp**, enviar dirección que NO esté en OSM con número exacto:
   ```
   Antártida Argentina 399, Cerrito
   ```

3. **Abrir el pedido** en el panel

4. **Scroll al final de la descripción** y buscar:
   ```
   ━━━ DIAGNÓSTICO DE GEOCODIFICACIÓN ━━━
   🔍 Iniciando geocodificación inteligente...
   🎯 Intentando geocodificación directa del número exacto en Nominatim...
   → Número exacto no encontrado, usando interpolación municipal...
   📍 Buscando "Antártida Argentina" en OpenStreetMap (Overpass API)...
   ✓ Geometría encontrada: XX nodos
   ✓ Longitud de la calle: XXX metros
   🔢 Rango de numeración: 0 - 900
   📐 Interpolando posición del número 399...
   ✓ Ubicación: cuadra 3 (300-399), 99m desde esquina
   ✓ Posición calculada: lado izquierdo (impar)
   ✓ Coordenadas: -31.XXXXXX, -60.XXXXXX
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ```

5. **Verificar en Google Maps** (copiar las coords del diagnóstico):
   - Las coords deben estar **en la calle correcta** (no en el centro)
   - Error aceptable: **menos de 100 metros**

### **Resultado esperado:**

✅ Sistema calculó la posición usando geometría OSM  
✅ Logs visibles muestran el proceso completo  
✅ Pin está en la calle correcta (no en el centro)  
✅ Cuadra = 3 (porque 399 está en el rango 300-399)  
✅ Lado = izquierdo (porque 399 es impar)

---

## 🧪 Test 4: Botón Re-geocodificar

### **Objetivo:** Actualizar coords de pedidos viejos con el nuevo sistema

### **Pasos:**

1. **Abrir un pedido viejo** con coords incorrectas (ej: #2026-0081)

2. **Verificar coordenadas actuales:**
   ```
   WGS84: -31.580437, -60.075811  (centro de ciudad)
   ```

3. **Scroll a la sección "📍 Ubicación"**

4. **Click en el botón azul:**
   ```
   [🗺️ Re-geocodificar]
   ```

5. **Confirmar** en el diálogo que aparece

6. **Esperar respuesta** (3-5 segundos)

7. **Verificar el mensaje de éxito** con el diagnóstico:
   ```
   ✓ Pedido re-geocodificado
   
   Coordenadas: -31.584650, -60.074173
   Fuente: nominatim_numero_exacto
   
   ━━━ DIAGNÓSTICO DE GEOCODIFICACIÓN ━━━
   🔄 Iniciando re-geocodificación inteligente...
   📦 Pedido #2026-0081: Ana García
   📍 Dirección: Antártida Argentina 399, Cerrito
   🔤 PASO 1: Normalización de calle
     ✓ Nombre de calle OK (sin cambios)
   📚 PASO 2: Búsqueda en catálogo (socios_catalogo)
     → Sin resultados en catálogo
   🌍 PASO 3: Geocodificación con Nominatim
     ✓ Nominatim: -31.584650, -60.074173
     ✓ Fuente: nominatim_numero_exacto
   ✅ Re-geocodificación exitosa
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ```

8. **Verificar en el mapa:**
   - El pin debe **moverse automáticamente** a la nueva ubicación
   - Refrescar la página y confirmar que las nuevas coords están guardadas

### **Resultado esperado:**

✅ Botón solo visible para admins  
✅ Confirmación antes de ejecutar  
✅ Logs detallados en pantalla  
✅ Pin actualizado en el mapa  
✅ Coords persistidas en BD

---

## 🧪 Test 5: Autocompletado de Calles (API)

### **Objetivo:** Validar endpoint de sugerencias

### **Pasos:**

1. **Abrir DevTools** en el navegador (F12)

2. **Ir a Console**

3. **Ejecutar:**
   ```javascript
   fetch('/api/calles-normalizadas/sugerencias?q=liber&ciudad=Cerrito')
     .then(r => r.json())
     .then(console.log);
   ```

4. **Verificar respuesta:**
   ```json
   {
     "sugerencias": [
       {
         "id": 1,
         "nombre_oficial": "Boulevard Libertad",
         "ciudad": "Cerrito",
         "variantes": ["livertad", "libertad", "bvar libertad", ...]
       }
     ]
   }
   ```

5. **Probar con otros textos:**
   ```javascript
   // Texto incompleto
   fetch('/api/calles-normalizadas/sugerencias?q=anta&ciudad=Cerrito')
   
   // Texto con error
   fetch('/api/calles-normalizadas/sugerencias?q=antartica&ciudad=Cerrito')
   
   // Debe retornar: "Antártida Argentina"
   ```

### **Resultado esperado:**

✅ API retorna sugerencias relevantes  
✅ Búsqueda por nombre oficial y variantes  
✅ Prioriza coincidencias al inicio del texto  
✅ Máximo 10 resultados por búsqueda

---

## 🧪 Test 6: Filtro `layer=address` (Nominatim)

### **Objetivo:** Verificar que no retorna POIs

### **Caso de prueba:**

Si en tu ciudad hay:
- **Dirección:** "San Martín 100" (residencial)
- **POI:** "Panadería San Martín" (comercio)

El sistema debe retornar **solo la dirección**, no la panadería.

### **Pasos:**

1. **Desde WhatsApp**, enviar:
   ```
   San Martín 100, Cerrito
   ```

2. **Verificar en el diagnóstico** que diga:
   ```
   ✓ Fuente: structured_exact
   ```
   (No debe ser `poi` o `amenity`)

3. **Verificar en el mapa:**
   - El pin está en la **dirección residencial** (no en el comercio)

### **Resultado esperado:**

✅ Sistema filtró POIs correctamente  
✅ Solo retornó direcciones del `layer=address`  
✅ Pin en ubicación residencial correcta

---

## 🧪 Test 7: Sistema Completo (End-to-End)

### **Escenario:** Cliente reincidente con error ortográfico

### **Pasos:**

#### Ronda 1: Primer pedido con error

1. **Vaciar tabla de socios** (Admin → Socios / NIS → Vaciar tabla)

2. **Desde WhatsApp:**
   ```
   NIS: 700000001
   Descripción: "Luz intermitente"
   ```

3. **Bot consulta catálogo por NIS** → obtiene "livertad 123"

4. **Sistema normaliza:** "livertad" → "Boulevard Libertad"

5. **Nominatim geocodifica** con nombre corregido

6. **Abrir pedido**, verificar:
   ```
   [Sistema] Nombre de calle corregido: "livertad" → "Boulevard Libertad"
   
   ━━━ DIAGNÓSTICO DE GEOCODIFICACIÓN ━━━
   🌍 PASO 3: Geocodificación con Nominatim
     ✓ Nominatim: -31.XXXXXX, -60.XXXXXX
   ```

7. **Admin revisa el pin** → está 20m fuera de lugar

8. **Admin arrastra el pin** a la ubicación correcta

9. **Verificar nota:**
   ```
   [Ubicación] Posición del pedido corregida manualmente en el mapa por admin
   ```

#### Ronda 2: Segundo pedido del mismo cliente

10. **Desde WhatsApp** (mismo NIS):
    ```
    700000001
    Descripción: "Fusible quemado"
    ```

11. **Abrir nuevo pedido**, verificar:
    ```
    [Sistema] Ubicación corregida manualmente en pedidos anteriores del mismo cliente.
    ```

12. **Verificar en el mapa:**
    - Pin en la ubicación exacta del paso 8 (coords corregidas)
    - **NO** volvió a geocodificar

### **Resultado esperado:**

✅ Primera vez: normalización + Nominatim  
✅ Admin corrigió manualmente  
✅ Segunda vez: usó coords del catálogo (NO volvió a Nominatim)  
✅ Sistema "aprendió" la ubicación correcta

---

## 🧪 Test 8: Gestión de Calles (CLI)

### **Objetivo:** Validar herramienta de administración

### **Pasos:**

1. **Listar calles de Cerrito:**
   ```bash
   node api/scripts/adminCallesNormalizadas.js listar "Cerrito"
   ```

   **Salida esperada:**
   ```
   📍 Calles normalizadas (13 registros)
   ════════════════════════════════════════════════════════════════
   
   🏙️  CERRITO
   ────────────────────────────────────────────────────────────────
   ✓ [1] Boulevard Libertad
      Variantes: livertad, libertad, bvar libertad, bv libertad, ...
   
   ✓ [2] Avenida San Martín
      Variantes: san martin, sanmartin, av san martin, ...
   ```

2. **Agregar nueva calle:**
   ```bash
   node api/scripts/adminCallesNormalizadas.js agregar \
     "Cerrito" \
     "Sarmiento" \
     "sarmiento,dom sarmiento,domingo sarmiento"
   ```

   **Salida esperada:**
   ```
   ✓ Calle agregada/actualizada: [14] Sarmiento en Cerrito
     Variantes: sarmiento, dom sarmiento, domingo sarmiento
   ```

3. **Verificar que se agregó:**
   ```bash
   node api/scripts/adminCallesNormalizadas.js listar "Cerrito"
   ```

4. **Probar desde WhatsApp:**
   ```
   sarmiento 456, cerrito
   ```

5. **Verificar normalización:**
   ```
   [Sistema] Nombre de calle corregido: "sarmiento" → "Sarmiento" (confianza: 100%)
   ```

### **Resultado esperado:**

✅ CLI funciona correctamente  
✅ Nueva calle agregada a BD  
✅ Bot usa la nueva calle inmediatamente (cache 5min)  
✅ Normalización aplicada

---

## 🧪 Test 9: Re-geocodificar Pedidos Viejos

### **Objetivo:** Actualizar coords de pedidos previos a la implementación

### **Pasos:**

1. **Buscar pedidos viejos** con coords en el centro de la ciudad:
   ```sql
   SELECT id, cliente_calle, cliente_numero_puerta, latitud, longitud
   FROM pedidos
   WHERE latitud BETWEEN -31.58 AND -31.57
     AND longitud BETWEEN -60.08 AND -60.07
     AND estado != 'Cerrado'
   ORDER BY fecha_creacion DESC
   LIMIT 10;
   ```

2. **Abrir uno de esos pedidos** en el panel admin

3. **Click en "Re-geocodificar"** (botón azul debajo de "Ver en mapa")

4. **Confirmar** en el diálogo

5. **Esperar 3-5 segundos**

6. **Verificar mensaje de éxito** con diagnóstico completo

7. **Verificar en el mapa:**
   - Pin debe **moverse** a la nueva ubicación
   - Coords actualizadas en tiempo real

8. **Refrescar la página** y abrir el pedido de nuevo

9. **Verificar:**
   - Coordenadas persistidas
   - Pin en la ubicación correcta

### **Resultado esperado:**

✅ Botón solo visible para admins  
✅ Re-geocodificación ejecutada correctamente  
✅ Diagnóstico detallado visible  
✅ Pin actualizado en el mapa  
✅ Cambios persistidos en BD

---

## 🧪 Test 10: Filtro `layer=address`

### **Objetivo:** Verificar que excluye POIs

### **Pasos (requiere ciudad con POIs):**

1. **Crear pedido con dirección que tenga comercios homónimos:**
   ```
   Mitre 250, Cerrito
   ```
   (Si existe "Panadería Mitre" o similar)

2. **Verificar diagnóstico:**
   ```
   ✓ Fuente: structured_exact
   ```
   (NO debe ser `poi`, `shop`, `amenity`)

3. **Verificar pin:**
   - Debe estar en la **calle residencial**
   - NO en el comercio

### **Resultado esperado:**

✅ Sistema ignoró POIs  
✅ Solo consideró direcciones residenciales  
✅ Pin correcto (no en comercio)

---

## 🧪 Test 11: Autocompletado en Vivo (Futuro)

### **Objetivo:** Validar autocompletado mientras se escribe

**NOTA:** Esta funcionalidad está **implementada en el backend** pero requiere integración en un campo de input del frontend.

### **Integración futura en el panel:**

```javascript
// En app.js, al crear un campo de búsqueda de direcciones:
const inputCalle = document.getElementById('input-calle-busqueda');
agregarAutocompletadoCalle(inputCalle, 'Cerrito', (sugerencia) => {
  console.log('Seleccionó:', sugerencia.nombre_oficial);
  // Hacer algo con la calle
});
```

**Comportamiento esperado:**
- Usuario escribe "lib" → aparece "Boulevard Libertad"
- Usuario escribe "anta" → aparece "Antártida Argentina"
- Dropdown con máximo 10 sugerencias
- Click en sugerencia → completa el campo

---

## 📊 Checklist de Validación

| Test | Descripción | Estado |
|------|-------------|--------|
| ✅ 1 | Normalización de calles | ⬜ Por probar |
| ✅ 2 | Persistencia en catálogo | ⬜ Por probar |
| ✅ 3 | Interpolación municipal | ⬜ Por probar |
| ✅ 4 | Botón re-geocodificar | ⬜ Por probar |
| ✅ 5 | API autocompletado | ⬜ Por probar |
| ✅ 6 | Filtro layer=address | ⬜ Por probar |
| ✅ 7 | Sistema completo E2E | ⬜ Por probar |
| ✅ 8 | CLI gestión calles | ⬜ Por probar |

---

## 🐛 Troubleshooting

### Problema: "No se encontraron calles en BD"

**Solución:**
```bash
# Verificar que la migración se ejecutó
psql "tu_connection_string" -c "SELECT COUNT(*) FROM calles_normalizadas;"
```

### Problema: "Re-geocodificar no hace nada"

**Verificar:**
1. Deploy de Render completado
2. Endpoint disponible: `curl https://tu-api.onrender.com/health`
3. Usuario tiene rol de admin

### Problema: "Pin sigue en el centro de la ciudad"

**Posibles causas:**
1. Calle no está en OpenStreetMap → Agregar manualmente en OSM
2. Nombre muy diferente al oficial → Agregar variante en `calles_normalizadas`
3. Ciudad incorrecta → Verificar que la ciudad existe en la tabla

**Solución temporal:**
- Admin corrige pin manualmente → coords se guardan con `ubicacion_manual = TRUE`

---

## 📈 Métricas de Éxito

Después de 1 semana de uso:

```sql
-- % de pedidos geocodificados correctamente (sin centro ciudad)
SELECT 
  COUNT(*) FILTER (WHERE latitud NOT BETWEEN -31.58 AND -31.57) * 100.0 / COUNT(*) AS porcentaje_correcto
FROM pedidos
WHERE fecha_creacion > NOW() - INTERVAL '7 days';

-- Calles más normalizadas (errores comunes)
SELECT descripcion, COUNT(*) as veces
FROM pedidos
WHERE descripcion LIKE '%Nombre de calle corregido%'
  AND fecha_creacion > NOW() - INTERVAL '7 days'
GROUP BY descripcion
ORDER BY veces DESC;

-- Coordenadas corregidas manualmente
SELECT COUNT(*)
FROM socios_catalogo
WHERE ubicacion_manual = TRUE
  AND fecha_actualizacion > NOW() - INTERVAL '7 days';
```

---

## ✅ Criterios de Aceptación

El sistema está funcionando correctamente si:

1. ✅ **≥ 80%** de pedidos geocodificados fuera del centro de ciudad
2. ✅ **≥ 70%** de calles normalizadas automáticamente (sin errores)
3. ✅ **≥ 90%** de clientes reincidentes usan coords del catálogo
4. ✅ **0** pedidos con coords `(0, 0)` o `null`
5. ✅ **< 100m** de error en interpolación municipal
6. ✅ **< 20m** de error con Nominatim exacto

---

**Versión:** 1.0  
**Fecha:** 2026-04-10  
**Autor:** leavera77
