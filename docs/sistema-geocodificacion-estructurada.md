# Sistema de Geocodificación Estructurada e Inteligente

Sistema de geocodificación de alta precisión con normalización de direcciones, persistencia de correcciones manuales y fallbacks inteligentes.

**made by leavera77**

---

## Arquitectura General

El sistema implementa una **jerarquía de 5 capas** para geocodificar direcciones con máxima precisión:

```
1. Catálogo (socios_catalogo) → Prioridad absoluta
   ├─ Por NIS/Medidor
   └─ Por dirección estructurada (calle, número, localidad, nombre)
   
2. Normalización de Calles (calles_normalizadas) → Corrección de errores
   ├─ Diccionario en base de datos
   └─ Algoritmo Levenshtein (similaridad)
   
3. Nominatim Estructurado → Geocodificación oficial OSM
   ├─ Búsqueda por número exacto
   └─ Búsqueda estructurada (street, city, state)
   
4. Interpolación Municipal → Cálculo geométrico
   ├─ Geometría OSM de la calle (Overpass API)
   ├─ Convenciones municipales (100 números/cuadra, pares/impares)
   └─ Offset perpendicular (8m laterales)
   
5. Fallback → Centro de ciudad (último recurso)
```

---

## 1. Búsqueda en Catálogo (`socios_catalogo`)

### Prioridad Absoluta

Cuando el admin reubica un pin manualmente, las coordenadas se guardan con `ubicacion_manual = TRUE`. Estas coordenadas tienen **prioridad sobre cualquier otra geocodificación**.

### Búsqueda por Identificadores

```sql
SELECT latitud, longitud, ubicacion_manual
FROM socios_catalogo
WHERE tenant_id = $1 
  AND (
    nis = $2 OR 
    medidor = $3 OR 
    nis_medidor = $4
  )
  AND latitud IS NOT NULL 
  AND longitud IS NOT NULL
ORDER BY ubicacion_manual DESC, fecha_actualizacion DESC
LIMIT 1
```

### Búsqueda por Dirección Estructurada (Fallback)

Si no hay NIS/Medidor, busca por dirección completa:

```sql
SELECT latitud, longitud, ubicacion_manual
FROM socios_catalogo
WHERE tenant_id = $1
  AND LOWER(TRIM(calle)) = LOWER(TRIM($2))
  AND LOWER(TRIM(numero)) = LOWER(TRIM($3))
  AND LOWER(TRIM(localidad)) = LOWER(TRIM($4))
  AND LOWER(TRIM(nombre)) = LOWER(TRIM($5))
  AND latitud IS NOT NULL
  AND longitud IS NOT NULL
ORDER BY ubicacion_manual DESC
LIMIT 1
```

**Archivo:** `api/services/buscarCoordenadasPorNisMedidor.js`

---

## 2. Normalización de Calles

### Tabla `calles_normalizadas`

Estructura:

```sql
CREATE TABLE calles_normalizadas (
  id SERIAL PRIMARY KEY,
  ciudad TEXT NOT NULL,
  nombre_oficial TEXT NOT NULL,
  variantes TEXT[] NOT NULL DEFAULT '{}',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  fecha_actualizacion TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (ciudad, nombre_oficial)
);
```

Ejemplo de datos:

| id | ciudad | nombre_oficial | variantes |
|----|--------|---------------|-----------|
| 1 | Cerrito | Boulevard Libertad | `{livertad, libertad, bvar libertad}` |
| 2 | Cerrito | Antártida Argentina | `{antartica, antartida, antartica argentina}` |

### Algoritmo de Normalización

1. **Match Exacto:** Busca coincidencia exacta en `nombre_oficial` o `variantes[]`
2. **Levenshtein Distance:** Calcula similaridad con umbral máximo de 3 caracteres de diferencia
3. **Confianza:** Retorna valor 0.5-1.0 según la distancia de edición

```javascript
const normResult = await normalizarDireccion({ 
  calle: "livertad",  // Usuario escribió mal
  ciudad: "Cerrito" 
});

// Resultado:
{
  calleNormalizada: "Boulevard Libertad",
  original: "livertad",
  cambio: true,
  confianza: 0.85,
  metodo: "levenshtein"
}
```

### Administración de Calles

Script CLI: `api/scripts/adminCallesNormalizadas.js`

