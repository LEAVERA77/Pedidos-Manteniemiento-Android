/**
 * Interpolación por números de referencia OSM + geometría de vía (punto medio si no hay refs).
 * Paso opcional del pipeline (antes de interpolación municipal “clásica” y centro de calle).
 * made by leavera77
 */

import { obtenerGeometriaCalle, buscarNumerosReferenciaEnCalle } from "./overpassClient.js";
import { coordsValidasWgs84 } from "./whatsappGeolocalizacionGarantizada.js";

export function streetGeometryInterpolationEnabled() {
  return process.env.NOMINATIM_INTERPOLACION_CALLE !== "0" && process.env.NOMINATIM_INTERPOLACION_CALLE !== "false";
}

function maxDistanciaNumerica() {
  const v = parseInt(String(process.env.NOMINATIM_INTERPOLACION_MAX_DISTANCIA || "50"), 10);
  return Number.isFinite(v) && v >= 2 && v <= 500 ? v : 50;
}

/**
 * @param {number} numeroBuscado
 * @param {Array<{ numero: number, lat: number, lng: number }>} refs
 */
function interpolarPorReferencias(numeroBuscado, refs) {
  if (!refs || refs.length < 1) return null;
  const maxD = maxDistanciaNumerica();

  if (refs.length >= 2) {
    for (let i = 0; i < refs.length - 1; i++) {
      const a = refs[i];
      const b = refs[i + 1];
      const na = a.numero;
      const nb = b.numero;
      if (na <= numeroBuscado && numeroBuscado <= nb) {
        const den = nb - na;
        if (den === 0) {
          return {
            lat: a.lat,
            lng: a.lng,
            metodo: "interpolacion_lineal",
            numero_menor: na,
            numero_mayor: nb,
            proporcion: 0,
          };
        }
        const t = (numeroBuscado - na) / den;
        return {
          lat: a.lat + (b.lat - a.lat) * t,
          lng: a.lng + (b.lng - a.lng) * t,
          metodo: "interpolacion_lineal",
          numero_menor: na,
          numero_mayor: nb,
          proporcion: t,
        };
      }
    }
  }

  let best = null;
  let minDiff = Infinity;
  for (const r of refs) {
    const d = Math.abs(r.numero - numeroBuscado);
    if (d < minDiff && d <= maxD) {
      minDiff = d;
      best = r;
    }
  }
  if (best) {
    return {
      lat: best.lat,
      lng: best.lng,
      metodo: "mas_cercano",
      numero_usado: best.numero,
      diferencia: minDiff,
    };
  }
  return null;
}

function puntoMedioGeometria(geometria) {
  if (!geometria || geometria.length === 0) return null;
  const mid = Math.floor(geometria.length / 2);
  const p = geometria[mid];
  const la = Number(p.lat);
  const lo = Number(p.lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  return { lat: la, lng: lo };
}

/**
 * @param {string} calle
 * @param {string} localidad
 * @param {string|number} numero
 * @param {string} [provincia]
 */
export async function interpolarPosicionEnCalle(calle, localidad, numero, provincia = "") {
  if (!streetGeometryInterpolationEnabled()) {
    return { hit: false, razon: "deshabilitado" };
  }
  const n = parseInt(String(numero || "").replace(/\D/g, ""), 10);
  if (!Number.isFinite(n) || n <= 0) {
    return { hit: false, razon: "numero_invalido" };
  }

  const pack = await obtenerGeometriaCalle(calle, localidad, provincia);
  const geometria = pack?.geometry;
  const refs = await buscarNumerosReferenciaEnCalle(calle, localidad, provincia);

  if (refs.length >= 2) {
    const interp = interpolarPorReferencias(n, refs);
    if (interp && coordsValidasWgs84(interp.lat, interp.lng)) {
      return {
        hit: true,
        lat: interp.lat,
        lng: interp.lng,
        source:
          interp.metodo === "interpolacion_lineal"
            ? "interpolacion_geometria_refs_lineal"
            : "interpolacion_geometria_refs_cercano",
        detalles: interp,
      };
    }
  }

  if (refs.length === 1 && coordsValidasWgs84(refs[0].lat, refs[0].lng)) {
    const d = Math.abs(refs[0].numero - n);
    if (d <= maxDistanciaNumerica()) {
      return {
        hit: true,
        lat: refs[0].lat,
        lng: refs[0].lng,
        source: "interpolacion_geometria_un_solo_ref",
        detalles: { metodo: "un_ref", numero_usado: refs[0].numero, diferencia: d },
      };
    }
  }

  if (geometria && geometria.length >= 2) {
    const pm = puntoMedioGeometria(geometria);
    if (pm && coordsValidasWgs84(pm.lat, pm.lng)) {
      return {
        hit: true,
        lat: pm.lat,
        lng: pm.lng,
        source: refs.length === 0 ? "geometria_punto_medio" : "geometria_punto_medio_sin_par_refs",
        detalles: {
          metodo: "punto_medio_linea",
          total_puntos: geometria.length,
          refs_encontrados: refs.length,
        },
      };
    }
  }

  return { hit: false, razon: "sin_datos", refs: refs.length, tiene_geom: !!(geometria && geometria.length >= 2) };
}
