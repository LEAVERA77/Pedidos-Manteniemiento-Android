/**
 * Geocodificación catastral: cadena proporcional sobre geometría OSM + offset lateral por paridad.
 * Último recurso automático antes del centro de calle (PASO 3f).
 * made by leavera77
 */

import {
  obtenerGeometriaCalleCacheada,
  haversineMeters,
  longitudPolylineMetros,
} from "./streetGeometryCache.js";

export function catastralGeocodingEnabled() {
  return process.env.CATASTRAL_GEOCODING_ENABLED !== "0" && process.env.CATASTRAL_GEOCODING_ENABLED !== "false";
}

function offsetLateralMetros(lat, lng, p1, p2, metros, ladoDerecho) {
  const m = Math.abs(Number(metros)) || 0;
  if (m < 0.01) return { lat, lng };

  const φ = (lat * Math.PI) / 180;
  const dE = (p2.lng - p1.lng) * Math.cos(φ) * 111320;
  const dN = (p2.lat - p1.lat) * 111320;
  const L = Math.sqrt(dE * dE + dN * dN) || 1e-9;
  const e = dE / L;
  const n = dN / L;
  const eP = ladoDerecho ? n : -n;
  const nP = ladoDerecho ? -e : e;
  return {
    lat: lat + (nP * m) / 111320,
    lng: lng + (eP * m) / (111320 * Math.cos(φ)),
  };
}

/**
 * Punto sobre la polilínea a una fracción 0–1 de la longitud total (por distancia Haversine).
 * @param {Array<{lat:number,lng:number}>} geometria
 * @param {number} proporcion 0..1
 */
function puntoEnPolilineaPorProporcion(geometria, proporcion) {
  if (!geometria || geometria.length === 0) return null;
  if (geometria.length === 1) return { ...geometria[0], iSeg: 0 };
  const total = longitudPolylineMetros(geometria);
  if (!(total > 0)) return null;
  const target = Math.min(0.999999, Math.max(0.000001, proporcion)) * total;
  let acc = 0;
  for (let i = 1; i < geometria.length; i++) {
    const a = geometria[i - 1];
    const b = geometria[i];
    const seg = haversineMeters(a.lat, a.lng, b.lat, b.lng);
    if (acc + seg >= target) {
      const resto = target - acc;
      const t = seg > 0 ? resto / seg : 0;
      return {
        lat: a.lat + (b.lat - a.lat) * t,
        lng: a.lng + (b.lng - a.lng) * t,
        iSeg: i - 1,
      };
    }
    acc += seg;
  }
  const last = geometria[geometria.length - 1];
  return { lat: last.lat, lng: last.lng, iSeg: geometria.length - 2 };
}

/**
 * @param {string} calle
 * @param {string|number} numero
 * @param {string} localidad
 * @param {string} [provincia]
 */
export async function geocodeByCatastral(calle, numero, localidad, provincia = "") {
  if (!catastralGeocodingEnabled()) {
    return { hit: false, razon: "deshabilitado" };
  }

  const nRaw = String(numero ?? "").replace(/\D/g, "");
  const numeroInt = parseInt(nRaw, 10);
  if (!Number.isFinite(numeroInt) || numeroInt <= 0) {
    return { hit: false, razon: "numero_invalido" };
  }

  const metrosPorCuadra = parseInt(String(process.env.CATASTRAL_METROS_POR_CUADRA || "100"), 10);
  const usarCuadra =
    process.env.CATASTRAL_NUMERO_COMO_CUADRA === "1" ||
    process.env.CATASTRAL_NUMERO_COMO_CUADRA === "true";
  const distanciaMetros = usarCuadra
    ? numeroInt * (Number.isFinite(metrosPorCuadra) && metrosPorCuadra > 0 ? metrosPorCuadra : 100)
    : numeroInt;

  const offsetM = parseInt(String(process.env.CATASTRAL_OFFSET_LATERAL_METROS || "5"), 10);
  const offsetOk = Number.isFinite(offsetM) && offsetM >= 0 && offsetM <= 80 ? offsetM : 5;

  const pack = await obtenerGeometriaCalleCacheada(calle, localidad, provincia);
  if (!pack.hit || !pack.geometria || !(pack.longitudTotal > 0)) {
    return { hit: false, razon: "sin_geometria" };
  }

  const { geometria, longitudTotal, source: geometriaSource } = pack;
  let proporcion = distanciaMetros / longitudTotal;
  if (!Number.isFinite(proporcion)) {
    return { hit: false, razon: "error_proporcion" };
  }
  proporcion = Math.min(0.95, Math.max(0.05, proporcion));

  const base = puntoEnPolilineaPorProporcion(geometria, proporcion);
  if (!base || base.lat == null || base.lng == null) {
    return { hit: false, razon: "error_calculo_punto" };
  }

  const esPar = numeroInt % 2 === 0;
  const i0 = Math.min(Math.max(0, base.iSeg ?? 0), geometria.length - 2);
  const p1 = geometria[i0];
  const p2 = geometria[i0 + 1];
  const lateral = offsetLateralMetros(base.lat, base.lng, p1, p2, offsetOk, esPar);

  return {
    hit: true,
    lat: lateral.lat,
    lng: lateral.lng,
    source: "catastral_via_m",
    detalles: {
      longitud_total_metros: longitudTotal,
      distancia_metros_objetivo: distanciaMetros,
      numero: numeroInt,
      proporcion,
      lado: esPar ? "derecha" : "izquierda",
      offset_metros: offsetOk,
      geometria_source: geometriaSource,
      numero_como_cuadra: usarCuadra,
    },
  };
}

/**
 * @param {Array<{ calle: string, numero: string|number, localidad: string, provincia?: string }>} direcciones
 */
export async function geocodeBatchByCatastral(direcciones) {
  const resultados = [];
  for (const dir of direcciones || []) {
    const r = await geocodeByCatastral(dir.calle, dir.numero, dir.localidad, dir.provincia || "");
    resultados.push({ ...dir, ...r });
  }
  return resultados;
}
