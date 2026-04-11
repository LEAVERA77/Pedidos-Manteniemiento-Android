/**
 * Utilidades WhatsApp: `coordsValidasWgs84` y (obsoleto) cascada local sin Nominatim.
 * El pin del pedido **no** debe resolverse aquí: usar `regeocodificarPedido` + `geocodeDomicilioSimpleQArgentina`.
 * made by leavera77
 */
import { query } from "../db/neon.js";
import { buscarCoordenadasVecinosMismaCalle } from "./whatsappPadronVecinos.js";

const NOTA_LOCALIDAD =
  "[Sistema] Ubicación aproximada: centro estadístico del padrón en la localidad declarada (sin GPS del domicilio).";
const NOTA_LOCALIDAD_CFG =
  "[Sistema] Ubicación aproximada: coordenadas de localidad definidas en configuración de empresa (localidades_coords / similar).";
const NOTA_TENANT =
  "[Sistema] Ubicación aproximada: coordenadas base de la empresa / sede (sin GPS en padrón ni referencias en calle).";
const NOTA_FALLBACK_AR =
  "[Sistema] Ubicación aproximada: punto de respaldo Argentina (configurar lat_base/lng_base en Empresa).";
const NOTA_GEOCACHE =
  "[Sistema] Coordenadas desde caché interna de direcciones (geocodificacion_cache); sin llamadas externas en tiempo real.";

/** Misma tolerancia que `pedidos_whatsapp_coords_wgs84_check.sql` (no placeholder ~0,0). */
const WGS84_EPS_WHATSAPP_DB = 1e-6;

/** Centro aproximado Argentina (último recurso; alineado con pipeline paso 5g). */
export const FALLBACK_WGS84_ARGENTINA = Object.freeze({ lat: -34.6037, lng: -58.3816 });

/**
 * Parsea lat/lng desde número o string (acepta coma decimal). Evita NaN silencioso hacia Postgres.
 * @param {unknown} v
 * @returns {number}
 */
export function parseCoordLoose(v) {
  if (v == null || v === "") return NaN;
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const t = String(v).trim();
  if (!t) return NaN;
  const n = Number(t.replace(/\s/g, "").replace(/,/g, "."));
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Equivalente a la cláusula positiva de `pedidos_whatsapp_coords_wgs84_check` (origen whatsapp).
 * Usar antes del INSERT y para alinear validación JS ↔ SQL.
 */
export function parLatLngPasaCheckWhatsappDb(lat, lng) {
  const la = parseCoordLoose(lat);
  const lo = parseCoordLoose(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return false;
  if (la < -90 || la > 90 || lo < -180 || lo > 180) return false;
  if (Math.abs(la) < WGS84_EPS_WHATSAPP_DB && Math.abs(lo) < WGS84_EPS_WHATSAPP_DB) return false;
  return true;
}

export function coordsValidasWgs84(lat, lng) {
  return parLatLngPasaCheckWhatsappDb(lat, lng);
}

async function tableExists(name) {
  const r = await query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
    [name]
  );
  return r.rows.length > 0;
}

async function columnasSet(name) {
  const r = await query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    [name]
  );
  return new Set((r.rows || []).map((c) => c.column_name));
}

function sqlLatPadExpr(cols) {
  const parts = [];
  if (cols.has("latitud")) parts.push("latitud::numeric");
  if (cols.has("lat")) parts.push("lat::numeric");
  if (!parts.length) return null;
  return parts.length === 1 ? `${parts[0]}` : `COALESCE(${parts.join(", ")})`;
}

function sqlLngPadExpr(cols) {
  const parts = [];
  if (cols.has("longitud")) parts.push("longitud::numeric");
  if (cols.has("lng")) parts.push("lng::numeric");
  if (!parts.length) return null;
  return parts.length === 1 ? `${parts[0]}` : `COALESCE(${parts.join(", ")})`;
}

async function loadTenantCentroid(tenantId) {
  const r = await query(`SELECT configuracion FROM clientes WHERE id = $1 AND activo = TRUE LIMIT 1`, [
    Number(tenantId),
  ]);
  let cfg = r.rows?.[0]?.configuracion;
  if (typeof cfg === "string") {
    try {
      cfg = JSON.parse(cfg);
    } catch (_) {
      cfg = {};
    }
  }
  const c = cfg && typeof cfg === "object" ? cfg : {};
  const locCoords = c.localidades_coords || c.localidad_centros || c.centros_localidad;
  const la = c.lat_base != null ? Number(c.lat_base) : NaN;
  const lo = c.lng_base != null ? Number(c.lng_base) : NaN;
  return {
    tenantLat: Number.isFinite(la) ? la : null,
    tenantLng: Number.isFinite(lo) ? lo : null,
    /** mapa opcional { "Cerrito": { lat, lng }, ... } */
    localidadesCoords:
      locCoords && typeof locCoords === "object" && !Array.isArray(locCoords) ? locCoords : null,
  };
}

