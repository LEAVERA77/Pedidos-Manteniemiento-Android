/**
 * Export tabla distribuidores (tenant) → Excel con columnas físicas presentes.
 * made by leavera77
 */

import XLSX from "xlsx";
import { tableHasColumn } from "../utils/tenantScope.js";

/**
 * @param {Array<Record<string, unknown>>} rows
 * @param {string[]} colNames
 * @returns {Buffer}
 */
export function buildDistribuidoresCatalogoExcelBuffer(rows, colNames) {
  const headers = colNames.length ? colNames : ["codigo", "nombre", "tension", "localidad", "activo"];
  const data = (rows || []).map((r) => {
    const o = {};
    for (const h of headers) o[h] = r[h] ?? "";
    return o;
  });
  const ws = XLSX.utils.json_to_sheet(data, { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "distribuidores");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

import { query } from "../db/neon.js";

/**
 * @param {number} tenantId
 */
export async function fetchDistribuidoresCatalogoExportRows(tenantId) {
  const hasTid = await tableHasColumn("distribuidores", "tenant_id");
  const cols = ["id", "codigo", "nombre", "tension"];
  if (await tableHasColumn("distribuidores", "localidad")) cols.push("localidad");
  if (await tableHasColumn("distribuidores", "activo")) cols.push("activo");
  if (await tableHasColumn("distribuidores", "trafos")) cols.push("trafos");
  if (await tableHasColumn("distribuidores", "kva_saidi")) cols.push("kva_saidi");
  if (await tableHasColumn("distribuidores", "clientes_saidi")) cols.push("clientes_saidi");
  if (hasTid) cols.push("tenant_id");
  const select = cols.join(", ");
  const r = hasTid
    ? await query(`SELECT ${select} FROM distribuidores WHERE tenant_id = $1 ORDER BY codigo`, [tenantId])
    : await query(`SELECT ${select} FROM distribuidores ORDER BY codigo`);
  return { rows: r.rows || [], colNames: cols };
}
