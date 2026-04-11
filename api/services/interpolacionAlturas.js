/**
 * Interpolación de alturas para calcular coordenadas aproximadas basándose en:
 * - Geometría de la calle desde OpenStreetMap (Overpass API)
 * - Número de puerta (pares a la derecha, impares a la izquierda)
 * - Interpolación lineal sobre la longitud de la calle
 * 
 * Fallback cuando no hay datos en socios_catalogo y Nominatim da resultados muy genéricos.
 * made by leavera77
 */

const OVERPASS_API = "https://overpass-api.de/api/interpreter";
const NOMINATIM_API = "https://nominatim.openstreetmap.org";

/** Valida lat/lng finitos y en rango WGS84 */
function coordsOk(lat, lng) {
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return false;
  if (Math.abs(la) > 90 || Math.abs(lo) > 180) return false;
  return true;
}

/**
 * Calcula la distancia entre dos puntos WGS84 en metros (Haversine)
 */
function distanciaHaversine(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Radio de la Tierra en metros
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Calcula el punto a una distancia y bearing desde un punto base
 */
function puntoDestino(lat, lon, distanciaMetros, bearingGrados) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const toDeg = (rad) => (rad * 180) / Math.PI;
  
  const bearing = toRad(bearingGrados);
  const lat1 = toRad(lat);
  const lon1 = toRad(lon);
  const angDist = distanciaMetros / R;
  
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angDist) +
    Math.cos(lat1) * Math.sin(angDist) * Math.cos(bearing)
  );
  
  const lon2 = lon1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angDist) * Math.cos(lat1),
    Math.cos(angDist) - Math.sin(lat1) * Math.sin(lat2)
  );
  
  return { lat: toDeg(lat2), lng: toDeg(lon2) };
}

/**
 * Calcula el bearing (rumbo) entre dos puntos en grados
 */
function calcularBearing(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const toDeg = (rad) => (rad * 180) / Math.PI;
  
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Normaliza un string para búsqueda (sin tildes, minúsculas, sin espacios extra)
 */
function normalizarParaBusqueda(str) {
  return String(str)
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Overpass `name~` usa regex; escapa metacaracteres para que "Antártida" no rompa el patrón. */
function escapeOverpassRegexLiteral(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Genera variantes de búsqueda para tolerar errores ortográficos
 */
function generarVariantesNombre(calle) {
  const raw = String(calle || "").trim();
  const base = normalizarParaBusqueda(raw);
  const variantes = new Set([base]);

  const sinPrefijo = base.replace(/^(calle|avenida|av\.?|avda|pasaje|pje|boulevard|bv|bvd|blvd)\s+/i, "");
  if (sinPrefijo !== base && sinPrefijo.length >= 3) variantes.add(sinPrefijo);

  if (base.length >= 5 && !/^(calle|avenida|av\.?|boulevard|bv|bvd|blvd)\s/i.test(base)) {
    variantes.add(`avenida ${base}`);
    variantes.add(`av ${base}`);
    variantes.add(`av. ${base}`);
    variantes.add(`boulevard ${base}`);
  }

  if (/boulevard|bv|bvd|blvd/i.test(base)) {
    const sinBoulevard = base.replace(/\b(boulevard|bv|bvd|blvd)\b/gi, "").replace(/\s+/g, " ").trim();
    if (sinBoulevard.length >= 3) {
      variantes.add(sinBoulevard);
      variantes.add(`boulevard ${sinBoulevard}`);
      variantes.add(`avenida ${sinBoulevard}`);
    }
  }

  const sinNumeros = base.replace(/\d+\s*(de|del)?\s*/gi, "").trim();
  if (sinNumeros !== base && sinNumeros.length >= 3) variantes.add(sinNumeros);

  const palabras = base.split(/\s+/).filter((w) => w.length >= 2);
  if (palabras.length >= 2) {
    variantes.add(palabras.join(" "));
  }

  return [...variantes].filter((v) => v.length >= 3);
}

/**
 * Obtiene coordenadas aproximadas del centro de una localidad (fallback para query geográfica)
 */
async function obtenerCoordsLocalidad(localidad) {
  const locClean = String(localidad).trim();
  const url = `${NOMINATIM_API}/search?` +
    new URLSearchParams({
      q: `${locClean}, Argentina`,
      format: "json",
      limit: "1",
    });
  
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "GestorNova/1.0 (geocoding)" },
    });
    
    if (!response.ok) return { lat: -31.3, lng: -60.5 }; // Fallback Santa Fe
    
    const results = await response.json();
    if (!results || results.length === 0) return { lat: -31.3, lng: -60.5 };
    
    const lat = parseFloat(results[0].lat);
    const lng = parseFloat(results[0].lon);
    
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
    
    return { lat: -31.3, lng: -60.5 };
  } catch (e) {
    console.warn("[interpolacion-alturas] Error al obtener coords localidad:", e?.message || e);
    return { lat: -31.3, lng: -60.5 };
  }
}