function coordsDesdeConfigLocalidad(localidadesCoords, nombreLocalidad) {
  if (!localidadesCoords || !nombreLocalidad) return null;
  const want = String(nombreLocalidad).trim().toLowerCase();
  if (want.length < 2) return null;
  for (const [k, v] of Object.entries(localidadesCoords)) {
    if (String(k).trim().toLowerCase() === want && v && typeof v === "object") {
      const la = Number(v.lat ?? v.latitude ?? v.la);
      const lo = Number(v.lng ?? v.longitude ?? v.lon ?? v.lo);
      if (coordsValidasWgs84(la, lo)) return { lat: la, lng: lo };
    }
  }
  return null;
}

/**
 * Promedio de coordenadas válidas en padrón para una localidad (socios_catalogo + clientes_finales).
 */
async function centroLocalidadDesdePadronSql(tenantId, localidad) {
  const loc = String(localidad || "").trim();
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1 || loc.length < 2) return null;

  const sumLa = [];
  const sumLo = [];
  const pushRow = (la, lo) => {
    const a = Number(la);
    const b = Number(lo);
    if (coordsValidasWgs84(a, b)) {
      sumLa.push(a);
      sumLo.push(b);
    }
  };

  if (await tableExists("socios_catalogo")) {
    const cols = await columnasSet("socios_catalogo");
    const latX = sqlLatPadExpr(cols);
    const lngX = sqlLngPadExpr(cols);
    if (latX && lngX) {
      const tenantCol = cols.has("cliente_id")
        ? "cliente_id"
        : cols.has("tenant_id")
          ? "tenant_id"
          : null;
      let sql = `SELECT ${latX} AS la, ${lngX} AS lo
        FROM socios_catalogo s
        WHERE COALESCE(s.activo, TRUE) = TRUE
          AND UPPER(TRIM(COALESCE(s.localidad,''))) = UPPER(TRIM($1))
          AND ${latX} IS NOT NULL AND ${lngX} IS NOT NULL`;
      const params = [loc];
      if (tenantCol) {
        sql += ` AND (s.${tenantCol} IS NULL OR s.${tenantCol} = $2)`;
        params.push(tid);
      }
      sql += ` LIMIT 400`;
      try {
        const r = await query(sql, params);
        for (const row of r.rows || []) pushRow(row.la, row.lo);
      } catch (e) {
        console.warn("[geo-garantizada] socios_catalogo localidad avg", e?.message || e);
      }
    }
  }

  if (await tableExists("clientes_finales")) {
    const cols = await columnasSet("clientes_finales");
    const latX = sqlLatPadExpr(cols);
    const lngX = sqlLngPadExpr(cols);
    if (latX && lngX) {
      try {
        const r = await query(
          `SELECT ${latX} AS la, ${lngX} AS lo
           FROM clientes_finales c
           WHERE c.cliente_id = $1 AND COALESCE(c.activo, TRUE) = TRUE
             AND UPPER(TRIM(COALESCE(c.localidad,''))) = UPPER(TRIM($2))
             AND ${latX} IS NOT NULL AND ${lngX} IS NOT NULL
           LIMIT 400`,
          [tid, loc]
        );
        for (const row of r.rows || []) pushRow(row.la, row.lo);
      } catch (e) {
        console.warn("[geo-garantizada] clientes_finales localidad avg", e?.message || e);
      }
    }
  }

  if (!sumLa.length) return null;
  const lat = sumLa.reduce((a, b) => a + b, 0) / sumLa.length;
  const lng = sumLo.reduce((a, b) => a + b, 0) / sumLo.length;
  return coordsValidasWgs84(lat, lng) ? { lat, lng } : null;
}

/**
 * @param {object} opts
 * @param {number} opts.tenantId
 * @param {number|null} opts.entradaLat
 * @param {number|null} opts.entradaLng
 * @param {string|null} opts.catalogoCalle
 * @param {string|null} opts.catalogoNumero
 * @param {string|null} opts.catalogoLocalidad
 * @param {string|null} opts.excludeNisMedidor
 * @param {boolean} opts.identificadoPorPadron — NIS/medidor/nis_medidor presente
 * @returns {Promise<{ lat: number, lng: number, fuente: string, nota: string|null }>}
 * @deprecated No usado por el bot; el pipeline de pin es `regeocodificarPedido` (Nominatim `q`). Se mantiene por compatibilidad si algún script la importa.
 */
