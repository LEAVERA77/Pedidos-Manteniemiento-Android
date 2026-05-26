/**
 * Inferir distribuidor y transformador del pedido por el socio de catálogo más cercano (Haversine).
 * Uso: reclamos WhatsApp cooperativa eléctrica sin NIS/medidor (p. ej. anónimos) con pin o domicilio geocodificado.
 * made by leavera77
 */
import { query } from "../db/neon.js";
import { distanciaMetrosHaversine } from "./geocercaHaversine.js";

const DEFAULT_MAX_M = 1200;

let _sociosColsCache = null;

async function columnasSociosCatalogo() {
  if (_sociosColsCache) return _sociosColsCache;
  const r = await query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'socios_catalogo'`
  );
  _sociosColsCache = new Set((r.rows || []).map((c) => c.column_name));
  return _sociosColsCache;
}

function sqlLatExpr(cols, alias = "s") {
  const a = `${alias}.`;
  const parts = [];
  if (cols.has("latitud")) parts.push(`${a}latitud::numeric`);
  if (cols.has("lat")) parts.push(`${a}lat::numeric`);
  if (!parts.length) return null;
  return parts.length === 1 ? parts[0] : `COALESCE(${parts.join(", ")})`;
}

function sqlLngExpr(cols, alias = "s") {
  const a = `${alias}.`;
  const parts = [];
  if (cols.has("longitud")) parts.push(`${a}longitud::numeric`);
  if (cols.has("lng")) parts.push(`${a}lng::numeric`);
  if (!parts.length) return null;
  return parts.length === 1 ? parts[0] : `COALESCE(${parts.join(", ")})`;
}

function coordsOk(la, lo) {
  const a = la != null ? Number(la) : NaN;
  const b = lo != null ? Number(lo) : NaN;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (Math.abs(a) < 1e-6 && Math.abs(b) < 1e-6) return false;
  if (Math.abs(a) > 90 || Math.abs(b) > 180) return false;
  return true;
}

function maxDistanceMeters(override) {
  const raw = override ?? process.env.PEDIDO_WA_INFRA_PROXIMIDAD_MAX_M ?? DEFAULT_MAX_M;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 50 && n <= 15000 ? n : DEFAULT_MAX_M;
}

/**
 * @param {{ tenantId: number, lat: number, lng: number, maxDistanceMeters?: number }} p
 * @returns {Promise<{ distribuidor: string|null, trafo: string|null, socioId: number|null, distanceM: number|null }>}
 */
export async function lookupDistribuidorTrafoPorProximidadSocio(p) {
  const tid = Number(p.tenantId);
  const la = Number(p.lat);
  const lo = Number(p.lng);
  if (!Number.isFinite(tid) || tid < 1 || !coordsOk(la, lo)) {
    return { distribuidor: null, trafo: null, socioId: null, distanceM: null };
  }

  const maxM = maxDistanceMeters(p.maxDistanceMeters);
  let cols;
  try {
    cols = await columnasSociosCatalogo();
  } catch {
    return { distribuidor: null, trafo: null, socioId: null, distanceM: null };
  }

  const latExpr = sqlLatExpr(cols, "s");
  const lngExpr = sqlLngExpr(cols, "s");
  if (!latExpr || !lngExpr) {
    return { distribuidor: null, trafo: null, socioId: null, distanceM: null };
  }

  const delta = (maxM / 111000) * 1.35;
  const params = [la - delta, la + delta, lo - delta, lo + delta];
  const tenantCol = cols.has("tenant_id") ? "tenant_id" : cols.has("cliente_id") ? "cliente_id" : null;
  let tenantFilter = "";
  if (tenantCol) {
    params.push(tid);
    tenantFilter = ` AND s.${tenantCol} = $${params.length}`;
  }

  let rows = [];
  try {
    const r = await query(
      `SELECT s.id, s.distribuidor_codigo, s.transformador, ${latExpr} AS la, ${lngExpr} AS lo
       FROM socios_catalogo s
       WHERE COALESCE(s.activo, TRUE) = TRUE
         AND (${latExpr}) BETWEEN $1::numeric AND $2::numeric
         AND (${lngExpr}) BETWEEN $3::numeric AND $4::numeric
         AND (
           NULLIF(TRIM(COALESCE(s.distribuidor_codigo::text, '')), '') IS NOT NULL
           OR NULLIF(TRIM(COALESCE(s.transformador::text, '')), '') IS NOT NULL
         )
         ${tenantFilter}
       LIMIT 500`,
      params
    );
    rows = r.rows || [];
  } catch (e) {
    console.warn("[pedido-infra-proximidad] query", e?.message || e);
    return { distribuidor: null, trafo: null, socioId: null, distanceM: null };
  }

  let best = null;
  let bestD = Infinity;
  for (const row of rows) {
    const sla = Number(row.la);
    const slo = Number(row.lo);
    if (!coordsOk(sla, slo)) continue;
    const d = distanciaMetrosHaversine(la, lo, sla, slo);
    if (d > maxM || d >= bestD) continue;
    bestD = d;
    best = row;
  }

  if (!best) {
    return { distribuidor: null, trafo: null, socioId: null, distanceM: null };
  }

  return {
    distribuidor:
      best.distribuidor_codigo != null ? String(best.distribuidor_codigo).trim() || null : null,
    trafo: best.transformador != null ? String(best.transformador).trim() || null : null,
    socioId: best.id != null ? Number(best.id) : null,
    distanceM: Math.round(bestD),
  };
}
