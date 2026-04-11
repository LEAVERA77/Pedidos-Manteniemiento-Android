/**
 * Cascada de anclaje “inicio de calle” cuando no hay endpoint directo:
 * B) Nominatim estructurado con número 1 como proxy de inicio
 * C) Overpass: nodos addr:street + addr:housenumber → mínimo numérico en área de localidad
 * D) Overpass: way(s) con name coincidente → la way de mayor longitud → primer nodo de geometría
 *
 * Criterio D (varias ways homónimas): mayor longitud de eje en metros (Haversine acumulado).
 * Área localidad: relación admin / ISO3166-2 como en interpolacionAlturas (bloquesAreaLocalidadProvincia).
 *
 * made by leavera77
 */

import { geocodeCalleNumeroLocalidadArgentina } from "./nominatimClient.js";
import {
  bloquesAreaLocalidadProvincia,
  escapeOverpassRegexLiteral,
  generarVariantesNombre,
  normalizarParaBusqueda,
  distanciaHaversine,
} from "./interpolacionAlturas.js";

const OVERPASS_API = "https://overpass-api.de/api/interpreter";

/** Valores persistibles en geocoding_audit / logs */
export const METODO_ANCLA = {
  NOMINATIM_INICIO_NUM1: "nominatim_inicio_num1",
  OVERPASS_ADDR_MIN: "overpass_addr_min",
  OVERPASS_GEOM_FIRST_NODE: "overpass_geom_first_node",
};

export const PRECISION_ANCLA = {
  EXACTO: "exacto",
  APROX_INICIO: "aprox_inicio",
  TENANT_FALLBACK: "tenant_fallback",
};

function coordsOk(lat, lng) {
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return false;
  if (Math.abs(la) > 90 || Math.abs(lo) > 180) return false;
  return true;
}

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

/**
 * B — Nominatim con número 1 (proxy inicio).
 */
async function tryNominatimInicioNum1(calle, localidad, provincia, postalDigits, log) {
  const c = String(calle || "").trim();
  const loc = String(localidad || "").trim();
  const prov = String(provincia || "").trim();
  if (c.length < 2 || loc.length < 2) return null;
  log.push("  [B] Nominatim estructurado: calle + número 1 (proxy inicio)");
  try {
    const g = await geocodeCalleNumeroLocalidadArgentina(loc, c, "1", {
      stateOrProvince: prov.length >= 2 ? prov : undefined,
      postalCode: postalDigits && postalDigits.length >= 4 ? postalDigits : undefined,
      allowTenantCentroidFallback: true,
      catalogStrict: false,
    });
    if (g && coordsOk(g.lat, g.lng)) {
      log.push(`  ✓ [B] Hit Nominatim n°1 → ${Number(g.lat).toFixed(6)}, ${Number(g.lng).toFixed(6)}`);
      return { lat: g.lat, lng: g.lng, precision: PRECISION_ANCLA.APROX_INICIO };
    }
    log.push("  → [B] Sin resultado útil");
  } catch (e) {
    log.push(`  ⚠️ [B] ${e?.message || e}`);
  }
  return null;
}

/**
 * C — Overpass: mínimo addr:housenumber en área de localidad.
 */
async function tryOverpassAddrMin(calle, localidad, provincia, log) {
  const calleClean = String(calle || "").trim();
  const locClean = String(localidad || "").trim();
  const provClean = provincia ? String(provincia).trim() : "";
  if (calleClean.length < 2 || locClean.length < 2) return null;

  const locNorm = normalizarParaBusqueda(locClean);
  const locEscaped = escapeOverpassRegexLiteral(locNorm.length >= 2 ? locNorm : locClean);
  const calleNorm = normalizarParaBusqueda(calleClean);
  const variantes = generarVariantesNombre(calleClean).slice(0, 8);
  const areaBlock = bloquesAreaLocalidadProvincia(locEscaped, provClean);

  log.push("  [C] Overpass: nodos addr:housenumber + addr:street (mínimo numérico)");

  for (const v of variantes) {
    const streetPat = escapeOverpassRegexLiteral(v);
    const query = `
[out:json][timeout:35];
${areaBlock}
node(area.loc)["addr:housenumber"]["addr:street"~"${streetPat}",i];
out body;
    `.trim();

    try {
      const response = await fetch(OVERPASS_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "GestorNova/1.0 (ancla-inicio-calle; contact: geocode)",
        },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!response.ok) {
        log.push(`  → [C] Overpass HTTP ${response.status}`);
        continue;
      }
      const data = await response.json();
      const elements = data.elements || [];
      let bestNum = Infinity;
      let bestEl = null;
      for (const el of elements) {
        if (el.type !== "node" || el.lat == null || el.lon == null) continue;
        const st = el.tags?.["addr:street"];
        if (!nombreCalleCoincide(st, calleNorm)) continue;
        const hn = parseHouseNumberRaw(el.tags?.["addr:housenumber"]);
        if (hn == null || hn < 0) continue;
        if (hn < bestNum) {
          bestNum = hn;
          bestEl = el;
        }
      }
      if (bestEl && coordsOk(bestEl.lat, bestEl.lon)) {
        log.push(
          `  ✓ [C] Mínimo número en OSM para la vía ≈ ${bestNum} → ${Number(bestEl.lat).toFixed(6)}, ${Number(bestEl.lon).toFixed(6)}`
        );
        return {
          lat: bestEl.lat,
          lng: bestEl.lon,
          precision: PRECISION_ANCLA.APROX_INICIO,
          addrMin: bestNum,
        };
      }
    } catch (e) {
      log.push(`  ⚠️ [C] ${e?.message || e}`);
    }
  }
  log.push("  → [C] Sin nodos addr útiles");
  return null;
}

