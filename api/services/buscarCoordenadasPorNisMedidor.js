/**
 * Busca coordenadas corregidas manualmente en socios_catalogo por NIS/Medidor.
 * Esta función tiene prioridad absoluta sobre geocodificación para asegurar que
 * las ubicaciones corregidas por el admin persistan en nuevos pedidos del mismo cliente.
 * made by leavera77
 */
import { query } from "../db/neon.js";

function coordsOk(la, lo) {
  const a = la != null ? Number(la) : NaN;
  const b = lo != null ? Number(lo) : NaN;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (Math.abs(a) < 1e-6 && Math.abs(b) < 1e-6) return false;
  if (Math.abs(a) > 90 || Math.abs(b) > 180) return false;
  return true;
}

async function tableExists(name) {
  const r = await query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
    [name]
  );
  return r.rows.length > 0;
}

async function columnas(name) {
  const r = await query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    [name]
  );
  return new Set((r.rows || []).map((c) => c.column_name));
}

function sqlLatExpr(cols, alias) {
  const a = `${alias}.`;
  const parts = [];
  if (cols.has("latitud")) parts.push(`${a}latitud::numeric`);
  if (cols.has("lat")) parts.push(`${a}lat::numeric`);
  if (!parts.length) return null;
  return parts.length === 1 ? parts[0] : `COALESCE(${parts.join(", ")})`;
}

function sqlLngExpr(cols, alias) {
  const a = `${alias}.`;
  const parts = [];
  if (cols.has("longitud")) parts.push(`${a}longitud::numeric`);
  if (cols.has("lng")) parts.push(`${a}lng::numeric`);
  if (!parts.length) return null;
  return parts.length === 1 ? parts[0] : `COALESCE(${parts.join(", ")})`;
}

/**
 * Busca coordenadas en socios_catalogo por NIS, Medidor o NIS_Medidor.
 * Prioriza coordenadas marcadas como manuales (ubicacion_manual = TRUE).
 * @param {object} p
 * @param {number} p.tenantId
 * @param {string} [p.nis]
 * @param {string} [p.medidor]
 * @param {string} [p.nisMedidor]
 * @returns {Promise<{ lat: number, lng: number, fuente: string, esManual: boolean } | null>}
 */