export async function resolverGeolocalizacionGarantizadaWhatsapp(opts) {
  const tid = Number(opts.tenantId);
  const identificado = !!opts.identificadoPorPadron;
  if (!Number.isFinite(tid) || tid < 1) {
    return {
      lat: -34.6037,
      lng: -58.3816,
      fuente: "fallback_argentina",
      nota: NOTA_FALLBACK_AR,
    };
  }

  if (coordsValidasWgs84(opts.entradaLat, opts.entradaLng)) {
    return {
      lat: Number(opts.entradaLat),
      lng: Number(opts.entradaLng),
      fuente: "entrada",
      nota: null,
    };
  }

  const calle = opts.catalogoCalle != null ? String(opts.catalogoCalle).trim() : "";
  const num = opts.catalogoNumero != null ? String(opts.catalogoNumero).trim() : "";
  const loc = opts.catalogoLocalidad != null ? String(opts.catalogoLocalidad).trim() : "";
  const excl = opts.excludeNisMedidor != null ? String(opts.excludeNisMedidor).trim() : "";

  if (!identificado && loc.length < 2 && calle.length < 2) {
    const cfg0 = await loadTenantCentroid(tid);
    if (coordsValidasWgs84(cfg0.tenantLat, cfg0.tenantLng)) {
      return {
        lat: cfg0.tenantLat,
        lng: cfg0.tenantLng,
        fuente: "tenant_base",
        nota: NOTA_TENANT,
      };
    }
    return {
      lat: -34.6037,
      lng: -58.3816,
      fuente: "fallback_argentina",
      nota: NOTA_FALLBACK_AR,
    };
  }

  if (calle.length >= 2 && loc.length >= 2) {
    try {
      const { getCoordinatesFromPadron } = await import("./coordenadasDesdePadron.js");
      const pb = await getCoordinatesFromPadron({
        calle,
        localidad: loc,
        codigoPostal: null,
        tenantId: tid,
      });
      if (pb && coordsValidasWgs84(pb.lat, pb.lng)) {
        return {
          lat: pb.lat,
          lng: pb.lng,
          fuente: pb.fuente || "padron",
          nota: "[Sistema] Coordenadas ya cargadas en el padrón (sin Nominatim en tiempo real).",
        };
      }
    } catch (e) {
      console.warn("[geo-garantizada] padron coords", e?.message || e);
    }
  }

  if (calle.length >= 2 && loc.length >= 2) {
    try {
      const { cacheGeocodificacionGet, normalizarClaveDireccion } = await import("./cacheGeocodificacion.js");
      const clave = normalizarClaveDireccion(calle, num, loc, "");
      const cached = await cacheGeocodificacionGet(clave);
      if (cached && coordsValidasWgs84(cached.lat, cached.lng)) {
        return {
          lat: cached.lat,
          lng: cached.lng,
          fuente: "geocodificacion_cache",
          nota: NOTA_GEOCACHE,
        };
      }
    } catch (e) {
      console.warn("[geo-garantizada] geocodificacion_cache", e?.message || e);
    }
  }

  if (identificado && calle.length >= 2 && num) {
    try {
      const fb = await buscarCoordenadasVecinosMismaCalle({
        tenantId: tid,
        calle,
        localidad: loc || null,
        numeroTexto: num,
        excludeNisMedidor: excl || null,
        excludeClienteFinalId: null,
        preferTable: "socios_catalogo",
      });
      if (fb && coordsValidasWgs84(fb.lat, fb.lng)) {
        return { lat: fb.lat, lng: fb.lng, fuente: "vecino_padron", nota: fb.nota || null };
      }
    } catch (e) {
      console.warn("[geo-garantizada] vecinos", e?.message || e);
    }
  }

  if (
    (process.env.WHATSAPP_GEOCODE_NOMINATIM_FALLBACK === "1" ||
      process.env.WHATSAPP_GEOCODE_NOMINATIM_FALLBACK === "true") &&
    calle.length >= 2 &&
    loc.length >= 2
  ) {
    try {
      const { geocodeWithFallback } = await import("./geocodeWithFallback.js");
      const g = await geocodeWithFallback({
        calle,
        localidad: loc,
        numero: num || undefined,
        tenantId: tid,
        retries: 2,
      });
      if (g && coordsValidasWgs84(g.lat, g.lng)) {
        return {
          lat: g.lat,
          lng: g.lng,
          fuente: g.fromCache ? "nominatim_cache_tabla" : "nominatim_fallback",
          nota:
            "[Sistema] Geocodificación Nominatim (caché o red); conviene completar GPS en el padrón para no depender del servicio.",
        };
      }
    } catch (e) {
      console.warn("[geo-garantizada] nominatim fallback", e?.message || e);
    }
  }

  const cfg = await loadTenantCentroid(tid);
  if (loc.length >= 2) {
    const desdeCfg = coordsDesdeConfigLocalidad(cfg.localidadesCoords, loc);
    if (desdeCfg) {
      return { lat: desdeCfg.lat, lng: desdeCfg.lng, fuente: "config_localidad", nota: NOTA_LOCALIDAD_CFG };
    }
  }

  if (loc.length >= 2) {
    const prom = await centroLocalidadDesdePadronSql(tid, loc);
    if (prom && coordsValidasWgs84(prom.lat, prom.lng)) {
      return { lat: prom.lat, lng: prom.lng, fuente: "promedio_localidad_padron", nota: NOTA_LOCALIDAD };
    }
  }

  if (coordsValidasWgs84(cfg.tenantLat, cfg.tenantLng)) {
    return {
      lat: cfg.tenantLat,
      lng: cfg.tenantLng,
      fuente: "tenant_base",
      nota: NOTA_TENANT,
    };
  }

  return {
    lat: -34.6037,
    lng: -58.3816,
    fuente: "fallback_argentina",
    nota: NOTA_FALLBACK_AR,
  };
}
