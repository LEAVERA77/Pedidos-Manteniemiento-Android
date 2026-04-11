/**
 * Vecino en la misma calle (OSM): addr:housenumber con misma paridad que el pedido
 * y distancia numérica mínima dentro de ±20 (o ±40 si no hay candidatos en ±20).
 * Usa Overpass en el área de localidad/provincia (misma política que anclaInicioCalle).
 *
 * made by leavera77
 */

import {
  bloquesAreaLocalidadProvincia,
  escapeOverpassRegexLiteral,
  generarVariantesNombre,
  normalizarParaBusqueda,
} from "./interpolacionAlturas.js";

const OVERPASS_API = "https://overpass-api.de/api/interpreter";

const DEFAULT_TIMEOUT_MS = Number(process.env.OVERPASS_VECINOS_TIMEOUT_MS || "") || 28000;

function parseHouseNumberRaw(raw) {
  const s = String(raw || "").trim();
  const m = s.match(/^(\d{1,6})/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function nombreCalleCoincide(addrStreet, calleNormalizada) {
  const a = normalizarParaBusqueda(addrStreet || "");
  const b = calleNormalizada;
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  return false;
}

function mismaParidad(a, b) {
  return (Math.abs(a) % 2) === (Math.abs(b) % 2);
}

function coordsOk(lat, lng) {
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return false;
  if (Math.abs(la) > 90 || Math.abs(lo) > 180) return false;
  return true;
}

/**
 * @param {{
 *   calle: string,
 *   numeroPedido: number,
 *   localidad: string,
 *   provincia?: string|null,
 *   postalDigits?: string,
 * }} p
 * @returns {Promise<{
 *   lat: number, lng: number, fuente: string,
 *   numero_osm: number, numero_pedido: number, delta: number, rangoUsado: 20|40,
 * } | null>}
 */
export async function buscarCoordenadasVecinoParidadOverpass(p) {
  const calleClean = String(p.calle || "").trim();
  const locClean = String(p.localidad || "").trim();
  const provClean = p.provincia != null ? String(p.provincia).trim() : "";
  const nPedido = Number(p.numeroPedido);
  if (calleClean.length < 2 || locClean.length < 2 || !Number.isFinite(nPedido) || nPedido <= 0) {
    return null;
  }

  const locNorm = normalizarParaBusqueda(locClean);
  const locEscaped = escapeOverpassRegexLiteral(locNorm.length >= 2 ? locNorm : locClean);
  const calleNorm = normalizarParaBusqueda(calleClean);
  const variantes = generarVariantesNombre(calleClean).slice(0, 8);
  const areaBlock = bloquesAreaLocalidadProvincia(locEscaped, provClean);

  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);

  const candidatos = [];
  const seen = new Set();

  try {
    for (const v of variantes) {
      const streetPat = escapeOverpassRegexLiteral(v);
      const query = `
[out:json][timeout:25];
${areaBlock}
node(area.loc)["addr:housenumber"]["addr:street"~"${streetPat}",i];
out body;
      `.trim();

      const response = await fetch(OVERPASS_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "GestorNova/1.0 (vecino-paridad; contact: geocode)",
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: ctrl.signal,
      });
      if (!response.ok) continue;
      const data = await response.json();
      const elements = data.elements || [];
      for (const el of elements) {
        if (el.type !== "node" || el.lat == null || el.lon == null) continue;
        if (el.id != null && seen.has(el.id)) continue;
        if (el.id != null) seen.add(el.id);
        const st = el.tags?.["addr:street"];
        if (!nombreCalleCoincide(st, calleNorm)) continue;
        const hn = parseHouseNumberRaw(el.tags?.["addr:housenumber"]);
        if (hn == null || hn < 0) continue;
        if (!mismaParidad(hn, nPedido)) continue;
        candidatos.push({ el, hn, lat: el.lat, lng: el.lon });
      }
    }
  } catch (e) {
    if (e?.name === "AbortError") {
      throw new Error("overpass_vecinos_timeout");
    }
    throw e;
  } finally {
    clearTimeout(to);
  }

  if (!candidatos.length) return null;

  function mejorEnRango(radio) {
    const minN = nPedido - radio;
    const maxN = nPedido + radio;
    let best = null;
    let bestDelta = Infinity;
    for (const c of candidatos) {
      if (c.hn < minN || c.hn > maxN) continue;
      const d = Math.abs(c.hn - nPedido);
      if (d < bestDelta) {
        bestDelta = d;
        best = c;
      }
    }
    return best ? { ...best, rangoUsado: radio } : null;
  }

  let pick = mejorEnRango(20);
  if (!pick) pick = mejorEnRango(40);
  if (!pick) return null;

  if (!coordsOk(pick.lat, pick.lng)) return null;

  return {
    lat: Number(pick.lat),
    lng: Number(pick.lng),
    fuente: "osm_vecino_paridad",
    numero_osm: pick.hn,
    numero_pedido: nPedido,
    delta: Math.abs(pick.hn - nPedido),
    rangoUsado: pick.rangoUsado,
  };
}
