/**
 * Listado admin de socios_catalogo por tenant (+ rubro activo). Sin datos_extra en el SELECT masivo.
 * made by leavera77
 */
import { query } from "../db/neon.js";
import { tableHasColumn } from "../utils/tenantScope.js";
import { sociosCatalogoWhereForApi } from "../utils/sociosCatalogScope.js";

const COLS =
  "id, nis_medidor, nis, medidor, nombre, calle, numero, barrio, telefono, distribuidor_codigo, localidad, provincia, codigo_postal, tipo_tarifa, urbano_rural, transformador, tipo_conexion, fases, latitud, longitud, activo";

/**
 * @param {unknown} val
 */
function parseDe(val) {
  if (val == null || val === "") return null;
  if (typeof val === "object" && !Array.isArray(val)) return val;
  if (typeof val === "string") {
    try {
      const p = JSON.parse(val);
      return p && typeof p === "object" && !Array.isArray(p) ? p : null;
    } catch (_) {
      return null;
    }
  }
  return null;
}

/**
 * @param {unknown[]} rows
 */
function extraKeysFromSample(rows) {
  const k = new Set();
  for (const row of rows) {
    const o = parseDe(row.datos_extra);
    if (!o) continue;
    for (const key of Object.keys(o)) {
      const nk = String(key || "").trim();
      if (nk) k.add(nk);
      if (k.size >= 28) break;
    }
    if (k.size >= 28) break;
  }
  return [...k].sort();
}

/**
 * @param {import('express').Request} req
 */
export async function listSociosCatalogoAdmin(req) {
  const { where, params } = await sociosCatalogoWhereForApi(req);
  const hasTenantId = await tableHasColumn("socios_catalogo", "tenant_id");
  const hasBusinessType = await tableHasColumn("socios_catalogo", "business_type");
  const hasDatosExtra = await tableHasColumn("socios_catalogo", "datos_extra");
  const colTid = hasTenantId ? ", tenant_id" : "";
  const colBt = hasBusinessType ? ", business_type" : "";
  const r = await query(
    `SELECT ${COLS}${colTid}${colBt} FROM socios_catalogo${where} ORDER BY nis_medidor`,
    params
  );
  const rows = r.rows || [];
  let extraKeys = [];
  if (hasDatosExtra && rows.length > 0 && where) {
    try {
      const sample = await query(
        `SELECT datos_extra FROM socios_catalogo${where} AND datos_extra IS NOT NULL AND datos_extra::text NOT IN ('{}','null') LIMIT 80`,
        params
      );
      extraKeys = extraKeysFromSample(sample.rows || []);
    } catch (_) {
      extraKeys = [];
    }
  }
  return { rows, extraKeys, total: rows.length };
}