```bash
# Listar todas las calles
node api/scripts/adminCallesNormalizadas.js listar

# Listar calles de una ciudad
node api/scripts/adminCallesNormalizadas.js listar "Cerrito"

# Agregar nueva calle
node api/scripts/adminCallesNormalizadas.js agregar \
  "Cerrito" \
  "Sarmiento" \
  "sarmiento,dom sarmiento,domingo sarmiento"

# Actualizar variantes
node api/scripts/adminCallesNormalizadas.js actualizar 15 "nueva1,nueva2"

# Desactivar calle (soft delete)
node api/scripts/adminCallesNormalizadas.js desactivar 15
```

**Archivo:** `api/utils/normalizarCalles.js`

---

## 3. Geocodificación con Nominatim

### Estrategia Dual

#### A. Búsqueda del Número Exacto (Nueva Implementación)

Antes de interpolar, el sistema pregunta a Nominatim si tiene el número exacto mapeado:

```
GET https://nominatim.openstreetmap.org/search
  ?q=Antártida+Argentina+399,+Cerrito
  &format=json
  &addressdetails=1
  &accept-language=es
  &countrycodes=ar
```

Si Nominatim retorna el número exacto → **Usa esas coordenadas directamente** (error ~0-5m)

#### B. Búsqueda Estructurada

Si el número exacto no existe, usa parámetros estructurados:

```
GET https://nominatim.openstreetmap.org/search
  ?street=399+Antártida+Argentina
  &city=Cerrito
  &state=Entre+Ríos
  &country=Argentina
  &layer=address
  &format=json
  &addressdetails=1
  &limit=12
  &viewbox=-60.1,-31.55,-60.0,-31.62
  &bounded=1
```

**Ventajas de la búsqueda estructurada:**
- Evita homónimos (calles con el mismo nombre en ciudades diferentes)
- Acota al bbox de la localidad (`viewbox` + `bounded=1`)
- Filtra solo direcciones con `layer=address` (excluye POIs, comercios, restaurantes)
- Prioriza frentes con `house_number` existente
- Aplica paridad (pares/impares) en caso de aproximación

**Archivo:** `api/services/nominatimClient.js`

---

## 4. Interpolación Municipal

### Convenciones Argentinas

Sistema de **100 números por cuadra** y **pares/impares** en lados opuestos:

```
Cuadra 0:   0 - 99     (esquina inicial de la calle)
Cuadra 1: 100 - 199
Cuadra 2: 200 - 299
Cuadra 3: 300 - 399    ← Ej: número 399
Cuadra 4: 400 - 499
```

- **Pares:** Lado derecho (según orientación de la calle)
- **Impares:** Lado izquierdo

### Algoritmo

1. **Obtener geometría** de la calle desde Overpass API (LineString con nodos lat/lng)
2. **Calcular longitud** total de la calle (suma de distancias Haversine entre nodos)
3. **Determinar cuadra:** `cuadra = Math.floor(numero / 100)`
4. **Calcular metros desde esquina:** `metrosDesdeEsquina = numero % 100`
5. **Interpolar sobre geometría:**
   - Fracción: `proporcion = (cuadra * 100 + metrosDesdeEsquina) / rangoMax`
   - Distancia acumulada hasta proporción → punto base
6. **Offset perpendicular:** ±8m según paridad (pares +8m derecha, impares -8m izquierda)

### Ejemplo Real: Antártida Argentina 399, Cerrito

```
━━━ DIAGNÓSTICO DE GEOCODIFICACIÓN ━━━
🔍 Iniciando geocodificación inteligente...
🎯 Intentando geocodificación directa del número exacto en Nominatim...
→ Número exacto no encontrado, usando interpolación municipal...
📍 Buscando "Antártida Argentina" en OpenStreetMap (Overpass API)...
✓ Geometría encontrada: 24 nodos
✓ Longitud de la calle: 632 metros
🔢 Rango de numeración: 0 - 900
📐 Interpolando posición del número 399...
✓ Ubicación: cuadra 3 (300-399), 99m desde esquina
✓ Posición calculada: lado izquierdo (impar)
✓ Coordenadas: -31.584640, -60.074180
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Archivo:** `api/services/interpolacionAlturas.js`

---

## 5. Persistencia de Correcciones Manuales

### Flujo de Admin

1. Admin abre pedido en panel web (`https://leavera77.github.io/Pedidos-MG/`)
2. Arrastra el pin a la ubicación correcta
3. Sistema ejecuta `PUT /api/pedidos/:id` con nuevas coordenadas
4. Backend actualiza **inmediatamente** `socios_catalogo`:

