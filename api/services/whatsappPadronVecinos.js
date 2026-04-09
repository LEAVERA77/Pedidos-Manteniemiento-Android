/**
 * Fallback de coordenadas: mismo padrón, vecinos en la misma calle (±2 nº y luego ±50).
 * made by leavera77
 */

import { query } from "../db/neon.js";

const NOTA_INMEDIATO = "[Sistema] Ubicación estimada por proximidad (Socio sin GPS).";
const NOTA_MANZANA =
  "[Sistema] Ubicación estimada por proximidad — referencia en calle ±50 números (Socio sin GPS).";

export function parsePuertaEntera(numeroTexto) {
  const m = String(numeroTexto || "").match(/^\s*(\d+)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Paridad calle argentina: 500 → 498,502 · 501 → 499,503 */
export function numerosVecinosInmediatos(n) {
  const a = n - 2;
  const b = n + 2;
  return [a, b].filter((x) => x > 0);
}

function pickLatLngFromRow(row) {
  const la = row?.lat_pad != null ? Number(row.lat_pad) : NaN;
  const lo = row?.lng_pad != null ? Number(row.lng_pad) : NaN;
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  if (Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
  if (Math.abs(la) < 1e-6 && Math.abs(lo) < 1e-6) return null;
  return { lat: la, lng: lo };
}

function numPuertaSqlSocios(alias = "s") {
  return `(CASE
    WHEN SUBSTRING(TRIM(COALESCE(${alias}.numero,'')) FROM '^[0-9]+') ~ '^[0-9]+$'
    THEN SUBSTRING(TRIM(COALESCE(${alias}.numero,'')) FROM '^[0-9]+')::integer
    ELSE NULL
  END)`;
}

function numPuertaSqlCf(alias = "c") {
  return `(CASE
    WHEN SUBSTRING(TRIM(COALESCE(${alias}.numero_puerta::text,'')) FROM '^[0-9]+') ~ '^[0-9]+$'
    THEN SUBSTRING(TRIM(COALESCE(${alias}.numero_puerta::text,'')) FROM '^[0-9]+')::integer
    ELSE NULL
  END)`;
}

async function tableExists(name) {
  const r = await query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
    [name]
  );
  return r.rows.length > 0;
}

async function columnasTabla(name) {
  const r = await query(
    `SELECT column_name, data_type, udt_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [name]
  );
  const set = new Set((r.rows || []).map((c) => c.column_name));
  const types = {};
  for (const row of r.rows || []) types[row.column_name] = { dataType: row.data_type, udt: row.udt_name };
  return {
    set,
    types,
    has(col) {
      return set.has(col);
    },
  };
}

function sqlLatPadExpr(cols) {
  const parts = [];
  if (cols.has("latitud")) parts.push("latitud::numeric");
  if (cols.has("lat")) parts.push("lat::numeric");
  if (!parts.length) return "NULL::numeric AS lat_pad";
  return parts.length === 1 ? `${parts[0]} AS lat_pad` : `COALESCE(${parts.join(", ")}) AS lat_pad`;
}

function sqlLngPadExpr(cols) {
  const parts = [];
  if (cols.has("longitud")) parts.push("longitud::numeric");
  if (cols.has("lng")) parts.push("lng::numeric");
  if (!parts.length) return "NULL::numeric AS lng_pad";
  return parts.length === 1 ? `${parts[0]} AS lng_pad` : `COALESCE(${parts.join(", ")}) AS lng_pad`;
}

/** Punto PostgreSQL: [0] y [1] como posibles lat/lng; pickFromPointRow valida e intercambia si hace falta. */
function sqlPointToLatLngExpr(cols, alias = "s") {
  const candidates = ["coordenadas", "ubicacion", "punto", "geom", "location", "gps"];
  for (const c of candidates) {
    if (!cols.has(c)) continue;
    const t = cols.types[c];
    if (t && (t.udt === "point" || String(t.dataType).includes("point"))) {
      return `((${alias}.${c})[1])::numeric AS lng_from_point, ((${alias}.${c})[0])::numeric AS lat_from_point`;
    }
  }
  return null;
}

function pickFromPointRow(row) {
  const la = row?.lat_from_point != null ? Number(row.lat_from_point) : NaN;
  const lo = row?.lng_from_point != null ? Number(row.lng_from_point) : NaN;
  if (Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180) {
    if (Math.abs(la) < 1e-6 && Math.abs(lo) < 1e-6) return null;
    if (la < -20 && la > -56 && lo < -48 && lo > -74) return { lat: la, lng: lo };
    if (lo < -20 && lo > -56 && la < -48 && la > -74) return { lat: lo, lng: la };
  }
  return null;
}

async function buscarEnSociosVecinos(tid, calle, loc, nums, excludeNm, includePoint) {
  const scCols = await columnasTabla("socios_catalogo");
  const latExpr = sqlLatPadExpr(scCols.set);
  const lngExpr = sqlLngPadExpr(scCols.set);
  const pointSel = includePoint ? sqlPointToLatLngExpr(scCols, "s") : null;
  const tenantCol = scCols.set.has("cliente_id")
    ? "cliente_id"
    : scCols.set.has("tenant_id")
      ? "tenant_id"
      : null;
  const numExpr = numPuertaSqlSocios("s");
  const extraPoint = pointSel ? `, ${pointSel}` : "";
  const params = [calle, nums];
  let p = 3;
  let locSql = "";
  if (loc && loc.length >= 2) {
    locSql = ` AND UPPER(TRIM(COALESCE(s.localidad,''))) = UPPER(TRIM($${p}))`;
    params.push(loc);
    p++;
  }
  let exSql = "";
  if (excludeNm && String(excludeNm).trim()) {
    exSql = ` AND UPPER(TRIM(COALESCE(s.nis_medidor,''))) <> UPPER(TRIM($${p}))`;
    params.push(String(excludeNm).trim());
    p++;
  }
  let tenantSql = "";
  if (tenantCol) {
    tenantSql = ` AND (s.${tenantCol} IS NULL OR s.${tenantCol} = $${p})`;
    params.push(tid);
  }
  const sql = `SELECT ${latExpr}, ${lngExpr}${extraPoint}
     FROM socios_catalogo s
     WHERE COALESCE(s.activo, TRUE) = TRUE
       AND UPPER(TRIM(COALESCE(s.calle,''))) = UPPER(TRIM($1))
       AND ${numExpr} IS NOT NULL
       AND ${numExpr} = ANY($2::int[])
       ${locSql}${exSql}${tenantSql}
     LIMIT 5`;
  const r = await query(sql, params);
  for (const row of r.rows || []) {
    const p0 = pickFromPointRow(row);
    if (p0) return p0;
    const xy = pickLatLngFromRow(row);
    if (xy) return xy;
  }
  return null;
}

async function buscarEnSociosManzana(tid, calle, loc, nRef, excludeNm) {
  const scCols = await columnasTabla("socios_catalogo");
  const latExpr = sqlLatPadExpr(scCols.set);
  const lngExpr = sqlLngPadExpr(scCols.set);
  const pointSel = sqlPointToLatLngExpr(scCols, "s");
  const tenantCol = scCols.set.has("cliente_id")
    ? "cliente_id"
    : scCols.set.has("tenant_id")
      ? "tenant_id"
      : null;
  const numExpr = numPuertaSqlSocios("s");
  const extraPoint = pointSel ? `, ${pointSel}` : "";
  const lo = Math.max(1, nRef - 50);
  const hi = nRef + 50;
  const params = [calle, lo, hi, nRef];
  let p = 5;
  let locSql = "";
  if (loc && loc.length >= 2) {
    locSql = ` AND UPPER(TRIM(COALESCE(s.localidad,''))) = UPPER(TRIM($${p}))`;
    params.push(loc);
    p++;
  }
  let exSql = "";
  if (excludeNm && String(excludeNm).trim()) {
    exSql = ` AND UPPER(TRIM(COALESCE(s.nis_medidor,''))) <> UPPER(TRIM($${p}))`;
    params.push(String(excludeNm).trim());
    p++;
  }
  let tenantSql = "";
  if (tenantCol) {
    tenantSql = ` AND (s.${tenantCol} IS NULL OR s.${tenantCol} = $${p})`;
    params.push(tid);
  }
  const sql = `SELECT ${latExpr}, ${lngExpr}${extraPoint},
       ${numExpr} AS n_int
     FROM socios_catalogo s
     WHERE COALESCE(s.activo, TRUE) = TRUE
       AND UPPER(TRIM(COALESCE(s.calle,''))) = UPPER(TRIM($1))
       AND ${numExpr} IS NOT NULL
       AND ${numExpr} BETWEEN $2 AND $3
       ${locSql}${exSql}${tenantSql}
     ORDER BY ABS(${numExpr} - $4::int)
     LIMIT 3`;
  const r = await query(sql, params);
  for (const row of r.rows || []) {
    const p0 = pickFromPointRow(row);
    if (p0) return p0;
    const xy = pickLatLngFromRow(row);
    if (xy) return xy;
  }
  return null;
}

async function buscarEnCfVecinos(tid, calle, loc, nums, excludeId) {
  if (!(await tableExists("clientes_finales"))) return null;
  const cfCols = await columnasTabla("clientes_finales");
  const latExpr = sqlLatPadExpr(cfCols.set);
  const lngExpr = sqlLngPadExpr(cfCols.set);
  const numExpr = numPuertaSqlCf("c");
  const params = [tid, calle, nums];
  let p = 4;
  let locSql = "";
  if (loc && loc.length >= 2) {
    locSql = ` AND UPPER(TRIM(COALESCE(c.localidad,''))) = UPPER(TRIM($${p}))`;
    params.push(loc);
    p++;
  }
  let exSql = "";
  if (excludeId != null && Number.isFinite(Number(excludeId))) {
    exSql = ` AND c.id <> $${p}`;
    params.push(Number(excludeId));
  }
  const sql = `SELECT ${latExpr}, ${lngExpr}
     FROM clientes_finales c
     WHERE c.cliente_id = $1 AND COALESCE(c.activo, TRUE) = TRUE
       AND UPPER(TRIM(COALESCE(c.calle,''))) = UPPER(TRIM($2))
       AND ${numExpr} IS NOT NULL
       AND ${numExpr} = ANY($3::int[])
       ${locSql}${exSql}
     LIMIT 5`;
  const r = await query(sql, params);
  for (const row of r.rows || []) {
    const xy = pickLatLngFromRow(row);
    if (xy) return xy;
  }
  return null;
}

async function buscarEnCfManzana(tid, calle, loc, nRef, excludeId) {
  if (!(await tableExists("clientes_finales"))) return null;
  const cfCols = await columnasTabla("clientes_finales");
  const latExpr = sqlLatPadExpr(cfCols.set);
  const lngExpr = sqlLngPadExpr(cfCols.set);
  const numExpr = numPuertaSqlCf("c");
  const lo = Math.max(1, nRef - 50);
  const hi = nRef + 50;
  const params = [tid, calle, lo, hi, nRef];
  let p = 6;
  let locSql = "";
  if (loc && loc.length >= 2) {
    locSql = ` AND UPPER(TRIM(COALESCE(c.localidad,''))) = UPPER(TRIM($${p}))`;
    params.push(loc);
    p++;
  }
  let exSql = "";
  if (excludeId != null && Number.isFinite(Number(excludeId))) {
    exSql = ` AND c.id <> $${p}`;
    params.push(Number(excludeId));
  }
  const sql = `SELECT ${latExpr}, ${lngExpr}
     FROM clientes_finales c
     WHERE c.cliente_id = $1 AND COALESCE(c.activo, TRUE) = TRUE
       AND UPPER(TRIM(COALESCE(c.calle,''))) = UPPER(TRIM($2))
       AND ${numExpr} IS NOT NULL
       AND ${numExpr} BETWEEN $3 AND $4
       ${locSql}${exSql}
     ORDER BY ABS(${numExpr} - $5::int)
     LIMIT 3`;
  const r = await query(sql, params);
  for (const row of r.rows || []) {
    const xy = pickLatLngFromRow(row);
    if (xy) return xy;
  }
  return null;
}

/**
 * @param {object} opts
 * @param {number} opts.tenantId
 * @param {string} opts.calle
 * @param {string|null} opts.localidad
 * @param {string|null} opts.numeroTexto
 * @param {string|null} opts.excludeNisMedidor
 * @param {number|null} opts.excludeClienteFinalId
 * @param {'socios_catalogo'|'clientes_finales'|null} opts.preferTable
 * @returns {Promise<{ lat: number, lng: number, nota: string }|null>}
 */
export async function buscarCoordenadasVecinosMismaCalle(opts) {
  const tid = Number(opts.tenantId);
  if (!Number.isFinite(tid) || tid < 1) return null;
  const calle = String(opts.calle || "").trim();
  const loc = opts.localidad != null ? String(opts.localidad).trim() : "";
  const n = parsePuertaEntera(opts.numeroTexto);
  if (!calle || n == null) return null;

  const excludeNm = opts.excludeNisMedidor != null ? String(opts.excludeNisMedidor).trim() : "";
  const excludeCf = opts.excludeClienteFinalId != null ? Number(opts.excludeClienteFinalId) : null;
  const prefer = opts.preferTable || "socios_catalogo";
  const order = prefer === "clientes_finales" ? ["cf", "socios"] : ["socios", "cf"];

  const inmediatos = numerosVecinosInmediatos(n);
  const hasSocios = await tableExists("socios_catalogo");

  for (const src of order) {
    if (src === "socios" && hasSocios) {
      try {
        const hit = await buscarEnSociosVecinos(tid, calle, loc, inmediatos, excludeNm, true);
        if (hit) return { lat: hit.lat, lng: hit.lng, nota: NOTA_INMEDIATO };
      } catch (e) {
        console.warn("[whatsapp-padron-vecinos] socios vecinos inmediatos", e?.message || e);
      }
    }
    if (src === "cf") {
      try {
        const hit = await buscarEnCfVecinos(tid, calle, loc, inmediatos, excludeCf);
        if (hit) return { lat: hit.lat, lng: hit.lng, nota: NOTA_INMEDIATO };
      } catch (e) {
        console.warn("[whatsapp-padron-vecinos] cf vecinos inmediatos", e?.message || e);
      }
    }
  }

  for (const src of order) {
    if (src === "socios" && hasSocios) {
      try {
        const hit = await buscarEnSociosManzana(tid, calle, loc, n, excludeNm);
        if (hit) return { lat: hit.lat, lng: hit.lng, nota: NOTA_MANZANA };
      } catch (e) {
        console.warn("[whatsapp-padron-vecinos] socios manzana", e?.message || e);
      }
    }
    if (src === "cf") {
      try {
        const hit = await buscarEnCfManzana(tid, calle, loc, n, excludeCf);
        if (hit) return { lat: hit.lat, lng: hit.lng, nota: NOTA_MANZANA };
      } catch (e) {
        console.warn("[whatsapp-padron-vecinos] cf manzana", e?.message || e);
      }
    }
  }

  return null;
}
