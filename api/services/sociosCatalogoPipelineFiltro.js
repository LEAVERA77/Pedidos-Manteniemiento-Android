/**
 * Decide si el PASO 2 del pipeline debe ignorar coords devueltas por `buscarCoordenadasPorNisMedidor`
 * (edad, flag BD, puntos conocidos).
 * made by leavera77
 */
import { coordCercaDePuntoSospechoso, PUNTOS_COORDS_SOSPECHOSOS_KNOWN } from "./sociosCatalogoCoordsValidacion.js";

/**
 * @param {null | {
 *   lat: number,
 *   lng: number,
 *   esManual?: boolean,
 *   fechaActualizacionCoords?: string | Date | null,
 *   coordenadaSospechosa?: boolean | null,
 * }} hit
 * @returns {{ ignore: boolean, razon?: string }}
 */
export function evaluarIgnorarCoordenadasCatalogoPipeline(hit) {
  if (!hit || typeof hit.lat !== "number" || typeof hit.lng !== "number") {
    return { ignore: true, razon: "sin_hit" };
  }

  const ignSuspCol =
    process.env.IGNORAR_COORDENADAS_SOSPECHOSAS === "1" ||
    process.env.IGNORAR_COORDENADAS_SOSPECHOSAS === "true";
  if (ignSuspCol && hit.coordenadaSospechosa === true) {
    return { ignore: true, razon: "columna_coordenada_sospechosa" };
  }

  const maxDias = parseInt(String(process.env.MAX_EDAD_COORDS_CATALOGO_DIAS || "0"), 10);
  if (Number.isFinite(maxDias) && maxDias > 0) {
    const fec = hit.fechaActualizacionCoords;
    if (fec == null) {
      return { ignore: true, razon: "sin_fecha_actualizacion_coords" };
    }
    const t = new Date(fec).getTime();
    if (!Number.isFinite(t)) {
      return { ignore: true, razon: "fecha_coords_invalida" };
    }
    const edadDias = (Date.now() - t) / (86400 * 1000);
    if (edadDias > maxDias) {
      return { ignore: true, razon: `coords_mas_viejas_que_${maxDias}d` };
    }
  }

  const corteStr = process.env.IGNORAR_CATALOGO_FECHA || "";
  if (corteStr.trim()) {
    const corte = new Date(corteStr);
    const tCorte = corte.getTime();
    if (Number.isFinite(tCorte)) {
      const fec = hit.fechaActualizacionCoords;
      if (fec == null) {
        return { ignore: true, razon: "sin_fecha_para_corte" };
      }
      const t = new Date(fec).getTime();
      if (Number.isFinite(t) && t < tCorte) {
        return { ignore: true, razon: `coords_anteriores_a_${corteStr}` };
      }
    }
  }

  const skipKnownBad =
    process.env.IGNORAR_PUNTOS_KNOWN_BAD_CATALOGO !== "0" &&
    process.env.IGNORAR_PUNTOS_KNOWN_BAD_CATALOGO !== "false";
  if (skipKnownBad) {
    for (const p of PUNTOS_COORDS_SOSPECHOSOS_KNOWN) {
      if (coordCercaDePuntoSospechoso(hit.lat, hit.lng, p)) {
        return { ignore: true, razon: `cerca_${p.nombre || "punto_sospechoso"}` };
      }
    }
  }

  return { ignore: false };
}