```javascript
// api/utils/sociosCatalogoCoordsFromPedido.js
await query(`
  UPDATE socios_catalogo
  SET latitud = $1,
      longitud = $2,
      ubicacion_manual = TRUE,
      fecha_actualizacion = NOW()
  WHERE tenant_id = $3
    AND (nis = $4 OR medidor = $5 OR nis_medidor = $6)
`, [lat, lng, tenantId, nis, medidor, nisMedidor]);
```

5. **Próximo reclamo del mismo cliente** → Sistema usa coordenadas corregidas (capa 1) sin volver a geocodificar

### Fallback por Dirección

Si el pedido no tiene NIS/Medidor pero sí dirección estructurada, también se guarda:

```sql
UPDATE socios_catalogo
SET latitud = $1, longitud = $2, ubicacion_manual = TRUE
WHERE tenant_id = $3
  AND LOWER(calle) = LOWER($4)
  AND LOWER(numero) = LOWER($5)
  AND LOWER(localidad) = LOWER($6)
```

---

## Casos de Prueba

### Test 1: Cliente con NIS + Coordenadas Corregidas

**Input (Bot WhatsApp):**
```
Cliente: 700000001 (NIS)
→ Sistema busca en socios_catalogo
→ Encuentra lat/lng con ubicacion_manual = TRUE
→ Usa esas coords directamente (NO geocodifica)
```

### Test 2: Dirección con Error Ortográfico

**Input:**
```
Calle: "livertad 123"
Ciudad: "Cerrito"
```

**Flujo:**
1. Normalización: `"livertad"` → `"Boulevard Libertad"` (confianza: 0.85)
2. Query Nominatim estructurada: `street=123 Boulevard Libertad&city=Cerrito`
3. Resultado: coordenadas precisas

### Test 3: Número No Mapeado en OSM

**Input:**
```
Calle: "Antártida Argentina 399"
Ciudad: "Cerrito"
```

**Flujo:**
1. Nominatim no tiene el número 399 exacto
2. Interpolación municipal:
   - Geometría: 24 nodos, 632m
   - Cuadra 3 (300-399), 99m desde esquina
   - Lado izquierdo (impar)
   - Coords: -31.584640, -60.074180
3. Admin corrige manualmente (si es necesario) → Se guarda con `ubicacion_manual = TRUE`

### Test 4: Cliente Reincidente

**Input (segundo reclamo del mismo cliente):**
```
Cliente: 700000001 (NIS)
→ Busca en socios_catalogo
→ Encuentra coords corregidas en el primer reclamo
→ SKIP geocodificación (usa coords existentes)
```

---

## Logs Visibles para el Usuario

El sistema agrega un bloque de diagnóstico al campo `descripcion` del pedido:

```
Reclamo del cliente: "Luz intermitente en el medidor"

[Sistema] Nombre de calle corregido: "livertad" → "Boulevard Libertad" (confianza: 85%)

━━━ DIAGNÓSTICO DE GEOCODIFICACIÓN ━━━
🔍 Iniciando geocodificación inteligente...
🎯 Intentando geocodificación directa del número exacto en Nominatim...
✓ ¡Nominatim encontró el número exacto!
✓ Coordenadas: -31.584650, -60.074173
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Esto permite al admin ver **en tiempo real** cómo el algoritmo geocodificó la dirección, sin necesidad de acceder a logs del servidor.

---

## Métricas de Precisión

| Método | Error aproximado | Cuándo se usa |
|--------|------------------|---------------|
| **Catálogo (manual)** | 0m (exacto) | Cliente reincidente con coord corregida |
| **Nominatim (número exacto)** | 0-5m | Número mapeado en OSM |
| **Nominatim (estructurado)** | 5-50m | Calle mapeada sin número exacto |
| **Interpolación municipal** | 20-100m | Calle con geometría OSM, número no mapeado |
| **Fallback (centro ciudad)** | 500-5000m | Sin datos de calle en OSM |

---

## Configuración

### Variables de Entorno

```bash
# Nominatim
NOMINATIM_USER_AGENT="GestorNova-SaaS/1.0"
NOMINATIM_FROM_EMAIL="tu-email@example.com"
WHATSAPP_GEOCODE_NOMINATIM_FALLBACK="1"  # Habilitar Nominatim en WhatsApp

