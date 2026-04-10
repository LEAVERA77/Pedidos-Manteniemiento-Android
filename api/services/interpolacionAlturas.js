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
 * Obtiene la geometría de una calle desde Overpass API
 */
async function obtenerGeometriaCalle(calle, localidad, provincia) {
  const calleClean = String(calle).trim();
  const locClean = String(localidad).trim();
  const provClean = provincia ? String(provincia).trim() : "";
  
  // Query Overpass QL para buscar la calle (way con name)
  const query = `
[out:json][timeout:10];
area[name="${locClean}"]["place"~"city|town|village"]->.loc;
(
  way["highway"]["name"~"${calleClean}",i](area.loc);
);
out geom;
  `.trim();
  
  try {
    const response = await fetch(OVERPASS_API, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
    });
    
    if (!response.ok) {
      console.warn("[interpolacion-alturas] Overpass HTTP error:", response.status);
      return null;
    }
    
    const data = await response.json();
    const elements = data.elements || [];
    
    if (elements.length === 0) {
      console.info("[interpolacion-alturas] No se encontró geometría para la calle %s en %s", calleClean, locClean);
      return null;
    }
    
    // Tomar el primer way encontrado
    const way = elements[0];
    if (!way.geometry || way.geometry.length < 2) {
      console.warn("[interpolacion-alturas] Geometría de calle incompleta");
      return null;
    }
    
    // Convertir geometry a array de {lat, lng}
    const coords = way.geometry.map((node) => ({ lat: node.lat, lng: node.lon }));
    
    console.info("[interpolacion-alturas] Geometría obtenida: %s nodos para %s", coords.length, calleClean);
    return coords;
  } catch (e) {
    console.warn("[interpolacion-alturas] Error al consultar Overpass:", e?.message || e);
    return null;
  }
}

/**
 * Busca el rango de numeración de la calle en Nominatim (usando addressdetails)
 */
async function buscarRangoNumeracion(calle, localidad, provincia) {
  const calleClean = String(calle).trim();
  const locClean = String(localidad).trim();
  const provClean = provincia ? String(provincia).trim() : "";
  
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
    
    if (!response.ok) return { min: null, max: null };
    
    const results = await response.json();
    if (!results || results.length === 0) return { min: null, max: null };
    
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
      return { min: Math.min(...numeros), max: Math.max(...numeros) };
    }
    
    // Fallback: asumir rango típico (100-900)
    return { min: 100, max: 900 };
  } catch (e) {
    console.warn("[interpolacion-alturas] Error al buscar rango numeración:", e?.message || e);
    return { min: 100, max: 900 };
  }
}

/**
 * Interpola la posición sobre una polilínea basándose en el número de puerta
 * @param {Array<{lat: number, lng: number}>} coords - Geometría de la calle
 * @param {number} numero - Número de puerta
 * @param {number} min - Numeración mínima de la calle
 * @param {number} max - Numeración máxima de la calle
 * @returns {{lat: number, lng: number, lado: string} | null}
 */
function interpolarSobreCalle(coords, numero, min, max) {
  if (!coords || coords.length < 2) return null;
  if (!Number.isFinite(numero) || !Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (max <= min) return null;
  
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
  
  // Distancia objetivo desde el inicio
  const distanciaObjetivo = longitudTotal * proporcion;
  
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
      
      // Offset perpendicular según paridad (8 metros hacia el lado correspondiente)
      const esPar = numero % 2 === 0;
      const offsetBearing = esPar ? (bearing + 90) % 360 : (bearing - 90 + 360) % 360;
      const offsetMetros = 8; // Distancia típica del centro de la calle a la vereda
      
      const puntoFinal = puntoDestino(latBase, lngBase, offsetMetros, offsetBearing);
      
      return {
        lat: puntoFinal.lat,
        lng: puntoFinal.lng,
        lado: esPar ? "par_derecha" : "impar_izquierda",
      };
    }
    
    distanciaAcumulada += segmentoDist;
  }
  
  // Si no se encontró (por redondeo), usar el último punto
  const ultimo = coords[coords.length - 1];
  return { lat: ultimo.lat, lng: ultimo.lng, lado: "final_calle" };
}

/**
 * Función principal: intenta calcular coordenadas por interpolación de alturas
 * @param {object} opts
 * @param {string} opts.calle
 * @param {string} opts.numero
 * @param {string} opts.localidad
 * @param {string} [opts.provincia]
 * @returns {Promise<{lat: number, lng: number, fuente: string, metadata: object} | null>}
 */
export async function interpolarCoordenadaPorAltura(opts) {
  const calle = opts.calle ? String(opts.calle).trim() : "";
  const numeroStr = opts.numero ? String(opts.numero).trim() : "";
  const localidad = opts.localidad ? String(opts.localidad).trim() : "";
  const provincia = opts.provincia ? String(opts.provincia).trim() : "";
  
  if (!calle || calle.length < 2) {
    console.info("[interpolacion-alturas] Calle vacía o muy corta");
    return null;
  }
  
  if (!localidad || localidad.length < 2) {
    console.info("[interpolacion-alturas] Localidad vacía o muy corta");
    return null;
  }
  
  const numero = parseInt(numeroStr.replace(/\D/g, ""), 10);
  if (!Number.isFinite(numero) || numero <= 0) {
    console.info("[interpolacion-alturas] Número de puerta inválido: %s", numeroStr);
    return null;
  }
  
  console.info("[interpolacion-alturas] Iniciando interpolación: %s %s, %s", calle, numero, localidad);
  
  // 1. Obtener geometría de la calle
  const geometria = await obtenerGeometriaCalle(calle, localidad, provincia);
  if (!geometria || geometria.length < 2) {
    console.info("[interpolacion-alturas] Sin geometría válida para la calle");
    return null;
  }
  
  // 2. Buscar rango de numeración
  const { min, max } = await buscarRangoNumeracion(calle, localidad, provincia);
  console.info("[interpolacion-alturas] Rango de numeración estimado: %s - %s", min || "?", max || "?");
  
  // 3. Interpolar
  const resultado = interpolarSobreCalle(geometria, numero, min || 100, max || 900);
  if (!resultado) {
    console.warn("[interpolacion-alturas] No se pudo interpolar sobre la geometría");
    return null;
  }
  
  console.info("[interpolacion-alturas] ✓ Interpolación exitosa: lat=%s, lng=%s, lado=%s", 
    resultado.lat.toFixed(6), resultado.lng.toFixed(6), resultado.lado);
  
  return {
    lat: resultado.lat,
    lng: resultado.lng,
    fuente: "interpolacion_alturas_osm",
    metadata: {
      lado: resultado.lado,
      rangoNumeracion: { min, max },
      nodosGeometria: geometria.length,
    },
  };
}