/**
 * Longitud acumulada de una polilínea WGS84 en metros.
 */
function longitudPolyline(coords) {
  let t = 0;
  for (let i = 1; i < coords.length; i++) {
    t += distanciaHaversine(coords[i - 1].lat, coords[i - 1].lng, coords[i].lat, coords[i].lng);
  }
  return t;
}

/**
 * D — Overpass: todas las ways highway+name en área; elegir la de mayor longitud; primer nodo = ancla.
 */
async function tryOverpassGeomFirstNodeLongest(calle, localidad, provincia, log) {
  const calleClean = String(calle || "").trim();
  const locClean = String(localidad || "").trim();
  const provClean = provincia ? String(provincia).trim() : "";
  if (calleClean.length < 2 || locClean.length < 2) return null;

  const locNorm = normalizarParaBusqueda(locClean);
  const locEscaped = escapeOverpassRegexLiteral(locNorm.length >= 2 ? locNorm : locClean);
  const variantes = generarVariantesNombre(calleClean).slice(0, 6);
  const areaBlock = bloquesAreaLocalidadProvincia(locEscaped, provClean);

  log.push("  [D] Overpass: way(s) name~calle — se elige la de mayor longitud; ancla = primer nodo OSM");

  for (const v of variantes) {
    const varianteBusqueda = escapeOverpassRegexLiteral(v);
    const query = `
[out:json][timeout:35];
${areaBlock}
(
  way["highway"]["name"~"${varianteBusqueda}",i](area.loc);
);
out geom;
    `.trim();

    try {
      const response = await fetch(OVERPASS_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "GestorNova/1.0 (ancla-inicio-calle; contact: geocode)",
        },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!response.ok) continue;
      const data = await response.json();
      const elements = (data.elements || []).filter((e) => e.type === "way" && e.geometry?.length >= 2);

      let best = null;
      let bestLen = -1;
      for (const way of elements) {
        const geometry = way.geometry.map((node) => ({ lat: node.lat, lng: node.lon }));
        const len = longitudPolyline(geometry);
        if (len > bestLen) {
          bestLen = len;
          best = { geometry, tags: way.tags || {}, lenM: len };
        }
      }

      if (best?.geometry?.length >= 2) {
        const first = best.geometry[0];
        if (coordsOk(first.lat, first.lng)) {
          log.push(
            `  ✓ [D] Way más larga (~${Math.round(bestLen)} m), ${best.geometry.length} nodos — ancla primer nodo`
          );
          return {
            lat: first.lat,
            lng: first.lng,
            precision: PRECISION_ANCLA.APROX_INICIO,
            geometry: best.geometry,
            tags: best.tags,
            wayLengthM: bestLen,
          };
        }
      }
    } catch (e) {
      log.push(`  ⚠️ [D] ${e?.message || e}`);
    }
  }
  log.push("  → [D] Sin geometría de vía en área");
  return null;
}

/**
 * Cascada B → C → D. No incluye Nominatim exacto (manejado antes en el pipeline principal).
 * @param {{ calle: string, localidad: string, provincia?: string, postalDigits?: string, L?: function }} opts
 * @returns {Promise<{ ok: boolean, lat?: number, lng?: number, metodo?: string, precision?: string, geometry?: Array, tags?: object, log: string[] }>}
 */
export async function resolverCascadaAnclaInicio(opts = {}) {
  const calle = String(opts.calle || "").trim();
  const localidad = String(opts.localidad || "").trim();
  const provincia = String(opts.provincia || "").trim();
  const postalDigits = opts.postalDigits != null ? String(opts.postalDigits).replace(/\D/g, "") : "";
  const L = typeof opts.L === "function" ? opts.L : () => {};
  const log = [];
  const push = (m) => {
    log.push(m);
    try {
      L(m);
    } catch (_) {}
  };

  push("\n🔗 Cascada ancla inicio calle (B→C→D, tras fallar exacto previo)");

  if (calle.length < 2 || localidad.length < 2) {
    push("  → Sin calle/localidad");
    return { ok: false, log };
  }

  const rB = await tryNominatimInicioNum1(calle, localidad, provincia, postalDigits, log);
  if (rB) {
    return {
      ok: true,
      lat: rB.lat,
      lng: rB.lng,
      metodo: METODO_ANCLA.NOMINATIM_INICIO_NUM1,
      precision: rB.precision,
      log,
    };
  }

  const rC = await tryOverpassAddrMin(calle, localidad, provincia, log);
  if (rC) {
    return {
      ok: true,
      lat: rC.lat,
      lng: rC.lng,
      metodo: METODO_ANCLA.OVERPASS_ADDR_MIN,
      precision: rC.precision,
      addrMin: rC.addrMin,
      log,
    };
  }

  const rD = await tryOverpassGeomFirstNodeLongest(calle, localidad, provincia, log);
  if (rD) {
    return {
      ok: true,
      lat: rD.lat,
      lng: rD.lng,
      metodo: METODO_ANCLA.OVERPASS_GEOM_FIRST_NODE,
      precision: rD.precision,
      geometry: rD.geometry,
      tags: rD.tags,
      wayLengthM: rD.wayLengthM,
      log,
    };
  }

  push("  → Cascada B/C/D sin ancla");
  return { ok: false, log };
}
