# Convenciones Municipales de Numeración de Calles

## Sistema de Cuadras Estándar (Argentina)

### Convención General
- **1 cuadra = 100 números**
- Ejemplo: 
  - Cuadra 0: números 0-99
  - Cuadra 1: números 100-199
  - Cuadra 2: números 200-299
  - Cuadra 3: números 300-399
  - etc.

### Paridad (Pares e Impares)
- **Números pares**: Lado derecho de la calle (mirando desde el inicio)
- **Números impares**: Lado izquierdo de la calle

**Ejemplo:**
```
Calle San Martín, Cerrito
├─ Lado izquierdo: 301, 303, 305, 307... (impares)
│  
│  ════════════ Calle San Martín ═══════════
│
├─ Lado derecho: 300, 302, 304, 306... (pares)
```

### Metros dentro de la Cuadra
El número de puerta indica la distancia aproximada desde la esquina:

- **356** → Cuadra 3 (300-399), **56 metros** desde la esquina que marca el 300
- **412** → Cuadra 4 (400-499), **12 metros** desde la esquina del 400
- **999** → Cuadra 9 (900-999), **99 metros** (casi llegando a la próxima esquina)

**Nota:** En calles con longitud diferente a 100m por cuadra, se aplica interpolación proporcional.

---

## Cerrito, Santa Fe

### Calles Principales

#### Boulevard Libertad
- **Nombre oficial:** Boulevard Libertad
- **Variantes comunes:** Bvar. Libertad, Bv. Libertad, Libertad
- **Numeración:** Típicamente 100-1000
- **Orientación:** Norte-Sur
- **Convención local:** Impares al Este, Pares al Oeste

#### Avenida San Martín
- **Nombre oficial:** Avenida San Martín
- **Variantes:** Av. San Martín, San Martin (sin tilde)
- **Numeración:** 0-800
- **Orientación:** Este-Oeste

#### Avenida Mitre
- **Nombre oficial:** Avenida Mitre
- **Numeración:** 0-700

#### Antártida Argentina
- **Nombre oficial:** Antártida Argentina
- **Variantes:** Antártica Argentina, Antartica (sin tilde)
- **Numeración:** 100-600

---

## Algoritmo de Interpolación Implementado

### Flujo Completo

```
1. Usuario ingresa: "livertad 325, cerrito" (con error ortográfico)
   ↓
2. Normalización: "livertad" → "Boulevard Libertad" (Levenshtein)
   ↓
3. Buscar geometría en OSM: "Boulevard Libertad" en Cerrito
   ↓
4. Obtener LineString: 87 nodos que forman la calle
   ↓
5. Estimar rango: 100-900
   ↓
6. Calcular posición:
   - Número 325 → Cuadra 3 (300-399)
   - 25 metros desde esquina del 300
   - 325 es impar → lado izquierdo
   ↓
7. Interpolar sobre geometría:
   - Longitud total calle: 800m
   - Proporción: (325-100)/(900-100) = 0.28 → 28% del recorrido
   - Distancia desde inicio: 800m × 0.28 = 224m
   ↓
8. Aplicar offset perpendicular:
   - Bearing del segmento: 45° (noreste)
   - Offset para impar: 45° - 90° = -45° (335°)
   - Distancia offset: 8 metros
   ↓
9. Coordenadas finales: -31.268543, -60.997234
```

### Logs Visibles en el Pedido

```
━━━ DIAGNÓSTICO DE GEOCODIFICACIÓN ━━━
📍 Dirección solicitada: livertad 325, Cerrito
🔧 Calle corregida: "livertad" → "Boulevard Libertad" (confianza: 87%)
🔍 Iniciando geocodificación inteligente...
📍 Buscando "Boulevard Libertad" en OpenStreetMap...
✓ Geometría encontrada: 87 nodos
✓ Longitud de la calle: 845 metros
🔢 Estimando rango de numeración...
✓ Rango estimado: 100 - 900
📐 Interpolando posición del número 325...
✓ Ubicación: cuadra 3 (300-399), 25m desde esquina
✓ Posición calculada: lado izquierdo (impar)
✓ Coordenadas: -31.268543, -60.997234
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Mantenimiento del Diccionario

### Agregar Nueva Calle

Editar `api/utils/normalizarCalles.js`:

```javascript
export const DICCIONARIO_CALLES = {
  "Cerrito": {
    "Nueva Calle Oficial": ["variante1", "variante2", "error_comun"],
    // ... resto
  },
};
```

### Agregar Nueva Ciudad

```javascript
export const DICCIONARIO_CALLES = {
  "Cerrito": { /* ... */ },
  "Santa Fe": {
    "Bulevar Gálvez": ["galvez", "bv galvez", "bulevard galvez"],
    "Avenida Freyre": ["freyre", "av freyre"],
  },
};
```

---

## Referencias Técnicas

- **Distancia de Levenshtein**: Mide diferencia entre strings (cambios mínimos)
- **Haversine**: Cálculo de distancia en esfera (WGS84)
- **Bearing**: Ángulo de dirección entre dos puntos
- **Offset perpendicular**: Desplazamiento a 90° del bearing para simular veredas

---

made by leavera77