export async function buscarCoordenadasPorNisMedidor(p) {
  const tid = Number(p.tenantId);
  if (!Number.isFinite(tid) || tid < 1) return null;

  const nisT = p.nis != null && String(p.nis).trim() ? String(p.nis).trim() : "";
  const medT = p.medidor != null && String(p.medidor).trim() ? String(p.medidor).trim() : "";
  const nmT = p.nisMedidor != null && String(p.nisMedidor).trim() ? String(p.nisMedidor).trim() : "";

  if (!nisT && !medT && !nmT) return null;

  if (!(await tableExists("socios_catalogo"))) return null;

  const cols = await columnas("socios_catalogo");
  const latX = sqlLatExpr(cols, "s");
  const lngX = sqlLngExpr(cols, "s");
  if (!latX || !lngX) return null;

  const tenantCol = cols.has("cliente_id")
    ? "cliente_id"
    : cols.has("tenant_id")
      ? "tenant_id"
      : null;
  const hasNis = cols.has("nis");
  const hasMed = cols.has("medidor");
  const hasNisMed = cols.has("nis_medidor");
  const hasUbicManual = cols.has("ubicacion_manual");

  if (!hasNis && !hasMed && !hasNisMed) return null;

  const conditions = [];
  const params = [];
  let pIdx = 1;

  if (nmT && hasNisMed) {
    conditions.push(`UPPER(TRIM(COALESCE(s.nis_medidor,''))) = UPPER(TRIM($${pIdx}))`);
    params.push(nmT);
    pIdx++;
  } else {
    if (nisT && hasNis) {
      conditions.push(`UPPER(TRIM(COALESCE(s.nis,''))) = UPPER(TRIM($${pIdx}))`);
      params.push(nisT);
      pIdx++;
    }
    if (medT && hasMed) {
      conditions.push(`UPPER(TRIM(COALESCE(s.medidor,''))) = UPPER(TRIM($${pIdx}))`);
      params.push(medT);
      pIdx++;
    }
  }

/**
 * Busca coordenadas en socios_catalogo por NIS, Medidor o NIS_Medidor.
 * Si no encuentra por identificadores, intenta match por dirección + nombre.
 * Prioriza coordenadas marcadas como manuales (ubicacion_manual = TRUE).
 * @param {object} p
 * @param {number} p.tenantId
 * @param {string} [p.nis]
 * @param {string} [p.medidor]
 * @param {string} [p.nisMedidor]
 * @param {string} [p.calle]
 * @param {string} [p.numero]
 * @param {string} [p.localidad]
 * @param {string} [p.nombreCliente]
 * @returns {Promise<{ lat: number, lng: number, fuente: string, esManual: boolean } | null>}
 */
export async function buscarCoordenadasPorNisMedidor(p) {
  const tid = Number(p.tenantId);
  if (!Number.isFinite(tid) || tid < 1) return null;

  const nisT = p.nis != null && String(p.nis).trim() ? String(p.nis).trim() : "";
  const medT = p.medidor != null && String(p.medidor).trim() ? String(p.medidor).trim() : "";
  const nmT = p.nisMedidor != null && String(p.nisMedidor).trim() ? String(p.nisMedidor).trim() : "";

  if (!(await tableExists("socios_catalogo"))) return null;

  const cols = await columnas("socios_catalogo");
  const latX = sqlLatExpr(cols, "s");
  const lngX = sqlLngExpr(cols, "s");
  if (!latX || !lngX) return null;

  const tenantCol = cols.has("cliente_id")
    ? "cliente_id"
    : cols.has("tenant_id")
      ? "tenant_id"
      : null;
  const hasNis = cols.has("nis");
  const hasMed = cols.has("medidor");
  const hasNisMed = cols.has("nis_medidor");
  const hasUbicManual = cols.has("ubicacion_manual");

  if (nisT || medT || nmT) {
    if (!hasNis && !hasMed && !hasNisMed) return null;

    const conditions = [];
    const params = [];
    let pIdx = 1;

    if (nmT && hasNisMed) {
      conditions.push(`UPPER(TRIM(COALESCE(s.nis_medidor,''))) = UPPER(TRIM($${pIdx}))`);
      params.push(nmT);
      pIdx++;
    } else {
      if (nisT && hasNis) {
        conditions.push(`UPPER(TRIM(COALESCE(s.nis,''))) = UPPER(TRIM($${pIdx}))`);
        params.push(nisT);
        pIdx++;
      }
      if (medT && hasMed) {
        conditions.push(`UPPER(TRIM(COALESCE(s.medidor,''))) = UPPER(TRIM($${pIdx}))`);
        params.push(medT);
        pIdx++;
      }
    }

    if (conditions.length > 0) {
      let sql = `SELECT ${latX} AS la, ${lngX} AS lo${hasUbicManual ? ", COALESCE(s.ubicacion_manual, FALSE) AS manual" : ""}
        FROM socios_catalogo s
        WHERE COALESCE(s.activo, TRUE) = TRUE
          AND (${conditions.join(" OR ")})
          AND ${latX} IS NOT NULL AND ${lngX} IS NOT NULL
          AND ABS(${latX}) > 0.00001 AND ABS(${lngX}) > 0.00001`;

      if (tenantCol) {
        sql += ` AND (s.${tenantCol} IS NULL OR s.${tenantCol} = $${pIdx})`;
        params.push(tid);
        pIdx++;
      }

      sql += hasUbicManual ? ` ORDER BY s.ubicacion_manual DESC NULLS LAST LIMIT 1` : ` LIMIT 1`;

      try {
        const r = await query(sql, params);
        const row = r.rows?.[0];
        if (row) {
          const la = Number(row.la);
          const lo = Number(row.lo);
          if (coordsOk(la, lo)) {
            const esManual = hasUbicManual && row.manual === true;
            return {
              lat: la,
              lng: lo,
              fuente: esManual ? "socios_catalogo_manual_corregido" : "socios_catalogo_nis_medidor",
              esManual,
            };
          }
        }
      } catch (e) {
        console.warn("[buscar-coords-nis-medidor]", e?.message || e);
      }
    }
  }

  const calleP = p.calle != null ? String(p.calle).trim() : "";
  const numP = p.numero != null ? String(p.numero).trim() : "";
  const locP = p.localidad != null ? String(p.localidad).trim() : "";
  const nomP = p.nombreCliente != null ? String(p.nombreCliente).trim() : "";

  if (calleP.length >= 2 && locP.length >= 2 && nomP.length >= 3 && 
      cols.has("calle") && cols.has("localidad") && cols.has("nombre")) {
    
    const params = [];
    let pIdx = 1;
    let t = "";
    if (tenantCol) {
      params.push(tid);
      t = ` AND (s.${tenantCol} IS NULL OR s.${tenantCol} = $${pIdx})`;
      pIdx++;
    }

    params.push(calleP, locP, nomP);
    const iCal = pIdx;
    const iLoc = pIdx + 1;
    const iNom = pIdx + 2;
    pIdx += 3;
    
    const numCond = numP && cols.has("numero") 
      ? ` AND UPPER(TRIM(COALESCE(s.numero::text,''))) = UPPER(TRIM($${pIdx}))` 
      : "";
    if (numP && cols.has("numero")) {
      params.push(numP);
      pIdx++;
    }

    const sql = `SELECT ${latX} AS la, ${lngX} AS lo${hasUbicManual ? ", COALESCE(s.ubicacion_manual, FALSE) AS manual" : ""}
      FROM socios_catalogo s
      WHERE COALESCE(s.activo, TRUE) = TRUE${t}
        AND UPPER(TRIM(COALESCE(s.calle::text,''))) = UPPER(TRIM($${iCal}))
        AND UPPER(TRIM(COALESCE(s.localidad::text,''))) = UPPER(TRIM($${iLoc}))
        AND UPPER(TRIM(COALESCE(s.nombre::text,''))) = UPPER(TRIM($${iNom}))${numCond}
        AND ${latX} IS NOT NULL AND ${lngX} IS NOT NULL
        AND ABS(${latX}) > 0.00001 AND ABS(${lngX}) > 0.00001
      ${hasUbicManual ? "ORDER BY s.ubicacion_manual DESC NULLS LAST" : ""}
      LIMIT 1`;

    try {
      const r = await query(sql, params);
      const row = r.rows?.[0];
      if (row) {
        const la = Number(row.la);
        const lo = Number(row.lo);
        if (coordsOk(la, lo)) {
          const esManual = hasUbicManual && row.manual === true;
          console.info("[buscar-coords-nis-medidor] match por dirección+nombre: socio encontrado");
          return {
            lat: la,
            lng: lo,
            fuente: esManual ? "socios_catalogo_manual_corregido_direccion" : "socios_catalogo_direccion_nombre",
            esManual,
          };
        }
      }
    } catch (e) {
      console.warn("[buscar-coords-nis-medidor] fallback dirección+nombre", e?.message || e);
    }
  }

  return null;
}
