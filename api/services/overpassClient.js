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

export { obtenerGeometriaCalle } from "./interpolacionAlturas.js";

function overpassInterpreterUrl() {
  return String(process.env.OVERPASS_API_URL || "https://overpass-api.de/api/interpreter").replace(/\/+$/, "");
}

function overpassTimeoutMs() {
  const v = parseInt(String(process.env.OVERPASS_TIMEOUT_MS || "10000"), 10);
  return Number.isFinite(v) && v >= 3000 && v <= 120000 ? v : 10000;
}

/**
 * POST Overpass interpreter; timeout AbortSignal.
 * @param {string} query
 * @returns {Promise<{ elements?: unknown[] } | null>}
 */
export async function ejecutarConsultaOverpass(query) {
  const url = overpassInterpreterUrl();
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), overpassTimeoutMs());
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: ac.signal,
    });
    if (!r.ok) return null;
    return await r.json().catch(() => null);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
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
