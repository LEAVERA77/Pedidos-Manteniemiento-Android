/**
 * Interpolación de alturas para calcular coordenadas aproximadas basándose en:
 * - Geometría de la calle desde OpenStreetMap (Overpass API)
 * - Número de puerta (pares a la derecha, impares a la izquierda)
 * - Interpolación lineal sobre la longitud de la calle
 * 
 * Fallback cuando no hay datos en socios_catalogo y Nominatim da resultados muy genéricos.
 * made by leavera77
 */

import {
  nominatimStateMatchesTenant,
  stateFromNominatimHit,
  getNominatimBaseUrl,
  nominatimHeaders,
} from "./nominatimClient.js";
import { iso3166ArgDesdeNombreProvincia } from "../utils/provinciaArgentinaIso.js";
import {
  postOverpassInterpreter,
  sleep,
  overpassGapBetweenQueriesMs,
} from "./overpassHttp.js";

/** Elige el primer resultado Nominatim cuya provincia coincide con la esperada (evita homónimos entre jurisdicciones). */
function pickHitProvincia(hits, provClean) {
  if (!hits || !hits.length) return null;
  const p = provClean ? String(provClean).trim() : "";
  if (!p || p.length < 2) return hits[0];
  const ok = hits.find((h) => nominatimStateMatchesTenant(stateFromNominatimHit(h), p));
  return ok || null;
}

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
export function distanciaHaversine(lat1, lon1, lat2, lon2) {
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
export function normalizarParaBusqueda(str) {
  return String(str)
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúüñ\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Overpass `name~` usa regex; escapa metacaracteres para que "Antártida" no rompa el patrón. */
export function escapeOverpassRegexLiteral(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Genera variantes de búsqueda para tolerar errores ortográficos
 */
export function generarVariantesNombre(calle) {
  const raw = String(calle || "").trim();
  const base = normalizarParaBusqueda(raw);
  const variantes = new Set([base]);

  const sinPrefijo = base.replace(
    /^(calle|avenida|av\.?|avda|pasaje|pje|boulevard|bulevar|bv|bvd|blvd)\s+/i,
    ""
  );
  if (sinPrefijo !== base && sinPrefijo.length >= 3) variantes.add(sinPrefijo);

  if (base.length >= 5 && !/^(calle|avenida|av\.?|boulevard|bulevar|bv|bvd|blvd)\s/i.test(base)) {
    variantes.add(`avenida ${base}`);
    variantes.add(`av ${base}`);
    variantes.add(`av. ${base}`);
    variantes.add(`boulevard ${base}`);
    variantes.add(`bulevar ${base}`);
  }

  if (/boulevard|bulevar|bv|bvd|blvd/i.test(base)) {
    const sinTipo = base
      .replace(/\b(boulevard|bulevar|bv|bvd|blvd)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    if (sinTipo.length >= 3) {
      variantes.add(sinTipo);
      variantes.add(`boulevard ${sinTipo}`);
      variantes.add(`bulevar ${sinTipo}`);
      variantes.add(`avenida ${sinTipo}`);
    }
  }

  const sinNumeros = base.replace(/\d+\s*(de|del)?\s*/gi, "").trim();
  if (sinNumeros !== base && sinNumeros.length >= 3) variantes.add(sinNumeros);

  const palabras = base.split(/\s+/).filter((w) => w.length >= 2);
  if (palabras.length >= 2) {
    variantes.add(palabras.join(" "));
    const ult = palabras[palabras.length - 1];
    if (ult.length >= 4) variantes.add(ult);
    const prim = palabras[0];
    if (prim.length >= 4 && palabras.length >= 2) variantes.add(prim);
  }

  const out = [...variantes].filter((v) => v.length >= 3);
  return out.slice(0, 48);
}

/**
 * Obtiene coordenadas aproximadas del centro de una localidad (fallback para query geográfica)
 */
async function obtenerCoordsLocalidad(localidad, provincia) {
  const locClean = String(localidad).trim();
  const provClean = provincia ? String(provincia).trim() : "";
  const q = provClean.length >= 2 ? `${locClean}, ${provClean}, Argentina` : `${locClean}, Argentina`;
  const url = `${getNominatimBaseUrl()}/search?` +
    new URLSearchParams({
      q,
      format: "json",
      limit: "1",
      countrycodes: "ar",
      "accept-language": "es",
    });
  
  try {
    const response = await fetch(url, {
      headers: nominatimHeaders(),
    });
    
    if (!response.ok) return { lat: -31.3, lng: -60.5 }; // Fallback Santa Fe
    
    const results = await response.json();
    if (!results || results.length === 0) return { lat: -31.3, lng: -60.5 };

    let hit = results[0];
    if (provClean.length >= 2 && results.length > 1) {
      const ok = results.find((r) =>
        nominatimStateMatchesTenant(stateFromNominatimHit(r), provClean)
      );
      if (ok) hit = ok;
    } else if (provClean.length >= 2) {
      const st = stateFromNominatimHit(hit);
      if (st && !nominatimStateMatchesTenant(st, provClean)) {
        const ok = results.find((r) =>
          nominatimStateMatchesTenant(stateFromNominatimHit(r), provClean)
        );
        if (ok) hit = ok;
      }
    }

    const lat = parseFloat(hit.lat);
    const lng = parseFloat(hit.lon);
    
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
 * Construye bloques Overpass: localidad opcionalmente restringida a provincia (ISO o boundary).
 */
export function bloquesAreaLocalidadProvincia(locEscaped, provClean) {
  const provTrim = provClean ? String(provClean).trim() : "";
  const p = provTrim.length >= 2 ? provTrim : "";
  const iso = p ? iso3166ArgDesdeNombreProvincia(p) : null;
  const provEsc = p ? escapeOverpassRegexLiteral(normalizarParaBusqueda(p)) : "";

  if (iso) {
    return `
area["ISO3166-2"="${iso}"]->.prov;
area[name~"${locEscaped}",i]["place"~"city|town|village"](area.prov)->.loc;
`.trim();
  }
  if (p && provEsc.length >= 2) {
    return `
area[name~"${provEsc}",i]["admin_level"="4"]["boundary"="administrative"]->.prov;
area[name~"${locEscaped}",i]["place"~"city|town|village"](area.prov)->.loc;
`.trim();
  }
  return `
area[name~"${locEscaped}",i]["place"~"city|town|village"]->.loc;
`.trim();
}

/**
 * Obtiene la geometría de una calle desde Overpass API (tolerante a errores ortográficos)
 * @returns {Promise<{ geometry: Array<{lat:number,lng:number}>, tags: Record<string,string> } | null>}
 */
export async function obtenerGeometriaCalle(calle, localidad, provincia) {
  const calleClean = String(calle).trim();
  const locClean = String(localidad).trim();
  const provClean = provincia ? String(provincia).trim() : "";
  const locNorm = normalizarParaBusqueda(locClean);
  const locEscaped = escapeOverpassRegexLiteral(locNorm.length >= 2 ? locNorm : locClean);

  const variantes = generarVariantesNombre(calleClean);
  console.info("[interpolacion-alturas] Variantes de búsqueda para '%s': %s", calleClean, variantes.join(", "));

  const iso = provClean.length >= 2 ? iso3166ArgDesdeNombreProvincia(provClean) : null;
  if (provClean.length >= 2) {
    console.info(
      "[interpolacion-alturas] Filtro provincial: '%s' → ISO %s",
      provClean,
      iso || "(boundary name)"
    );
  }

  const pickLongestWayGeometry = (elements) => {
    const ways = (elements || []).filter((el) => el.type === "way" && el.geometry && el.geometry.length >= 2);
    if (!ways.length) return null;
    ways.sort((a, b) => (b.geometry?.length || 0) - (a.geometry?.length || 0));
    const way = ways[0];
    const geometry = way.geometry.map((node) => ({ lat: node.lat, lng: node.lon }));
    const tags = way.tags && typeof way.tags === "object" ? way.tags : {};
    return { geometry, tags };
  };

  const intentarQuery = async (query, label) => {
    console.info("[interpolacion-alturas] Overpass (%s)", label);
    const result = await postOverpassInterpreter(query, { label });
    if (!result.ok) {
      if (result.status === 429) {
        console.warn(
          "[interpolacion-alturas] Overpass 429 (Too Many Requests) tras reintentos — %s. Aumentá OVERPASS_GAP_BETWEEN_QUERIES_MS o esperá unos minutos.",
          label
        );
      } else if (result.status) {
        console.warn("[interpolacion-alturas] Overpass HTTP error:", result.status);
      }
      return null;
    }
    const data = result.data || {};
    const elements = data.elements || [];
    return pickLongestWayGeometry(elements);
  };

  const gapMs = overpassGapBetweenQueriesMs();

  for (let i = 0; i < variantes.length; i++) {
    if (i > 0 && gapMs > 0) {
      await sleep(gapMs);
    }
    const varianteBusqueda = escapeOverpassRegexLiteral(variantes[i]);
    const areaBlock = bloquesAreaLocalidadProvincia(locEscaped, provClean);
    const query = `
[out:json][timeout:25];
${areaBlock}
(
  way["highway"]["name"~"${varianteBusqueda}",i](area.loc);
);
out geom;
    `.trim();

    try {
      const pack = await intentarQuery(query, `variante ${i + 1}/${variantes.length} '${variantes[i]}'`);
      if (pack?.geometry && pack.geometry.length >= 2) {
        console.info(
          "[interpolacion-alturas] ✓ Geometría obtenida: %s nodos para '%s'",
          pack.geometry.length,
          calleClean
        );
        return pack;
      }
    } catch (e) {
      console.warn("[interpolacion-alturas] Error en query con variante '%s': %s", varianteBusqueda, e?.message || e);
    }
  }

  if (provClean.length >= 2) {
    console.warn(
      "[interpolacion-alturas] Sin geometría con provincia anclada; no se usa fallback 20 km (evita homónimos entre provincias)."
    );
    return null;
  }

  console.info("[interpolacion-alturas] No se encontró con variantes de área. Intentando fallback geográfico (sin provincia)...");
  const coordsLoc = await obtenerCoordsLocalidad(locClean, "");

  for (let i = 0; i < variantes.length; i++) {
    if (i > 0 && gapMs > 0) {
      await sleep(gapMs);
    }
    const varianteBusqueda = escapeOverpassRegexLiteral(variantes[i]);
    const queryFallback = `
[out:json][timeout:25];
(
  way["highway"]["name"~"${varianteBusqueda}",i](around:20000,${coordsLoc.lat},${coordsLoc.lng}); 
);
out geom;
    `.trim();

    try {
      const pack = await intentarQuery(
        queryFallback,
        `fallback 20km variante ${i + 1}/${variantes.length}`
      );
      if (pack?.geometry && pack.geometry.length >= 2) {
        console.info(
          "[interpolacion-alturas] ✓ Geometría obtenida (fallback): %s nodos para '%s'",
          pack.geometry.length,
          calleClean
        );
        return pack;
      }
    } catch (e) {
      console.warn("[interpolacion-alturas] Error en fallback con variante '%s': %s", varianteBusqueda, e?.message || e);
    }
  }

  console.warn("[interpolacion-alturas] ✗ No se encontró geometría para '%s' en %s (probadas %s variantes)", calleClean, locClean, variantes.length);
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
    const headersN = nominatimHeaders();

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

      const urlStruct = `${getNominatimBaseUrl()}/search?${structured}`;
      console.info("[rango-numeracion] Nominatim structured: street=%s, city=%s", `${calleClean} ${numeroInt}`, locClean);

      const respStruct = await fetch(urlStruct, { headers: headersN });
      if (respStruct.ok) {
        const resStruct = await respStruct.json();
        if (resStruct && resStruct.length > 0) {
          const mejor = pickHitProvincia(resStruct, provClean);
          if (mejor && mejor.lat != null && mejor.lon != null && coordsOk(mejor.lat, mejor.lon)) {
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
    
    const urlExacto = `${getNominatimBaseUrl()}/search?` +
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
          const mejor = pickHitProvincia(resultsExacto, provClean);
          if (mejor && mejor.lat && mejor.lon) {
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
  
  const url = `${getNominatimBaseUrl()}/search?` +
    new URLSearchParams({
      q,
      format: "json",
      addressdetails: "1",
      limit: "8",
      countrycodes: "ar",
      "accept-language": "es",
    });
  
  try {
    const response = await fetch(url, {
      headers: nominatimHeaders(),
    });
    
    if (!response.ok) return { min: 100, max: 900, exacto: null };
    
    let results = await response.json();
    if (!results || results.length === 0) return { min: 100, max: 900, exacto: null };
    if (provClean.length >= 2) {
      const filtrados = results.filter((r) =>
        nominatimStateMatchesTenant(stateFromNominatimHit(r), provClean)
      );
      if (filtrados.length) results = filtrados;
    }
    
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
  const packGeom = await obtenerGeometriaCalle(calle, localidad, provincia);
  const geometria = packGeom?.geometry;
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

const P5D_MAX_KM = 3.2;
const P5D_DEFAULT_MAX_M_ALONG = 2800;
const P5D_DEFAULT_M_PER_NUM = 14;
const P5D_DEFAULT_OFFSET_VEREDA_M = 10;

/**
 * PASO 5d (re-geocodificación): cascada B→C→D para ancla, luego avance en eje + vereda por paridad.
 * import() dinámico de anclaInicioCalle evita dependencia circular con este módulo.
 */
export async function interpolarPaso5dAnclaInicioVia(opts = {}) {
  const calle = opts.calle ? String(opts.calle).trim() : "";
  const localidad = opts.localidad ? String(opts.localidad).trim() : "";
  const provincia = opts.provincia ? String(opts.provincia || "").trim() : "";
  const numeroStr = opts.numero != null ? String(opts.numero).trim() : "";
  const postalDigits = opts.postalDigits != null ? String(opts.postalDigits).replace(/\D/g, "") : "";
  const logLines = [];
  const L = typeof opts.L === "function" ? opts.L : () => {};
  const push = (msg) => {
    logLines.push(msg);
    try {
      L(msg);
    } catch (_) {}
  };

  push("\n📍 PASO 5d: Ancla inicio de vía (cascada B→C→D) + avance sobre eje + vereda");
  if (!calle || calle.length < 2 || !localidad || localidad.length < 2) {
    push("  → Sin calle/localidad para PASO 5d");
    return { ok: false, log: logLines };
  }
  const numero = parseInt(numeroStr.replace(/\D/g, ""), 10);
  if (!Number.isFinite(numero) || numero <= 0) {
    push("  → Número inválido para PASO 5d");
    return { ok: false, log: logLines };
  }

  const { resolverCascadaAnclaInicio } = await import("./anclaInicioCalle.js");
  const cascade = await resolverCascadaAnclaInicio({
    calle,
    localidad,
    provincia,
    postalDigits,
    L,
  });
  for (const line of cascade.log || []) {
    if (line && String(line).trim()) push(String(line));
  }

  let geometry = cascade.geometry;
  let tags = cascade.tags || {};
  let metodoAncla = cascade.metodo || null;
  let precisionAncla = cascade.precision || null;

  if (!cascade.ok) {
    push("  → Cascada sin hit; fallback geometría única (primera way, primer nodo)");
    const pack = await obtenerGeometriaCalle(calle, localidad, provincia);
    if (!pack?.geometry || pack.geometry.length < 2) {
      push("  → Sin geometría de vía en OSM");
      return { ok: false, log: logLines };
    }
    geometry = pack.geometry;
    tags = pack.tags || {};
    metodoAncla = "overpass_geom_first_node";
    precisionAncla = "aprox_inicio";
  } else if (!geometry || geometry.length < 2) {
    push("  → Ancla B/C sin polilínea; se busca eje de vía para dirección y offset");
    const pack = await obtenerGeometriaCalle(calle, localidad, provincia);
    if (pack?.geometry?.length >= 2) {
      geometry = pack.geometry;
      tags = { ...tags, ...pack.tags };
    } else if (coordsOk(cascade.lat, cascade.lng)) {
      push("  ✓ Solo ancla puntual (sin eje); pin en coords de ancla");
      return {
        ok: true,
        lat: cascade.lat,
        lng: cascade.lng,
        fuente: "interpolacion_via_ancla_solo_punto",
        log: logLines,
        metodoAncla,
        precisionAncla,
        metadata: {
          modo: "interpolado_via",
          metodo_ancla: metodoAncla,
          precision_ancla: precisionAncla,
          nodos: 0,
        },
      };
    } else {
      return { ok: false, log: logLines };
    }
  }

  const coords = geometry;
  const onewayRaw = tags.oneway != null ? String(tags.oneway).trim().toLowerCase() : "";

  let totalM = 0;
  for (let i = 1; i < coords.length; i++) {
    totalM += distanciaHaversine(coords[i - 1].lat, coords[i - 1].lng, coords[i].lat, coords[i].lng);
  }
  push(`  ✓ Geometría eje: ${coords.length} nodos, ~${Math.round(totalM)} m`);
  if (totalM < 8) {
    push("  → Vía demasiado corta; se omite avance");
    return { ok: false, log: logLines };
  }

  const maxAlongEnv = Number(process.env.GEOCODE_P5D_MAX_M_ALONG || P5D_DEFAULT_MAX_M_ALONG);
  const mPerNum = Number(process.env.GEOCODE_P5D_M_PER_NUM || P5D_DEFAULT_M_PER_NUM);
  const offsetVereda = Math.min(
    25,
    Number(process.env.GEOCODE_P5D_OFFSET_VEREDA_M || P5D_DEFAULT_OFFSET_VEREDA_M)
  );

  const capAlong = Math.min(maxAlongEnv, totalM * 0.96, P5D_MAX_KM * 1000);
  let targetM = Math.min(capAlong, numero * mPerNum * 0.085, totalM * 0.9);
  targetM = Math.max(12, targetM);
  if (targetM > totalM) targetM = totalM * 0.88;

  let anchorLat = cascade.ok ? cascade.lat : coords[0].lat;
  let anchorLng = cascade.ok ? cascade.lng : coords[0].lng;
  let bi = 0;
  let bd = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const d = distanciaHaversine(anchorLat, anchorLng, coords[i].lat, coords[i].lng);
    if (d < bd) {
      bd = d;
      bi = i;
    }
  }
  push(
    `  → Ancla proyectada al vértice ${bi} (~${Math.round(bd)} m al eje). Avance objetivo desde ahí: ${Math.round(targetM)} m`
  );
  if (onewayRaw) push(`  → oneway (OSM): ${onewayRaw}`);

  let remaining = targetM;
  for (let i = bi; i < coords.length - 1; i++) {
    const d = distanciaHaversine(coords[i].lat, coords[i].lng, coords[i + 1].lat, coords[i + 1].lng);
    if (remaining <= d) {
      const frac = d > 0 ? remaining / d : 0;
      const latB = coords[i].lat + (coords[i + 1].lat - coords[i].lat) * frac;
      const lngB = coords[i].lng + (coords[i + 1].lng - coords[i].lng) * frac;
      const br = calcularBearing(coords[i].lat, coords[i].lng, coords[i + 1].lat, coords[i + 1].lng);
      const esPar = numero % 2 === 0;
      let offsetDeg = esPar ? (br + 90) % 360 : (br - 90 + 360) % 360;
      if (onewayRaw === "-1" || onewayRaw === "reverse") {
        offsetDeg = esPar ? (br - 90 + 360) % 360 : (br + 90) % 360;
      }
      const pt = puntoDestino(latB, lngB, offsetVereda, offsetDeg);
      push(
        `  ✓ Punto eje + vereda (${esPar ? "par" : "impar"})${onewayRaw ? ` · oneway=${onewayRaw}` : ""}`
      );
      push(`  ✓ Coordenadas aprox.: ${pt.lat.toFixed(6)}, ${pt.lng.toFixed(6)}`);
      push(`  ℹ️ Método ancla: ${metodoAncla || "?"} — no es puerta catastral exacta`);
      return {
        ok: true,
        lat: pt.lat,
        lng: pt.lng,
        fuente: "interpolacion_via_ancla_p5d",
        log: logLines,
        metodoAncla,
        precisionAncla,
        metadata: {
          modo: "interpolado_via",
          metodo_ancla: metodoAncla,
          precision_ancla: precisionAncla,
          oneway: onewayRaw || null,
          metrosEjeAprox: Math.round(targetM),
          nodos: coords.length,
        },
      };
    }
    remaining -= d;
  }

  const last = coords[coords.length - 1];
  push("  → Se usa extremo de geometría (fallback interno)");
  return {
    ok: true,
    lat: last.lat,
    lng: last.lng,
    fuente: "interpolacion_via_ancla_p5d_extremo",
    log: logLines,
    metodoAncla,
    precisionAncla,
    metadata: {
      modo: "interpolado_via",
      metodo_ancla: metodoAncla,
      precision_ancla: precisionAncla,
      warn: "fin_geometria",
    },
  };
}