/**
 * Obtiene la geometría de una calle desde Overpass API (tolerante a errores ortográficos)
 */
async function obtenerGeometriaCalle(calle, localidad, provincia) {
  const calleClean = String(calle).trim();
  const locClean = String(localidad).trim();
  const locNorm = normalizarParaBusqueda(locClean);
  const locEscaped = escapeOverpassRegexLiteral(locNorm.length >= 2 ? locNorm : locClean);

  // Generar variantes de búsqueda para tolerar errores
  const variantes = generarVariantesNombre(calleClean);
  console.info("[interpolacion-alturas] Variantes de búsqueda para '%s': %s", calleClean, variantes.join(", "));

  // Intentar búsqueda con cada variante
  for (let i = 0; i < variantes.length; i++) {
    const varianteBusqueda = escapeOverpassRegexLiteral(variantes[i]);

    // 1. Intentar búsqueda por área de la localidad
    const query = `
[out:json][timeout:25];
area[name~"${locEscaped}",i]["place"~"city|town|village"]->.loc;
(
  way["highway"]["name"~"${varianteBusqueda}",i](area.loc);
);
out geom;
    `.trim();

    console.info("[interpolacion-alturas] Query Overpass (variante %s/%s): buscando '%s'", i + 1, variantes.length, variantes[i]);
    
    try {
      const response = await fetch(OVERPASS_API, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
      });
      
      if (!response.ok) {
        console.warn("[interpolacion-alturas] Overpass HTTP error:", response.status);
        continue;
      }
      
      const data = await response.json();
      const elements = data.elements || [];
      
      console.info("[interpolacion-alturas] Overpass retornó %s elementos para variante '%s'", 
        elements.length, varianteBusqueda);
      
      if (elements.length > 0) {
        const way = elements[0];
        if (way.geometry && way.geometry.length >= 2) {
          const coords = way.geometry.map((node) => ({ lat: node.lat, lng: node.lon }));
          console.info("[interpolacion-alturas] ✓ Geometría obtenida: %s nodos para '%s' (variante: '%s')", 
            coords.length, calleClean, varianteBusqueda);
          return coords;
        }
      }
    } catch (e) {
      console.warn("[interpolacion-alturas] Error en query con variante '%s': %s", 
        varianteBusqueda, e?.message || e);
    }
  }
  
  // 2. FALLBACK GEOGRÁFICO: buscar por radio desde el centro de la localidad
  console.info("[interpolacion-alturas] No se encontró con variantes de área. Intentando fallback geográfico...");
  const coordsLoc = await obtenerCoordsLocalidad(locClean);
  
  for (let i = 0; i < variantes.length; i++) {
    const varianteBusqueda = escapeOverpassRegexLiteral(variantes[i]);

    const queryFallback = `
[out:json][timeout:25];
(
  way["highway"]["name"~"${varianteBusqueda}",i](around:20000,${coordsLoc.lat},${coordsLoc.lng}); 
);
out geom;
    `.trim();
    
    console.info("[interpolacion-alturas] Fallback geográfico (variante %s/%s, radio 20km desde %s, %s)", 
      i + 1, variantes.length, coordsLoc.lat.toFixed(4), coordsLoc.lng.toFixed(4));
    
    try {
      const resp2 = await fetch(OVERPASS_API, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(queryFallback)}`,
      });
      
      if (resp2.ok) {
        const data2 = await resp2.json();
        const elems2 = data2.elements || [];
        console.info("[interpolacion-alturas] Fallback retornó %s elementos para variante '%s'", 
          elems2.length, varianteBusqueda);
        
        if (elems2.length > 0) {
          const way = elems2[0];
          if (way.geometry && way.geometry.length >= 2) {
            const coords = way.geometry.map((node) => ({ lat: node.lat, lng: node.lon }));
            console.info("[interpolacion-alturas] ✓ Geometría obtenida (fallback): %s nodos para '%s' (variante: '%s')", 
              coords.length, calleClean, varianteBusqueda);
            return coords;
          }
        }
      }
    } catch (e) {
      console.warn("[interpolacion-alturas] Error en fallback con variante '%s': %s", 
        varianteBusqueda, e?.message || e);
    }
  }
  
  console.warn("[interpolacion-alturas] ✗ No se encontró geometría para '%s' en %s (probadas %s variantes)", 
    calleClean, locClean, variantes.length);
  return null;
}

/**
 * Busca el rango de numeración de la calle en Nominatim (usando addressdetails)
 * Ahora con búsqueda más específica del número exacto solicitado
 */
async function buscarRangoNumeracion(calle, numero, localidad, provincia) {
  const calleClean = String(calle).trim();
  const locClean = String(localidad).trim();
  const provClean = provincia ? String(provincia).trim() : "";
  
  // ESTRATEGIA 1: Buscar el número exacto primero
  const numeroInt = parseInt(String(numero).replace(/\D/g, ""), 10);
  if (Number.isFinite(numeroInt) && numeroInt > 0) {
    const headersN = { "User-Agent": "GestorNova/1.0 (geocoding)" };

    // 1a) Búsqueda estructurada (mejor para "Calle N + ciudad", p.ej. Sarmiento 102, Cerrito)
    try {
      const structured = new URLSearchParams({
        street: `${calleClean} ${numeroInt}`,
        city: locClean,
        country: "Argentina",
        format: "json",
        addressdetails: "1",
        limit: "5",
        layer: "address",
        "accept-language": "es",
        countrycodes: "ar",
      });
      if (provClean) structured.set("state", provClean);

      const urlStruct = `${NOMINATIM_API}/search?${structured}`;
      console.info("[rango-numeracion] Nominatim structured: street=%s, city=%s", `${calleClean} ${numeroInt}`, locClean);

      const respStruct = await fetch(urlStruct, { headers: headersN });
      if (respStruct.ok) {
        const resStruct = await respStruct.json();
        if (resStruct && resStruct.length > 0) {
          const mejor = resStruct[0];
          if (mejor.lat != null && mejor.lon != null && coordsOk(mejor.lat, mejor.lon)) {
            console.info("[rango-numeracion] ✓ Nominatim (structured) número exacto: lat=%s, lon=%s", mejor.lat, mejor.lon);
            return {
              min: numeroInt - 50,
              max: numeroInt + 50,
              exacto: { lat: parseFloat(mejor.lat), lng: parseFloat(mejor.lon) },
            };
          }
        }
      }
    } catch (e) {
      console.warn("[rango-numeracion] structured search:", e?.message || e);
    }

    const qExacto = provClean
      ? `${calleClean} ${numeroInt}, ${locClean}, ${provClean}, Argentina`
      : `${calleClean} ${numeroInt}, ${locClean}, Argentina`;
    
    const urlExacto = `${NOMINATIM_API}/search?` +
      new URLSearchParams({
        q: qExacto,
        format: "json",
        addressdetails: "1",
        limit: "3",
        layer: "address",
        "accept-language": "es",
        countrycodes: "ar",
      });
    
    console.info("[rango-numeracion] Buscando número exacto (q): %s", qExacto);
    
    try {
      const respExacto = await fetch(urlExacto, {
        headers: headersN,
      });
      
      if (respExacto.ok) {
        const resultsExacto = await respExacto.json();
        if (resultsExacto && resultsExacto.length > 0) {
          const mejor = resultsExacto[0];
          if (mejor.lat && mejor.lon) {
            console.info("[rango-numeracion] ✓ Nominatim encontró el número exacto: lat=%s, lon=%s", 
              mejor.lat, mejor.lon);
            
            // Si encontró el número exacto, retornar un rango estrecho
            return { 
              min: numeroInt - 50, 
              max: numeroInt + 50, 
              exacto: { lat: parseFloat(mejor.lat), lng: parseFloat(mejor.lon) }
            };
          }
        }
      }
    } catch (e) {
      console.warn("[rango-numeracion] Error al buscar número exacto:", e?.message || e);
    }
  }
  
  // ESTRATEGIA 2: Buscar la calle general y extraer números
  const q = provClean
    ? `${calleClean}, ${locClean}, ${provClean}, Argentina`
    : `${calleClean}, ${locClean}, Argentina`;
  
  const url = `${NOMINATIM_API}/search?` +
    new URLSearchParams({
      q,
      format: "json",
      addressdetails: "1",
      limit: "5",
    });
  
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "GestorNova/1.0 (geocoding)" },
    });
    
    if (!response.ok) return { min: 100, max: 900, exacto: null };
    
    const results = await response.json();
    if (!results || results.length === 0) return { min: 100, max: 900, exacto: null };
    
    // Intentar extraer house_number si viene en algún resultado
    const numeros = results
      .map((r) => {
        const hn = r.address?.house_number;
        if (!hn) return null;
        const parsed = parseInt(String(hn).replace(/\D/g, ""), 10);
        return Number.isFinite(parsed) ? parsed : null;
      })
      .filter((n) => n != null);
    
    if (numeros.length >= 2) {
      return { min: Math.min(...numeros), max: Math.max(...numeros), exacto: null };
    }
    
    // Fallback: asumir rango típico municipal (0-900)
    return { min: 0, max: 900, exacto: null };
  } catch (e) {
    console.warn("[rango-numeracion] Error al buscar rango numeración:", e?.message || e);
    return { min: 0, max: 900, exacto: null };
  }
}

/**
 * Interpola la posición sobre una polilínea basándose en el número de puerta
 * usando la convención municipal de cuadras (cada 100 números = 1 cuadra)
 * 
 * @param {Array<{lat: number, lng: number}>} coords - Geometría de la calle
 * @param {number} numero - Número de puerta
 * @param {number} min - Numeración mínima de la calle
 * @param {number} max - Numeración máxima de la calle
 * @returns {{lat: number, lng: number, lado: string, cuadra: number, metrosDesdeEsquina: number} | null}
 */
function interpolarSobreCalle(coords, numero, min, max) {
  if (!coords || coords.length < 2) return null;
  if (!Number.isFinite(numero) || !Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (max <= min) return null;
  
  // INTERPOLACIÓN MUNICIPAL: cada 100 números = 1 cuadra
  // Ejemplo: número 356 está en cuadra 3 (300-399), a 56 metros de la esquina
  
  const cuadra = Math.floor(numero / 100);
  const metrosDesdeEsquina = numero % 100;
  
  console.info("[interpolacion] Número %s → Cuadra %s, %s metros desde esquina", 
    numero, cuadra, metrosDesdeEsquina);
  
  // Calcular la proporción del recorrido (0 = inicio, 1 = final)
  const rango = max - min;
  let proporcion = (numero - min) / rango;
  proporcion = Math.max(0, Math.min(1, proporcion)); // Clamp [0, 1]
  
  // Calcular longitud total de la calle
  let longitudTotal = 0;
  for (let i = 1; i < coords.length; i++) {
    longitudTotal += distanciaHaversine(
      coords[i - 1].lat,
      coords[i - 1].lng,
      coords[i].lat,
      coords[i].lng
    );
  }
  
  console.info("[interpolacion] Longitud total calle: %.1f metros", longitudTotal);
  
  // Distancia objetivo desde el inicio
  const distanciaObjetivo = longitudTotal * proporcion;
  
  console.info("[interpolacion] Distancia objetivo: %.1f metros (%.1f%% del recorrido)", 
    distanciaObjetivo, proporcion * 100);
  
  // Recorrer segmentos hasta alcanzar la distancia objetivo
  let distanciaAcumulada = 0;
  for (let i = 1; i < coords.length; i++) {
    const p1 = coords[i - 1];
    const p2 = coords[i];
    const segmentoDist = distanciaHaversine(p1.lat, p1.lng, p2.lat, p2.lng);
    
    if (distanciaAcumulada + segmentoDist >= distanciaObjetivo) {
      // El punto está en este segmento
      const restante = distanciaObjetivo - distanciaAcumulada;
      const fraccion = segmentoDist > 0 ? restante / segmentoDist : 0;
      
      // Interpolación lineal
      const latBase = p1.lat + (p2.lat - p1.lat) * fraccion;
      const lngBase = p1.lng + (p2.lng - p1.lng) * fraccion;
      
      // Calcular bearing del segmento (dirección de la calle)
      const bearing = calcularBearing(p1.lat, p1.lng, p2.lat, p2.lng);
      
      // CONVENCIÓN MUNICIPAL: Offset perpendicular según paridad
      // Pares: lado derecho (bearing + 90°)
      // Impares: lado izquierdo (bearing - 90°)
      const esPar = numero % 2 === 0;
      const offsetBearing = esPar ? (bearing + 90) % 360 : (bearing - 90 + 360) % 360;
      const offsetMetros = 8; // Distancia típica del centro de la calle a la vereda
      
      const puntoFinal = puntoDestino(latBase, lngBase, offsetMetros, offsetBearing);
      
      console.info("[interpolacion] Punto final: lat=%.6f, lng=%.6f, lado=%s, bearing=%.1f°", 
        puntoFinal.lat, puntoFinal.lng, esPar ? "par_derecha" : "impar_izquierda", offsetBearing);
      
      return {
        lat: puntoFinal.lat,
        lng: puntoFinal.lng,
        lado: esPar ? "par_derecha" : "impar_izquierda",
        cuadra,
        metrosDesdeEsquina,
      };
    }
    
    distanciaAcumulada += segmentoDist;
  }
  
  // Si no se encontró (por redondeo), usar el último punto
  const ultimo = coords[coords.length - 1];
  return { 
    lat: ultimo.lat, 
    lng: ultimo.lng, 
    lado: "final_calle",
    cuadra,
    metrosDesdeEsquina,
  };
}

/**
 * Función principal: intenta calcular coordenadas por interpolación de alturas
 * @param {object} opts
 * @param {string} opts.calle
 * @param {string} opts.numero
 * @param {string} opts.localidad
 * @param {string} [opts.provincia]
 * @returns {Promise<{lat: number, lng: number, fuente: string, metadata: object, log: string[]} | null>}
 */
export async function interpolarCoordenadaPorAltura(opts) {
  const log = [];
  try {
  const calle = opts.calle ? String(opts.calle).trim() : "";
  const numeroStr = opts.numero ? String(opts.numero).trim() : "";
  const localidad = opts.localidad ? String(opts.localidad).trim() : "";
  const provincia = opts.provincia ? String(opts.provincia).trim() : "";
  
  // No usar `numero` aquí: aún no está declarado (TDZ → ReferenceError)
  log.push(`📍 Dirección solicitada: ${calle} ${numeroStr || "?"}, ${localidad}`);
  
  if (!calle || calle.length < 2) {
    log.push(`❌ Calle vacía o muy corta: "${calle}"`);
    console.info("[interpolacion-alturas] Calle vacía o muy corta");
    return null;
  }
  
  if (!localidad || localidad.length < 2) {
    log.push(`❌ Localidad vacía o muy corta: "${localidad}"`);
    console.info("[interpolacion-alturas] Localidad vacía o muy corta");
    return null;
  }
  
  const numero = parseInt(numeroStr.replace(/\D/g, ""), 10);
  if (!Number.isFinite(numero) || numero <= 0) {
    log.push(`❌ Número de puerta inválido: "${numeroStr}"`);
    console.info("[interpolacion-alturas] Número de puerta inválido: %s", numeroStr);
    return null;
  }
  
  log.push(`🔍 Iniciando geocodificación inteligente...`);
  console.info("[interpolacion-alturas] Iniciando interpolación: %s %s, %s", calle, numero, localidad);
  
  // 1. PRIORIDAD: Intentar geocodificación exacta con Nominatim (número específico)
  log.push(`🎯 Intentando geocodificación directa del número exacto en Nominatim...`);
  const { min, max, exacto } = await buscarRangoNumeracion(calle, numero, localidad, provincia);
  
  if (exacto && coordsOk(exacto.lat, exacto.lng)) {
    log.push(`✓ ¡Nominatim encontró el número exacto!`);
    log.push(`✓ Coordenadas: ${exacto.lat.toFixed(6)}, ${exacto.lng.toFixed(6)}`);
    console.info("[interpolacion-alturas] ✓ Número exacto en Nominatim: lat=%s, lng=%s", 
      exacto.lat, exacto.lng);
    
    return {
      lat: exacto.lat,
      lng: exacto.lng,
      fuente: "nominatim_numero_exacto",
      metadata: {
        metodo: "geocodificacion_exacta",
      },
      log,
    };
  }
  
  log.push(`→ Número exacto no encontrado, usando interpolación municipal...`);
  
  // 2. Obtener geometría de la calle
  log.push(`📍 Buscando "${calle}" en OpenStreetMap (Overpass API)...`);
  const geometria = await obtenerGeometriaCalle(calle, localidad, provincia);
  if (!geometria || geometria.length < 2) {
    log.push(`❌ No se encontró la geometría de la calle en OSM`);
    log.push(`   Intentadas múltiples variantes y búsqueda por radio 20km`);
    log.push(`   Posible causa: calle no mapeada o nombre muy diferente en OSM`);
    console.info("[interpolacion-alturas] Sin geometría válida para la calle");
    return { lat: null, lng: null, fuente: "sin_geometria", metadata: {}, log };
  }
  
  log.push(`✓ Geometría encontrada: ${geometria.length} nodos`);
  
  // Calcular longitud de la calle
  let longitudCalle = 0;
  for (let i = 1; i < geometria.length; i++) {
    longitudCalle += distanciaHaversine(
      geometria[i - 1].lat,
      geometria[i - 1].lng,
      geometria[i].lat,
      geometria[i].lng
    );
  }
  log.push(`✓ Longitud de la calle: ${Math.round(longitudCalle)} metros`);
  
  // 3. Interpolar
  log.push(`🔢 Rango de numeración: ${min} - ${max}`);
  console.info("[interpolacion-alturas] Rango de numeración: %s - %s", min, max);
  
  log.push(`📐 Interpolando posición del número ${numero}...`);
  const resultado = interpolarSobreCalle(geometria, numero, min || 0, max || 900);
  if (!resultado) {
    log.push(`❌ No se pudo calcular la posición sobre la geometría`);
    console.warn("[interpolacion-alturas] No se pudo interpolar sobre la geometría");
    return { lat: null, lng: null, fuente: "error_interpolacion", metadata: {}, log };
  }
  
  const cuadraInfo = resultado.cuadra >= 0 ? `cuadra ${resultado.cuadra} (${resultado.cuadra * 100}-${(resultado.cuadra + 1) * 100 - 1})` : "";
  const metrosInfo = resultado.metrosDesdeEsquina >= 0 ? `, ${resultado.metrosDesdeEsquina}m desde esquina` : "";
  const ladoDesc = resultado.lado === "par_derecha" ? "lado derecho (par)" : 
                   resultado.lado === "impar_izquierda" ? "lado izquierdo (impar)" : 
                   "final de calle";
  
  if (cuadraInfo) {
    log.push(`✓ Ubicación: ${cuadraInfo}${metrosInfo}`);
  }
  log.push(`✓ Posición calculada: ${ladoDesc}`);
  log.push(`✓ Coordenadas: ${resultado.lat.toFixed(6)}, ${resultado.lng.toFixed(6)}`);
  
  console.info("[interpolacion-alturas] ✓ Interpolación exitosa: lat=%s, lng=%s, lado=%s, cuadra=%s", 
    resultado.lat.toFixed(6), resultado.lng.toFixed(6), resultado.lado, resultado.cuadra);
  
  return {
    lat: resultado.lat,
    lng: resultado.lng,
    fuente: "interpolacion_alturas_osm",
    metadata: {
      lado: resultado.lado,
      rangoNumeracion: { min, max },
      nodosGeometria: geometria.length,
      cuadra: resultado.cuadra,
      metrosDesdeEsquina: resultado.metrosDesdeEsquina,
    },
    log,
  };
  } catch (err) {
    const msg = err?.message || String(err);
    log.push(`❌ Error en interpolación municipal: ${msg}`);
    console.error("[interpolacion-alturas] Error no controlado:", err);
    return {
      lat: null,
      lng: null,
      fuente: "error_interpolacion_js",
      metadata: { error: msg },
      log,
    };
  }
}
