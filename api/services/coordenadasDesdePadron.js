/**
 * Busca coordenadas ya cargadas en el padrón (sin Nominatim).
 * Orden: mismo calle+localidad → mismo CP/barrio+localidad (si existen columnas).
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

function tryRow(row) {
  const la = row?.la != null ? Number(row.la) : NaN;
  const lo = row?.lo != null ? Number(row.lo) : NaN;
  if (!coordsOk(la, lo)) return null;
  return { lat: la, lng: lo };
}

/**
 * @param {object} p
 * @param {number} p.tenantId
 * @param {string} p.calle
 * @param {string} [p.localidad]
 * @param {string} [p.codigoPostal]
 * @param {string} [p.barrio]
 * @returns {Promise<{ lat: number, lng: number, fuente: string } | null>}
 */
export async function getCoordinatesFromPadron(p) {
  const tid = Number(p.tenantId);
  const calle = String(p.calle || "").trim();
  const loc = String(p.localidad || "").trim();
  const cp = p.codigoPostal != null ? String(p.codigoPostal).trim() : "";
  const bar = p.barrio != null ? String(p.barrio).trim() : "";
  if (!Number.isFinite(tid) || tid < 1 || calle.length < 2) return null;

  if (await tableExists("socios_catalogo")) {
    const cols = await columnas("socios_catalogo");
    const latX = sqlLatExpr(cols, "s");
    const lngX = sqlLngExpr(cols, "s");
    if (latX && lngX && cols.has("calle")) {
      const tenantCol = cols.has("cliente_id")
        ? "cliente_id"
        : cols.has("tenant_id")
          ? "tenant_id"
          : null;

      const params1 = [calle];
      let cond1 = `COALESCE(s.activo, TRUE) = TRUE
          AND UPPER(TRIM(COALESCE(s.calle,''))) = UPPER(TRIM($1))
          AND ${latX} IS NOT NULL AND ${lngX} IS NOT NULL
          AND ABS(${latX}) > 0.00001 AND ABS(${lngX}) > 0.00001`;
      let n1 = 2;
      if (loc.length >= 2 && cols.has("localidad")) {
        cond1 += ` AND UPPER(TRIM(COALESCE(s.localidad,''))) = UPPER(TRIM($${n1}))`;
        params1.push(loc);
        n1++;
      }
      if (tenantCol) {
        cond1 += ` AND (s.${tenantCol} IS NULL OR s.${tenantCol} = $${n1})`;
        params1.push(tid);
      }
      const r = await query(
        `SELECT ${latX} AS la, ${lngX} AS lo FROM socios_catalogo s WHERE ${cond1} LIMIT 1`,
        params1
      );
      const hit = tryRow(r.rows?.[0]);
      if (hit) return { ...hit, fuente: "socios_catalogo_calle_localidad" };

      if (cp.length >= 2 && cols.has("codigo_postal")) {
        const pCp = [cp];
        let cCp = `COALESCE(s.activo, TRUE) = TRUE
             AND UPPER(TRIM(COALESCE(s.codigo_postal::text,''))) = UPPER(TRIM($1))
             AND ${latX} IS NOT NULL AND ${lngX} IS NOT NULL`;
        let nc = 2;
        if (loc.length >= 2 && cols.has("localidad")) {
          cCp += ` AND UPPER(TRIM(COALESCE(s.localidad,''))) = UPPER(TRIM($${nc}))`;
          pCp.push(loc);
          nc++;
        }
        if (tenantCol) {
          cCp += ` AND (s.${tenantCol} IS NULL OR s.${tenantCol} = $${nc})`;
          pCp.push(tid);
        }
        const r2 = await query(
          `SELECT ${latX} AS la, ${lngX} AS lo FROM socios_catalogo s WHERE ${cCp} LIMIT 1`,
          pCp
        );
        const hit2 = tryRow(r2.rows?.[0]);
        if (hit2) return { ...hit2, fuente: "socios_catalogo_codigo_postal" };
      }
      if (bar.length >= 2 && cols.has("barrio")) {
        const pB = [bar];
        let cB = `COALESCE(s.activo, TRUE) = TRUE
             AND UPPER(TRIM(COALESCE(s.barrio,''))) = UPPER(TRIM($1))
             AND ${latX} IS NOT NULL AND ${lngX} IS NOT NULL`;
        let nb = 2;
        if (loc.length >= 2 && cols.has("localidad")) {
          cB += ` AND UPPER(TRIM(COALESCE(s.localidad,''))) = UPPER(TRIM($${nb}))`;
          pB.push(loc);
          nb++;
        }
        if (tenantCol) {
          cB += ` AND (s.${tenantCol} IS NULL OR s.${tenantCol} = $${nb})`;
          pB.push(tid);
        }
        const r3 = await query(
          `SELECT ${latX} AS la, ${lngX} AS lo FROM socios_catalogo s WHERE ${cB} LIMIT 1`,
          pB
        );
        const hit3 = tryRow(r3.rows?.[0]);
        if (hit3) return { ...hit3, fuente: "socios_catalogo_barrio" };
      }
    }
  }

  if (await tableExists("clientes_finales")) {
    const cols = await columnas("clientes_finales");
    const latX = sqlLatExpr(cols, "c");
    const lngX = sqlLngExpr(cols, "c");
    if (latX && lngX && cols.has("calle")) {
      const paramsCf = [tid, calle];
      let condCf = `c.cliente_id = $1 AND COALESCE(c.activo, TRUE) = TRUE
          AND UPPER(TRIM(COALESCE(c.calle,''))) = UPPER(TRIM($2))
          AND ${latX} IS NOT NULL AND ${lngX} IS NOT NULL`;
      let ncf = 3;
      if (loc.length >= 2 && cols.has("localidad")) {
        condCf += ` AND UPPER(TRIM(COALESCE(c.localidad,''))) = UPPER(TRIM($${ncf}))`;
        paramsCf.push(loc);
        ncf++;
      }
      const r = await query(
        `SELECT ${latX} AS la, ${lngX} AS lo FROM clientes_finales c WHERE ${condCf} LIMIT 1`,
        paramsCf
      );
      const hit = tryRow(r.rows?.[0]);
      if (hit) return { ...hit, fuente: "clientes_finales_calle" };
    }
  }

  return null;
}
