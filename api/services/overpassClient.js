/**
 * Cliente Overpass (geometría de vía + nodos con addr:housenumber).
 * La geometría de calle reutiliza `obtenerGeometriaCalle` en interpolacionAlturas.js (consultas tolerantes).
 * made by leavera77
 */

import {
  bloquesAreaLocalidadProvincia,
  escapeOverpassRegexLiteral,
  normalizarParaBusqueda,
} from "./interpolacionAlturas.js";
import { postOverpassInterpreter } from "./overpassHttp.js";

export { obtenerGeometriaCalle } from "./interpolacionAlturas.js";

/**
 * POST Overpass interpreter; reintentos 429/502/503/504 vía overpassHttp.
 * @param {string} query
 * @returns {Promise<{ elements?: unknown[] } | null>}
 */
export async function ejecutarConsultaOverpass(query) {
  const result = await postOverpassInterpreter(query, { label: "addr:housenumber / vecinos" });
  if (!result.ok || !result.data) return null;
  return result.data;
}

/**
 * Nodos en el área de la localidad con addr:street ~ calle y addr:housenumber.
 * @param {string} calle
 * @param {string} localidad
 * @param {string} [provincia]
 * @returns {Promise<Array<{ numero: number, lat: number, lng: number }>>}
 */
export async function buscarNumerosReferenciaEnCalle(calle, localidad, provincia = "") {
  const calleClean = String(calle || "").trim();
  const locClean = String(localidad || "").trim();
  if (calleClean.length < 2 || locClean.length < 2) return [];

  const locNorm = normalizarParaBusqueda(locClean);
  const locEscaped = escapeOverpassRegexLiteral(locNorm.length >= 2 ? locNorm : locClean);
  const calleEsc = escapeOverpassRegexLiteral(normalizarParaBusqueda(calleClean));
  const provClean = provincia ? String(provincia).trim() : "";
  const areaBlock = bloquesAreaLocalidadProvincia(locEscaped, provClean);

  const query = `
[out:json][timeout:25];
${areaBlock}
node["addr:housenumber"]["addr:street"~"${calleEsc}",i](area.loc);
out body;
`.trim();

  const data = await ejecutarConsultaOverpass(query);
  const elements = Array.isArray(data?.elements) ? data.elements : [];
  const out = [];
  for (const el of elements) {
    if (el.type !== "node" || el.lat == null || el.lon == null) continue;
    const raw = el.tags?.["addr:housenumber"];
    if (raw == null) continue;
    const n = parseInt(String(raw).replace(/\D/g, ""), 10);
    if (!Number.isFinite(n) || n <= 0) continue;
    out.push({ numero: n, lat: Number(el.lat), lng: Number(el.lon) });
  }
  out.sort((a, b) => a.numero - b.numero);
  return out;
}
