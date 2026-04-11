/**
 * Validación de coords al persistir en `socios_catalogo` y heurísticas para el pipeline (puntos sospechosos).
 * made by leavera77
 */

/** Puntos genéricos conocidos por experiencia operativa (radio ~500 m por defecto). */
export const PUNTOS_COORDS_SOSPECHOSOS_KNOWN = [
  { lat: -31.581131, lng: -60.077763, nombre: "Diagonal Comercio (ej. histórico)", radio: 0.0005 },
];

/** Bounding boxes aproximados WGS84 (normalizar provincia sin tildes, minúsculas). */
export const PROVINCIA_BBOX_ARG = {
  "entre rios": { minLat: -34.0, maxLat: -30.5, minLng: -60.8, maxLng: -57.5 },
  "santa fe": { minLat: -34.9, maxLat: -27.5, minLng: -62.0, maxLng: -58.5 },
};

function normProv(p) {
  if (p == null) return "";
  return String(p)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * @param {number} lat
 * @param {number} lng
 * @param {{ lat: number, lng: number, nombre?: string, radio?: number }} punto
 */
export function coordCercaDePuntoSospechoso(lat, lng, punto, radioOverride) {
  const r = radioOverride ?? punto.radio ?? 0.0005;
  return Math.abs(lat - punto.lat) < r && Math.abs(lng - punto.lng) < r;
}

/**
 * @param {number} lat
 * @param {number} lng
 * @param {string|null} provincia
 * @returns {{ ok: boolean, fueraDeBbox?: boolean }}
 */
export function coordsDentroDeBboxProvincia(lat, lng, provincia) {
  const key = normProv(provincia);
  if (!key) return { ok: true };
  const bbox = PROVINCIA_BBOX_ARG[key];
  if (!bbox) return { ok: true };
  if (
    lat < bbox.minLat ||
    lat > bbox.maxLat ||
    lng < bbox.minLng ||
    lng > bbox.maxLng
  ) {
    return { ok: false, fueraDeBbox: true };
  }
  return { ok: true };
}

/**
 * Validación dura antes de UPDATE/INSERT de coords en catálogo.
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
export function validarCoordenadasParaPersistirCatalogo(lat, lng, opts = {}) {
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) {
    return { ok: false, code: "non_finite", message: "lat/lng no numéricos" };
  }
  if (la < -90 || la > 90 || lo < -180 || lo > 180) {
    return { ok: false, code: "wgs84_range", message: "fuera de rango WGS84" };
  }
  if (Math.abs(la) < 0.0001 && Math.abs(lo) < 0.0001) {
    return { ok: false, code: "near_zero", message: "coordenadas ~ (0,0)" };
  }

  const bloquearSospechosos =
    process.env.CATALOGO_BLOQUEAR_PUNTOS_SOSPECHOSOS === "1" ||
    process.env.CATALOGO_BLOQUEAR_PUNTOS_SOSPECHOSOS === "true";

  for (const p of PUNTOS_COORDS_SOSPECHOSOS_KNOWN) {
    if (coordCercaDePuntoSospechoso(la, lo, p)) {
      if (bloquearSospechosos) {
        return {
          ok: false,
          code: "punto_sospechoso",
          message: `Cerca de punto marcado: ${p.nombre}`,
        };
      }
      try {
        console.warn(
          JSON.stringify({
            evt: "socios_catalogo_coords_sospechosas_soft",
            nombre: p.nombre,
            lat: la,
            lng: lo,
          })
        );
      } catch (_) {}
    }
  }

  const pv = opts.provincia != null ? String(opts.provincia) : "";
  const bbox = coordsDentroDeBboxProvincia(la, lo, pv);
  if (!bbox.ok && bbox.fueraDeBbox) {
    const warnOnly = !(
      process.env.CATALOGO_BLOQUEAR_FUERA_BBOX_PROVINCIA === "1" ||
      process.env.CATALOGO_BLOQUEAR_FUERA_BBOX_PROVINCIA === "true"
    );
    if (!warnOnly) {
      return {
        ok: false,
        code: "fuera_bbox_provincia",
        message: `Coords fuera del bbox esperado para provincia ${pv || "?"}`,
      };
    }
    try {
      console.warn(
        JSON.stringify({
          evt: "socios_catalogo_coords_fuera_bbox_provincia",
          provincia: pv,
          lat: la,
          lng: lo,
        })
      );
    } catch (_) {}
  }

  return { ok: true };
}