# Interpolación
OVERPASS_API_TIMEOUT_MS="25000"  # Timeout para Overpass API

# Catálogo
CATALOGO_PRIORIDAD_ABSOLUTA="1"  # Priorizar coords del catálogo
```

### Estructura de Archivos

```
api/
├── services/
│   ├── buscarCoordenadasPorNisMedidor.js   ← Capa 1 (Catálogo)
│   ├── pedidoWhatsappBot.js                ← Orquestador principal
│   ├── whatsappGeolocalizacionGarantizada.js
│   ├── nominatimClient.js                  ← Capa 3 (Nominatim)
│   ├── interpolacionAlturas.js             ← Capa 4 (Interpolación)
│   └── geocodeWithFallback.js
├── utils/
│   ├── normalizarCalles.js                 ← Capa 2 (Normalización)
│   └── sociosCatalogoCoordsFromPedido.js   ← Persistencia manual
├── db/
│   └── migrations/
│       └── create_calles_normalizadas.sql  ← Tabla de calles
└── scripts/
    └── adminCallesNormalizadas.js          ← CLI de administración
```

---

## Administración y Mantenimiento

### Agregar Nuevas Ciudades

1. **Poblar tabla `calles_normalizadas`:**

```bash
node api/scripts/adminCallesNormalizadas.js agregar \
  "Nueva Ciudad" \
  "Calle Principal" \
  "calle ppal,principal,ppal"
```

2. **Importar socios desde Excel** con columnas: `nis`, `medidor`, `calle`, `numero`, `localidad`, `nombre`

3. **Probar geocodificación** creando un pedido de prueba vía bot WhatsApp

### Corregir Calles Mal Mapeadas

Si Nominatim devuelve coords incorrectas para una calle:

1. Admin corrige pin manualmente en el panel
2. Sistema guarda en `socios_catalogo` con `ubicacion_manual = TRUE`
3. Futuros pedidos en esa dirección usan las coords corregidas (no vuelven a Nominatim)

### Monitoreo

```sql
-- Pedidos con coordenadas corregidas manualmente
SELECT COUNT(*) 
FROM pedidos p
INNER JOIN socios_catalogo s 
  ON p.nis = s.nis AND p.tenant_id = s.tenant_id
WHERE s.ubicacion_manual = TRUE;

-- Calles más normalizadas (errores frecuentes)
SELECT ciudad, nombre_oficial, variantes
FROM calles_normalizadas
WHERE array_length(variantes, 1) > 5
ORDER BY array_length(variantes, 1) DESC;
```

---

## Troubleshooting

### Problema: Pins siempre en el centro de la ciudad

**Causas posibles:**
1. No hay geometría en OSM para esa calle
2. Nombre de calle muy diferente al oficial de OSM
3. Ciudad no encontrada por Nominatim

**Solución:**
1. Verificar en OpenStreetMap si la calle existe
2. Agregar variantes del nombre en `calles_normalizadas`
3. Corregir manualmente y el sistema aprenderá

### Problema: Normalización no funciona

**Verificar:**
```bash
# Ver calles en BD
node api/scripts/adminCallesNormalizadas.js listar "Cerrito"

# Verificar logs
grep "normalize-calle" logs/app.log
```

**Solución:**
```bash
# Agregar variante faltante
node api/scripts/adminCallesNormalizadas.js actualizar 5 \
  "variante_existente1,variante_existente2,nueva_variante_faltante"
```

### Problema: Interpolación con error > 100m

**Posibles causas:**
1. Rango de numeración incorrecto (asumió 0-900 en vez de rango real)
2. Geometría OSM incompleta o incorrecta
3. Convenciones municipales diferentes (no 100/cuadra)

**Solución inmediata:**
- Admin corrige pin manualmente → coords se guardan en catálogo

**Solución a largo plazo:**
- Mejorar mapeo en OpenStreetMap (agregar números de casas)

---

## Referencias

- **OpenStreetMap Nominatim:** https://nominatim.org/release-docs/latest/
- **Overpass API:** https://overpass-api.de/
- **Levenshtein Distance:** https://en.wikipedia.org/wiki/Levenshtein_distance
- **Convenciones de Numeración Argentina:** Sistema tradicional de cuadras de 100m

---

**Versión:** 2.0  
**Última actualización:** 2026-04-10  
**Autor:** leavera77
